import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canUseDemo, createAdminDemo } from "../src/services/admin-demo.js";
import {
  parseImportJSON,
  readExcelFile,
  flatTemplate,
  parseCSV,
  rowsToObjects,
} from "../src/services/excel-files.js";
import { prepareImport } from "../src/services/excel-format.js";
import {
  classifyTemplates,
  deleteReviewedTemplates,
} from "../src/services/template-cleanup.js";
const admin = { uid: "real-admin" },
  profile = { role: "admin", active: true, name: "Real admin" };
test("Private demo rejects non-admins before loading and isolates all in-memory changes", async () => {
  let loaded = 0;
  const input = {
    users: [],
    students: [{ id: "1", name: "Fiction" }],
    calendarEvents: [],
    projects: [{ id: "p", title: "Project" }],
  };
  const load = async () => {
    loaded++;
    return input;
  };
  for (const p of [
    { role: "student", active: true },
    { role: "profesor", active: true },
    { role: "admin", active: false },
  ])
    await assert.rejects(
      () => createAdminDemo(admin, p, load),
      /administrator/,
    );
  assert.equal(loaded, 0);
  assert.equal(canUseDemo(null, profile), false);
  const first = await createAdminDemo(admin, profile, load),
    second = await createAdminDemo(admin, profile, load);
  await first.repository.save("students", { name: "Changed" }, "1");
  assert.equal(
    (await second.repository.listAll("students"))[0].name,
    "Fiction",
  );
  assert.equal(input.students[0].name, "Fiction");
  await first.repository.remove("projects", "p");
  assert.equal(input.projects.length, 1);
  assert.equal(profile.name, "Real admin");
  assert.equal(first.repository.constructor.name, "DemoRecords");
});
test("JSON and CSV use identical module validation, teacher binding, recurrence and conflict checks", async () => {
  const row = {
    courseId: "c1",
    title: "Test",
    date: "2026-10-19",
    time: "10:00",
    endTime: "12:00",
    room: "PAR",
    repeat: "Tjedno",
    repeatUntil: "2026-11-02",
  };
  const json = await readExcelFile(
    new File([JSON.stringify([row])], "import.json"),
  );
  const keys = Object.keys(row),
    csv = rowsToObjects(
      parseCSV(keys.join(";") + "\n" + keys.map((k) => row[k]).join(";")),
    );
  const opts = {
    name: "calendarEvents",
    role: "profesor",
    uid: "teacher",
    profile: { name: "Teacher" },
    courses: [
      {
        id: "c1",
        title: "Test",
        instructorUid: "teacher",
        instructorName: "Teacher",
      },
    ],
  };
  const a = await prepareImport({ ...opts, rows: json }),
    b = await prepareImport({ ...opts, rows: csv });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  const blocked = await prepareImport({
    ...opts,
    rows: json,
    existing: [
      {
        id: "busy",
        ...row,
        courseId: "other",
        title: "Busy",
        instructorUid: "teacher",
        date: "2026-10-26",
      },
    ],
  });
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].error, /Zauzeto/);
  assert.equal(
    parseImportJSON(flatTemplate("students", "admin", "json")).length,
    1,
  );
  for (const value of [
    "{}",
    "[null]",
    '[{"name":{}}]',
    '[{"__proto__":"x"}]',
    "{",
    "[]",
  ])
    assert.throws(() => parseImportJSON(value));
});
test("Cleanup keeps users, real/modified templates and templates referenced by real records", () => {
  const fixtures = {
    courses: [
      { id: "1", title: "Demo course" },
      { id: "2", title: "Demo two" },
    ],
    students: [{ id: "1", name: "Demo student" }],
  };
  const records = {
    users: [{ id: "template-user", name: "Admin" }],
    courses: [
      { id: "template-1", title: "Demo course" },
      { id: "template-2", title: "Changed" },
    ],
    students: [
      { id: "template-1", name: "Demo student" },
      { id: "real", name: "Demo student" },
    ],
    enrollments: [{ id: "real-enrollment", courseId: "template-1" }],
  };
  const result = classifyTemplates(records, fixtures);
  assert.deepEqual(
    result.confirmed.map((r) => r.name + "/" + r.id),
    ["students/template-1"],
  );
  assert.equal(result.retained.length, 2);
  assert.ok(result.retained.some((r) => r.reason.includes("poziva")));
  assert.ok(
    ![...result.confirmed, ...result.retained].some(
      (r) => r.name === "users" || r.id === "real",
    ),
  );
});
test("Cleanup cannot run from demo/non-admin sessions or delete arbitrary IDs", async () => {
  const review = { confirmed: [] };
  await assert.rejects(
    () => deleteReviewedTemplates({ demo: true, profile }, review, ["users/a"]),
    /stvarnom načinu/,
  );
  await assert.rejects(
    () =>
      deleteReviewedTemplates(
        { demo: false, profile: { role: "student", active: true } },
        review,
        ["users/a"],
      ),
    /administratoru/,
  );
  await assert.rejects(
    () =>
      deleteReviewedTemplates({ demo: false, profile }, review, ["users/a"]),
    /pregledanih/,
  );
});
test("Old public demo entry only redirects; main always observes the real authenticated session", () => {
  const source = readFileSync("src/demo.js", "utf8"),
    main = readFileSync("src/main.js", "utf8"),
    login = readFileSync("index.html", "utf8");
  assert.ok(source.includes("location.replace"));
  assert.ok(!source.includes("demoData"));
  assert.ok(!source.includes("startApplication"));
  assert.ok(!main.includes('dataset.mode !== "demo"'));
  assert.ok(main.includes("authenticatedSession"));
  assert.ok(!login.includes('href="./demo.html"'));
});

test("Cleanup deletes only unchanged selected records and rejects concurrent edits", async () => {
  const { digest, encodeValue } =
    await import("../src/services/backup-format.js");
  const record = { id: "template-1", name: "Demo student" };
  const row = {
    name: "students",
    id: record.id,
    record,
    fingerprint: await digest(encodeValue(record)),
  };
  const review = { confirmed: [row], retained: [] };
  let deleted = [],
    changed = false;
  const dependencies = {
    review: async () => review,
    connect: async () => ({
      db: {},
      firestore: {
        doc: (_db, name, id) => ({ name, id }),
        runTransaction: async (_db, work) =>
          work({
            get: async () => ({
              id: record.id,
              exists: () => true,
              data: () => ({ name: changed ? "Real edit" : record.name }),
            }),
            delete: (ref) => deleted.push(ref.name + "/" + ref.id),
          }),
      },
    }),
  };
  const context = { demo: false, profile };
  assert.equal(
    await deleteReviewedTemplates(
      context,
      review,
      ["students/template-1"],
      () => {},
      dependencies,
    ),
    1,
  );
  assert.deepEqual(deleted, ["students/template-1"]);
  deleted = [];
  changed = true;
  await assert.rejects(
    () =>
      deleteReviewedTemplates(
        context,
        review,
        ["students/template-1"],
        () => {},
        dependencies,
      ),
    /izmijenjen/,
  );
  assert.deepEqual(deleted, []);
  const child = {
    name: "enrollments",
    id: "template-2",
    record: { courseId: "template-1" },
  };
  const parent = { ...row, name: "courses" };
  const linked = { confirmed: [parent, child] };
  await assert.rejects(
    () =>
      deleteReviewedTemplates(
        context,
        linked,
        ["courses/template-1"],
        () => {},
        { ...dependencies, review: async () => linked },
      ),
    /koristi/,
  );
});
