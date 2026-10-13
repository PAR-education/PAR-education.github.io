import test from "node:test";
import assert from "node:assert/strict";
import {
  roles,
  canRead,
  canManage,
  isActiveProfile,
  scopeFor,
} from "../src/auth/permissions.js";
import { validateFields } from "../src/utils/validation.js";
import { escapeHTML } from "../src/utils/helpers.js";
import { modules } from "../src/modules/catalog.js";
import { DemoRecords } from "../src/services/demo.js";
import { tuitionInstallments } from "../src/utils/tuition.js";
import { csvContent, printReport } from "../src/components/export.js";
test("Only recognized roles with an active profile can enter", () => {
  for (const role of Object.keys(roles))
    assert.equal(isActiveProfile({ role, active: true }), true);
  for (const profile of [
    null,
    {},
    { role: "admin" },
    { role: "admin", active: "true" },
    { role: "__proto__", active: true },
    { role: "superadmin", active: true },
  ])
    assert.equal(isActiveProfile(profile), false);
});
test("Students cannot manage profiles, finances, people or grades", () => {
  for (const name of ["users", "students", "employees", "finances", "grades"])
    assert.equal(canManage("student", name), false);
  assert.equal(canRead("student", "students"), false);
  assert.equal(canRead("alumni", "grades"), false);
  assert.equal(canRead("lab_assistant", "finances"), false);
  assert.equal(canRead(null, "courses"), false);
  assert.equal(canRead("admin", "__proto__"), false);
  assert.equal(canManage("admin", "__proto__"), false);
});
test("Scope matches department, instructor and owner queries", () => {
  assert.equal(scopeFor("student", "grades"), "ownerUid");
  assert.equal(scopeFor("profesor", "grades"), "instructorUid");
  assert.equal(scopeFor("dept_head", "students"), "departmentId");
  assert.equal(scopeFor("lab_assistant", "labBookings"), null);
  assert.equal(scopeFor("admin", "finances"), null);
});
test("Input cannot inject HTML into record templates", () => {
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
  assert.equal(escapeHTML("'&"), "&#39;&amp;");
});
test("Numeric, text, option, URL and date validation rejects invalid data", () => {
  assert.throws(() =>
    validateFields(
      [
        {
          key: "grade",
          label: "Grade",
          type: "number",
          required: true,
          min: 1,
          max: 5,
          integer: true,
        },
      ],
      { grade: 6 },
    ),
  );
  assert.throws(() =>
    validateFields(
      [
        {
          key: "grade",
          label: "Grade",
          type: "number",
          required: true,
          min: 1,
          max: 5,
          integer: true,
        },
      ],
      { grade: 3.5 },
    ),
  );
  assert.throws(() =>
    validateFields([{ key: "title", label: "Title", required: true }], {
      title: "   ",
    }),
  );
  assert.throws(() =>
    validateFields([{ key: "url", label: "URL", type: "url" }], {
      url: "javascript:alert(1)",
    }),
  );
  assert.throws(() =>
    validateFields([{ key: "status", label: "Status", options: ["Pending"] }], {
      status: "Approved",
    }),
  );
  assert.throws(() =>
    validateFields(
      [
        { key: "startDate", label: "Start", type: "date" },
        { key: "endDate", label: "End", type: "date" },
      ],
      { startDate: "2026-12-01", endDate: "2026-11-01" },
    ),
  );
});
test("Catalog defines unique fields and labels for every table column", () => {
  for (const [name, module] of Object.entries(modules)) {
    assert.equal(
      new Set(module.fields.map((field) => field.key)).size,
      module.fields.length,
      name,
    );
    for (const column of module.columns)
      assert.ok(
        column === "createdAt" ||
          module.fields.some((field) => field.key === column),
        `${name}.${column}`,
      );
  }
});
test("CSV escapes quotes, newlines and spreadsheet formulas", () => {
  const csv = csvContent(
    [{ key: "value", label: "Value" }],
    [
      { value: "=1+1" },
      { value: '  =HYPERLINK("x")' },
      { value: 'Text;with"quotes\nand a newline' },
    ],
  );
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""x"")"'));
  assert.ok(csv.includes('Text;with""quotes\nand a newline'));
});
test("Print export includes the selected record and escapes its content", () => {
  let html = "";
  globalThis.window = {
    open: () => ({
      document: {
        write: (value) => {
          html = value;
        },
        close() {},
        getElementById: () => ({ addEventListener() {} }),
      },
    }),
  };
  try {
    printReport(
      "Selected request",
      [{ key: "details", label: "Details" }],
      [{ details: "Selected record <script>alert(1)</script>" }],
    );
    assert.ok(
      html.includes("Selected record &lt;script&gt;alert(1)&lt;/script&gt;"),
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("Ovaj ispis nije službeno ovjeren dokument."));
  } finally {
    delete globalThis.window;
  }
});
test("Tuition installment rounding preserves total and clamps end-of-month dates", () => {
  const plan = tuitionInstallments(1000.01, 10, 10, "2026-01-31");
  assert.equal(
    plan.reduce((sum, row) => sum + Math.round(row.amount * 100), 0),
    90001,
  );
  assert.equal(plan[1].dueDate, "2026-02-28");
  assert.throws(() => tuitionInstallments(100, 101, 2, "2026-10-13"));
  assert.throws(() => tuitionInstallments(100, 0, 3, "2026-10-13"));
  assert.throws(() => tuitionInstallments(100, 0, 1, "2026-02-31"));
});
test("Demo queries filter records and never grant production access", async () => {
  const data = {
    grades: [
      { id: "a", ownerUid: "student-a" },
      { id: "b", ownerUid: "student-b" },
    ],
    enrollments: [],
  };
  const repository = new DemoRecords(
    data,
    { uid: "student-a" },
    { role: "student" },
  );
  assert.deepEqual(await repository.list("grades"), [
    { id: "a", ownerUid: "student-a" },
  ]);
  await assert.rejects(repository.list("users"));
  const item = { id: "course-1", title: "Test", instructorUid: "instructor" };
  await repository.requestBooking("enrollments", item);
  await assert.rejects(
    repository.requestBooking("enrollments", item),
    /već postoji/,
  );
});
