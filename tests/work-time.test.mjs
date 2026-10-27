import { test } from "node:test";
import assert from "node:assert/strict";
import Excel from "exceljs";
import {
  workValues,
  workPeriod,
  workMatrix,
  workConflicts,
} from "../src/utils/work-time.js";
import {
  buildWorkWorkbook,
  parseWorkWorkbook,
  prepareWorkTableImport,
} from "../src/services/work-excel.js";
import {
  canRead,
  canManage,
  canImport,
  scopeFor,
} from "../src/auth/permissions.js";
import { roleNavigation, moduleAvailable } from "../src/auth/navigation.js";
import { DemoRecords } from "../src/services/demo.js";

const person = { ownerUid: "worker", ownerName: "Test zaposlenik" };
const row = {
  ...person,
  id: "one",
  category: "Studij",
  activity: "Predavanje",
  description: "Tema",
  date: "2026-10-26",
  hours: 2,
  startTime: "08:00",
  endTime: "10:00",
  projectId: "",
};
test("Work hours are computed in 24-hour format and reject partial and reverse intervals", () => {
  assert.equal(
    workValues({ startTime: "15:45", endTime: "17:15", hours: 8 }).hours,
    1.5,
  );
  assert.equal(workValues({ hours: "3.5" }).hours, 3.5);
  assert.throws(() => workValues({ startTime: "08:00", hours: 1 }));
  assert.throws(() => workValues({ startTime: "18:00", endTime: "08:00" }));
  assert.throws(() => workValues({ hours: 25 }));
  assert.equal(
    workConflicts([row], { ...row, startTime: "10:00", endTime: "11:00" })
      .length,
    0,
  );
  assert.equal(
    workConflicts([row], { ...row, startTime: "09:00", endTime: "11:00" })
      .length,
    1,
  );
  assert.equal(workConflicts([row], { ...row, ownerUid: "another" }).length, 0);
});
test("Periods cover Monday–Sunday and leap months; plans are counted once independently of actuals", () => {
  assert.equal(workPeriod("2026-01-01", "week").start, "2025-12-29");
  assert.equal(workPeriod("2024-02-12", "month").days.length, 29);
  const rows = workMatrix(
    [
      row,
      {
        ...row,
        id: "two",
        date: "2026-10-27",
        category: "Nastava",
        hours: 1.5,
      },
      { ...row, ownerUid: "other", hours: 10 },
    ],
    [{ ...row, month: "2026-10", plannedHours: 5 }],
    workPeriod(row.date, "month").days,
    "worker",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planned, 5);
  assert.equal(rows[0].actual, 3.5);
  assert.equal(rows[0].days["2026-10-26"], 2);
  assert.equal(
    workMatrix([row], [], workPeriod(row.date, "month").days, "worker")[0]
      .planned,
    null,
  );
});
test("Only admins and PAR office can read, edit, import or access work entries and plans", () => {
  for (const role of [
    "admin",
    "administracija_par",
    "profesor",
    "dept_head",
    "lab_assistant",
    "student",
    "alumni",
  ]) {
    const allowed = ["admin", "administracija_par"].includes(role);
    for (const module of ["workEntries", "workPlans"]) {
      assert.equal(canRead(role, module), allowed);
      assert.equal(canManage(role, module), allowed);
      assert.equal(canImport(role, module), allowed);
    }
    assert.equal(moduleAvailable(role, "workEntries"), allowed);
    if (role !== "admin") assert.deepEqual(roleNavigation(role).more, []);
  }
  assert.equal(scopeFor("administracija_par", "workEntries"), null);
});
test("Year workbook matches the monthly matrix with day columns, formulas and no double counting", async () => {
  const book = buildWorkWorkbook(Excel, {
    year: 2026,
    ...person,
    entries: [row],
    plans: [
      {
        ...person,
        month: "2026-10",
        category: "Studij",
        activity: "Predavanje",
        plannedHours: 5,
      },
    ],
  });
  assert.equal(book.worksheets.length, 12);
  const october = book.getWorksheet("Listopad");
  assert.equal(october.getCell("C5").value, 1);
  assert.equal(october.getCell("AG5").value, 31);
  assert.equal(october.getCell("A7").value, "Predavanje");
  assert.equal(october.getCell("B7").value, 5);
  assert.equal(october.getCell("AB7").value, 2);
  assert.equal(october.getCell("AH7").value.result, 2);
  assert.equal(october.getCell("AI7").value.result, 3);
  assert.equal(october.pageSetup.orientation, "landscape");
  const reopened = new Excel.Workbook();
  await reopened.xlsx.load(await book.xlsx.writeBuffer());
  const parsed = parseWorkWorkbook(reopened, 2026, person);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.plans.length, 1);
  assert.equal(parsed.entries[0].hours, 2);
  assert.equal(parsed.plans[0].plannedHours, 5);
});
test("Import skips slashes and total rows and rejects nonnumeric or unnamed activities", () => {
  const book = new Excel.Workbook(),
    sheet = book.addWorksheet("Siječanj");
  sheet.getCell("A4").value = "PROJEKTI / AKTIVNOSTI";
  sheet.getCell("A6").value = "Projekti";
  sheet.getCell("A7").value = "Test";
  sheet.getCell("B7").value = 4;
  sheet.getCell("C7").value = "/";
  sheet.getCell("D7").value = 2;
  sheet.getCell("A8").value = "UKUPNO";
  sheet.getCell("D8").value = 99;
  let parsed = parseWorkWorkbook(book, 2026, person);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].date, "2026-01-02");
  assert.equal(parsed.plans.length, 1);
  sheet.getCell("D7").value = "neispravno";
  parsed = parseWorkWorkbook(book, 2026, person);
  assert.equal(parsed.errors.length, 1);
});
test("Reimport preserves existing timed records and project references; changed aggregate hours require review", async () => {
  const projectRow = { ...row, projectId: "EU4Dual" };
  const book = buildWorkWorkbook(Excel, {
    year: 2026,
    ...person,
    entries: [projectRow],
    plans: [],
  });
  const reopened = new Excel.Workbook();
  await reopened.xlsx.load(await book.xlsx.writeBuffer());
  const parsed = parseWorkWorkbook(reopened, 2026, person);
  assert.equal(parsed.entries[0].projectId, "EU4Dual");
  let preview = prepareWorkTableImport(parsed, [projectRow], []);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.actions[0].skip, true);
  parsed.entries[0].hours = 4;
  preview = prepareWorkTableImport(parsed, [projectRow], []);
  assert.equal(preview.errors.length, 1);
  const summary = { ...projectRow, startTime: undefined, endTime: undefined };
  preview = prepareWorkTableImport(parsed, [summary], []);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.actions[0].id, row.id);
});
test("Office can maintain another employee's work record in demo; other roles cannot", async () => {
  const data = { workEntries: [], workPlans: [], auditLog: [], archive: [] };
  const repository = new DemoRecords(
    data,
    { uid: "office" },
    { role: "administracija_par", active: true },
  );
  await repository.save("workEntries", row, row.id);
  assert.equal((await repository.listAll("workEntries"))[0].ownerUid, "worker");
  await repository.save(
    "workEntries",
    { ...row, hours: 1, endTime: "09:00" },
    row.id,
  );
  assert.equal((await repository.listAll("workEntries"))[0].hours, 1);
  const teacher = new DemoRecords(
    data,
    { uid: "worker" },
    { role: "profesor", active: true },
  );
  await assert.rejects(() => teacher.listAll("workEntries"));
  await assert.rejects(() => teacher.save("workEntries", row));
});
