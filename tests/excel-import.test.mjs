import test from "node:test";
import assert from "node:assert/strict";
import Excel from "exceljs";
import { prepareImport, expandTeaching } from "../src/services/excel-format.js";
import {
  makeWorkbook,
  readExcelFile,
  rowsToObjects,
  parseCSV,
} from "../src/services/excel-files.js";
import { canImport, canEditCalendar } from "../src/auth/permissions.js";
import { teachingConflicts, calendarDropTime } from "../src/utils/schedule.js";

test("Calendar drag snaps to 15 minutes using grab offset and rejects crossing midnight", () => {
  assert.equal(calendarDropTime(480, 144 + 35, 35, 120), "10:00");
  assert.equal(calendarDropTime(480, 164 + 35, 35, 120), "10:15");
  assert.equal(calendarDropTime(480, 0, 30, 120), "07:30");
  assert.equal(calendarDropTime(0, 0, 30, 120), null);
  assert.equal(calendarDropTime(480, 1000, 0, 180), null);
});
globalThis.ExcelJS = Excel;
const course = {
  id: "c1",
  title: "Ekonomija",
  instructorUid: "teacher",
  instructorName: "Nastavnik A",
};
const base = {
  name: "calendarEvents",
  role: "profesor",
  uid: "teacher",
  profile: { name: "Nastavnik A" },
  courses: [course],
  existing: [],
};
const row = {
  courseId: "c1",
  title: "Ekonomija",
  date: "2026-10-19",
  time: "10:00",
  endTime: "11:30",
  room: "PAR",
  repeat: "Tjedno",
  repeatUntil: "2026-11-02",
  study: "Poslovanje",
  group: "1A",
};
test("Excel teaching import expands recurrence/exceptions, binds teacher identity and detects repeats", async () => {
  const plan = await prepareImport({
    ...base,
    rows: [{ ...row, exceptions: "26.10.2026." }],
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[1].data.date, "2026-11-02");
  assert.equal(plan[0].data.instructorUid, "teacher");
  assert.ok(plan[0].data.seriesId);
  const existing = plan.map((p) => ({ ...p.data, id: p.id }));
  const again = await prepareImport({
    ...base,
    existing,
    rows: [{ ...row, exceptions: "26.10.2026." }],
  });
  assert.ok(again.every((p) => p.action === "skip"));
  const update = await prepareImport({
    ...base,
    existing,
    mode: "update",
    rows: [{ ...row, exceptions: "26.10.2026." }],
  });
  assert.ok(update.every((p) => p.action === "update"));
});
test("Import reports whole bad series, teacher and group collisions and rejects foreign ownership", async () => {
  const existing = [
    {
      ...row,
      id: "old",
      courseId: "c2",
      title: "Drugi kolegij",
      date: "2026-10-26",
      room: "OTHER",
      instructorUid: "teacher",
    },
  ];
  const bad = await prepareImport({ ...base, existing, rows: [row] });
  assert.equal(bad.length, 1);
  assert.match(bad[0].error, /Zauzeto/);
  const wrong = await prepareImport({ ...base, uid: "other", rows: [row] });
  assert.match(wrong[0].error, /dodijeljen/);
  const forged = await prepareImport({
    ...base,
    rows: [{ ...row, instructorUid: "other" }],
  });
  assert.match(forged[0].error, /Nepoznati/);
  assert.equal(
    teachingConflicts([{ ...row, id: "x", instructorUid: "other" }], {
      ...row,
      room: "OTHER",
    }).length,
    1,
  );
  assert.throws(() => expandTeaching(row, { repeat: "Tjedno" }));
});
test("Student Excel import preserves leading-zero JMBAG, matches updates and allows no login UID", async () => {
  const input = {
    name: "Ana Test",
    jmbag: "0012345678",
    email: "ana@example.test",
    departmentId: "business",
    year: 1,
    status: "Redovni",
  };
  const opts = {
    name: "students",
    role: "admin",
    uid: "admin",
    profile: {},
    rows: [input],
    existing: [],
  };
  const first = await prepareImport(opts);
  assert.equal(first[0].data.jmbag, "0012345678");
  assert.equal(first[0].error, undefined);
  const again = await prepareImport({
    ...opts,
    existing: [
      { ...first[0].data, id: "old", ownerUid: "linked-account", gpa: 4 },
    ],
    mode: "update",
  });
  assert.equal(again[0].id, "old");
  assert.equal(again[0].data.ownerUid, "linked-account");
  assert.equal(again[0].data.gpa, 4);
  const duplicate = await prepareImport({ ...opts, rows: [input, input] });
  assert.match(duplicate.at(-1).error, /Dupli/);
  await assert.rejects(
    () => prepareImport({ ...opts, role: "student" }),
    /ovlasti/,
  );
});
test("Real XLSX template round-trip, CSV semicolon/quotes and formula rejection", async () => {
  const book = makeWorkbook(Excel, "calendarEvents", "profesor", {
      courseId: ["c1"],
    }),
    sheet = book.getWorksheet("Podaci");
  sheet.addRow({}); // validation creates empty rows: populate row 2 by header instead
  for (let c = 1; c <= sheet.columnCount; c++) {
    const key = sheet.getCell(1, c).value;
    if (row[key] !== undefined) sheet.getCell(2, c).value = row[key];
  }
  const file = new File([await book.xlsx.writeBuffer()], "test.xlsx");
  const parsed = await readExcelFile(file);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].courseId, "c1");
  assert.equal((await prepareImport({ ...base, rows: parsed })).length, 3);
  sheet.getCell(2, 2).value = { formula: "1+1", result: 2 };
  await assert.rejects(
    async () =>
      readExcelFile(new File([await book.xlsx.writeBuffer()], "test.xlsx")),
    /formula/,
  );
  assert.deepEqual(
    rowsToObjects(parseCSV('name;jmbag\n"Ana; Test";0012345678')),
    [{ name: "Ana; Test", jmbag: "0012345678" }],
  );
  assert.throws(() =>
    rowsToObjects([
      ["id", "id"],
      ["a", "b"],
    ]),
  );
});
test("Import permission matrix and calendar ownership stay scoped", () => {
  assert.equal(canImport("admin", "users"), true);
  assert.equal(canImport("profesor", "calendarEvents"), true);
  assert.equal(canImport("profesor", "students"), false);
  assert.equal(canImport("lab_assistant", "labs"), true);
  assert.equal(canImport("student", "calendarEvents"), false);
  assert.equal(canEditCalendar("profesor", "a", { instructorUid: "b" }), false);
});
