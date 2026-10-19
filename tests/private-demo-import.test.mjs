import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canUseDemo,
  createAdminDemo,
  createRolePreview,
} from "../src/services/admin-demo.js";
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
test("Course notice recipients require assignment, approved enrollment and exact year", async () => {
  const { courseNoticeRecipients, courseNoticeValues } =
    await import("../src/utils/course-notices.js");
  const c = {
    id: "c",
    title: "Course",
    instructorUids: ["teacher", "co"],
    academicYear: "2026/2027",
  };
  const en = {
    id: "en",
    courseId: "c",
    ownerUid: "s",
    academicYear: "2026/2027",
    status: "Odobreno",
  };
  const rows = [
    en,
    { ...en, id: "duplicate" },
    { ...en, ownerUid: "" },
    { ...en, ownerUid: "pending", status: "Na čekanju" },
    { ...en, ownerUid: "old", academicYear: "2025/2026" },
    { ...en, ownerUid: "other", courseId: "other" },
  ];
  assert.equal(courseNoticeRecipients(c, rows, "co", "2026/2027").length, 1);
  assert.throws(() => courseNoticeRecipients(c, rows, "foreign", "2026/2027"));
  assert.throws(() => courseNoticeRecipients(c, rows, "teacher", "2025/2026"));
  const draft = {
    courseId: "c",
    academicYear: "2026/2027",
    title: "Title",
    message: "Message",
  };
  assert.equal(courseNoticeValues(c, en, "teacher", draft).ownerUid, "s");
  const { DemoRecords } = await import("../src/services/demo.js");
  const data = { courses: [c], enrollments: rows, notifications: [] };
  const repo = new DemoRecords(
    data,
    { uid: "teacher" },
    { role: "profesor", active: true },
  );
  assert.deepEqual(await repo.sendCourseNotice(draft, "retry"), {
    sent: 1,
    total: 1,
  });
  await repo.sendCourseNotice(draft, "retry");
  assert.equal(data.notifications.length, 1);
  await assert.rejects(
    repo.sendCourseNotice({ ...draft, message: "Different" }, "retry"),
  );
});
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

test("Admin role previews share a private dataset, enforce permissions and cannot be stolen", async () => {
  const load = async () => ({
    users: [],
    courses: [{ id: "c1", title: "Course", instructorUid: "demo-profesor" }],
    calendarEvents: [],
    enrollments: [],
    notifications: [],
  });
  const demo = await createAdminDemo(admin, profile, load);
  const student = createRolePreview(admin, profile, demo, "student");
  assert.equal(student.profile.role, "student");
  assert.equal(student.repository.data, demo.repository.data);
  await assert.rejects(
    () => student.repository.save("courses", { title: "Forbidden" }),
    /ovlasti/,
  );
  await assert.rejects(() => student.repository.listAll("users"), /pristup/);
  assert.throws(
    () => createRolePreview({ uid: "another-admin" }, profile, demo, "student"),
    /administrator/,
  );
  assert.throws(
    () =>
      createRolePreview(
        admin,
        { role: "student", active: true },
        demo,
        "profesor",
      ),
    /administrator/,
  );
  const course = (await student.repository.listAll("courses"))[0];
  const existing = student.repository.data.enrollments.find(
    (r) => r.id === course.id + "__" + student.user.uid,
  );
  if (!existing) await student.repository.requestBooking("enrollments", course);
  const request = student.repository.data.enrollments.find(
    (r) => r.id === course.id + "__" + student.user.uid,
  );
  assert.equal(request.ownerUid, student.user.uid);
  const adminView = createRolePreview(admin, profile, student, "admin");
  assert.ok(
    (await adminView.repository.listAll("enrollments")).some(
      (r) => r.id === request.id,
    ),
  );
  const fresh = await createAdminDemo(admin, profile, load);
  assert.notEqual(fresh.repository.data, demo.repository.data);
});

test("Year-specific enrollment IDs and dashboards keep student data in its own academic year", async () => {
  const { enrollmentId } = await import("../src/utils/academic-year.js");
  const { dashboardModel } = await import("../src/services/dashboard.js");
  assert.equal(enrollmentId("course", "uid"), "course__uid");
  assert.equal(enrollmentId("course", "uid", "2026/2027"), "course__uid__2026");
  assert.throws(() => enrollmentId("course", "uid", "2026/2028"));
  const records = {
    enrollments: [
      { courseId: "c1", academicYear: "2026/2027", status: "Odobreno" },
    ],
    calendarEvents: [
      {
        id: "yes",
        courseId: "c1",
        academicYear: "2026/2027",
        date: "2099-01-01",
        time: "08:00",
      },
      {
        id: "no",
        courseId: "c1",
        academicYear: "2027/2028",
        date: "2099-01-01",
        time: "08:00",
      },
    ],
    finances: [
      { amount: 125, status: "Dugovanje" },
      { amount: 50, status: "Plaćeno" },
    ],
  };
  const model = await dashboardModel({
    user: { uid: "u" },
    profile: { role: "student" },
    repository: { listAll: async (n) => records[n] || [] },
  });
  assert.deepEqual(
    model.upcoming.map((r) => r.id),
    ["yes"],
  );
  assert.match(model.stats.find((r) => r.name === "finances").value, /125/);
});

test("Series preview validates every occurrence before edits and detects foreign ownership", async () => {
  const { planSeries } = await import("../src/services/calendar-series.js");
  const first = {
    id: "one",
    seriesId: "series",
    title: "Lecture",
    instructorUid: "teacher",
    date: "2026-11-02",
    time: "08:00",
    endTime: "09:00",
    room: "Dvorana 1",
  };
  const second = { ...first, id: "two", date: "2026-11-09" };
  const values = { time: "10:00", endTime: "12:00", room: "Dvorana 2" };
  const plan = planSeries(
    [first, second],
    first,
    values,
    "profesor",
    "teacher",
  );
  assert.equal(plan.length, 2);
  assert.equal(plan[1].date, second.date);
  assert.equal(first.time, "08:00");
  assert.throws(
    () =>
      planSeries(
        [first, { ...second, instructorUid: "other" }],
        first,
        values,
        "profesor",
        "teacher",
      ),
    /ovlasti/,
  );
  assert.throws(
    () =>
      planSeries(
        [
          first,
          second,
          {
            ...second,
            id: "busy",
            seriesId: "other",
            room: "Učionica 2",
            time: "11:00",
            endTime: "13:00",
          },
        ],
        first,
        values,
        "admin",
        "admin",
      ),
    /zauzeto/,
  );
});

test("Repository paging loads records beyond the old 250-item ceiling", async () => {
  const { readAllRecords } = await import("../src/services/records.js");
  let calls = 0;
  const sdk = {
    documentId: () => "id",
    orderBy: () => ({}),
    limit: (n) => ({ limit: n }),
    startAfter: (doc) => ({ cursor: doc.id }),
    collection: (_db, name) => name,
    query: (name, ...constraints) => ({ name, constraints }),
    getDocsFromServer: async (query) => {
      calls++;
      const start = query.constraints.find((r) => r.cursor)?.cursor ? 500 : 0;
      const docs = Array.from({ length: start ? 23 : 500 }, (_, i) => ({
        id: String(start + i),
        data: () => ({ title: "Row " + (start + i) }),
      }));
      return { docs, size: docs.length };
    },
  };
  const rows = await readAllRecords(sdk, {}, "courses");
  assert.equal(rows.length, 523);
  assert.equal(calls, 2);
  assert.equal(rows[522].title, "Row 522");
});
