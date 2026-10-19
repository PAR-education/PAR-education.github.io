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
import { textWithLinks } from "../src/utils/links.js";
test("Notes link only HTTP URLs and escape user content", () => {
  const html = textWithLinks(
    "<img src=x onerror=alert(1)> Teams: https://example.test/meet?a=1&b=2. javascript:alert(1)",
  );
  assert.match(html, /&lt;img/);
  assert.match(html, /href="https:\/\/example.test\/meet\?a=1&amp;b=2"/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.doesNotMatch(html, /<img|href="javascript:/);
});
test("Optional online flags default to false and reject nonboolean input", () => {
  const fields = [
    { key: "online", label: "Online", type: "checkbox", required: false },
  ];
  assert.equal(validateFields(fields, {}).online, false);
  assert.equal(validateFields(fields, { online: true }).online, true);
  assert.throws(() => validateFields(fields, { online: "false" }));
});
import { DemoRecords } from "../src/services/demo.js";
import { tuitionInstallments } from "../src/utils/tuition.js";
import { csvContent, printReport } from "../src/components/export.js";
import { pendingProfile } from "../src/auth/profile.js";
import { validateRegistration } from "../src/auth/registration.js";
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
test("New profiles always wait for approval and never copy a requested role", () => {
  const profile = pendingProfile({
    uid: "user",
    email: "person@example.test",
    displayName: " Person ",
    role: "admin",
    active: true,
  });
  assert.deepEqual(profile, {
    emailVerificationRequired: true,
    emailVerified: false,
    name: "Person",
    email: "person@example.test",
    role: "student",
    active: false,
    departmentId: "",
  });
  assert.equal(
    pendingProfile({ uid: "user", email: "person@example.test" }).name,
    "person",
  );
  assert.equal(isActiveProfile(profile), false);
  assert.throws(() => pendingProfile({ uid: "user" }));
});
test("Registration validates name, email, password length and confirmation", () => {
  assert.deepEqual(
    validateRegistration(
      " User Name ",
      " user@example.test ",
      "Long-test-123!",
      "Long-test-123!",
    ),
    {
      name: "User Name",
      email: "user@example.test",
      password: "Long-test-123!",
    },
  );
  assert.throws(() =>
    validateRegistration(
      "",
      "user@example.test",
      "Long-test-123!",
      "Long-test-123!",
    ),
  );
  assert.throws(() =>
    validateRegistration("User", "invalid", "Long-test-123!", "Long-test-123!"),
  );
  assert.throws(() =>
    validateRegistration("User", "user@example.test", "short", "short"),
  );
  assert.throws(() =>
    validateRegistration(
      "User",
      "user@example.test",
      "Long-test-123!",
      "different",
    ),
  );
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

test("Course overview hides syllabus and enrollment groups keep original detail targets", async () => {
  const { visualRecords } = await import("../src/modules/visuals.js");
  const badge = (value) => String(value);
  const course = visualRecords(
    "courses",
    [
      {
        title: "Course A",
        ects: 6,
        instructorName: "Teacher",
        description: "Full syllabus only in details",
      },
    ],
    badge,
  );
  assert.ok(
    course.includes("Course A") &&
      course.includes("6 ECTS") &&
      course.includes("Teacher"),
  );
  assert.ok(!course.includes("Full syllabus only in details"));
  const enrollments = visualRecords(
    "enrollments",
    [
      {
        studentId: "paula",
        ownerName: "Paula",
        courseTitle: "Z course",
        status: "Odobreno",
      },
      {
        studentId: "ana",
        ownerName: "Ana",
        courseTitle: "Other",
        status: "Odobreno",
      },
      {
        studentId: "paula",
        ownerName: "Paula",
        courseTitle: "A course",
        status: "Odobreno",
      },
      {
        studentId: "different-person",
        ownerName: "Paula",
        courseTitle: "Distinct person",
        status: "Odobreno",
      },
    ],
    badge,
  );
  assert.equal(
    (enrollments.match(/class="panel enrollment-student"/g) || []).length,
    3,
  );
  assert.ok(enrollments.indexOf("Ana") < enrollments.indexOf("Paula"));
  assert.match(enrollments, /A course[\s\S]*?data-row="2"/);
  assert.match(enrollments, /Z course[\s\S]*?data-row="0"/);
});

test("Course assignment in demo updates only linked events and stays idempotent", async () => {
  const data = {
    courses: [{ id: "course", title: "Course", instructorUid: "" }],
    calendarEvents: [
      { id: "one", courseId: "course", date: "2026-10-20", room: "Room 1" },
      { id: "other", courseId: "different", title: "Course" },
    ],
  };
  const repo = new DemoRecords(
    data,
    { uid: "admin" },
    { role: "admin", active: true },
  );
  assert.equal(
    (
      await repo.save(
        "courses",
        { instructorUid: "professor", instructorName: "Professor" },
        "course",
      )
    ).syncedEvents,
    1,
  );
  assert.equal(data.calendarEvents[0].instructorUid, "professor");
  assert.equal(data.calendarEvents[0].room, "Room 1");
  assert.equal(data.calendarEvents[1].instructorUid, undefined);
  assert.equal(
    (
      await repo.save(
        "courses",
        { instructorUid: "professor", instructorName: "Professor" },
        "course",
      )
    ).syncedEvents,
    0,
  );
});

test("Role navigation keeps primary tasks compact and never exposes admin modules to other roles", async () => {
  const { roleNavigation, navigationLabel } =
    await import("../src/auth/navigation.js");
  for (const role of Object.keys(roles)) {
    const nav = roleNavigation(role),
      names = [...nav.primary, ...nav.more];
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.every((name) => canRead(role, name)));
    if (role !== "admin") assert.ok(!names.includes("users"));
  }
  assert.ok(roleNavigation("student").primary.includes("calendarEvents"));
  assert.ok(roleNavigation("student").more.includes("labs"));
  assert.ok(!roleNavigation("profesor").primary.includes("projects"));
  assert.ok(roleNavigation("profesor").more.includes("research"));
  assert.equal(navigationLabel("student", "grades"), "Moje ocjene");
  assert.equal(navigationLabel("profesor", "courses"), "Moji kolegiji");
  assert.ok(roleNavigation("admin").primary.includes("users"));
});

test("AdministracijaPAR gets a focused dashboard, create-only people and schedule editing", async () => {
  const { canAdd, canDelete, canEditCalendar } =
    await import("../src/auth/permissions.js");
  const { roleNavigation } = await import("../src/auth/navigation.js");
  const { dashboardModel } = await import("../src/services/dashboard.js");
  const { DemoRecords } = await import("../src/services/demo.js");
  const role = "administracija_par";
  const nav = roleNavigation(role);
  assert.deepEqual(nav.primary, [
    "calendarEvents",
    "attendance",
    "students",
    "employees",
    "courses",
    "rooms",
    "notifications",
  ]);
  for (const name of [
    "users",
    "grades",
    "finances",

    "projects",
    "evaluations",
    "workEntries",
    "vacations",
  ]) {
    assert.equal(canRead(role, name), false);
    assert.equal(canAdd(role, name), false);
  }
  for (const name of ["students", "employees"]) {
    assert.equal(canAdd(role, name), true);
    assert.equal(canManage(role, name), false);
    assert.equal(canDelete(role, name), false);
  }
  assert.equal(
    canEditCalendar(role, "office", { instructorUid: "someone-else" }),
    true,
  );
  assert.equal(canDelete(role, "calendarEvents"), false);
  const data = {
    students: [],
    employees: [],
    courses: [],
    calendarEvents: [],
    notifications: [],
  };
  const profile = { role, active: true, name: "Office" },
    user = { uid: "office" };
  const repository = new DemoRecords(data, user, profile);
  await repository.save("employees", {
    name: "Teacher",
    email: "teacher@example.test",
    position: "Nastavnik",
  });
  await assert.rejects(
    repository.save("employees", { name: "Linked", ownerUid: "teacher" }),
    /administrator/,
  );
  const person = data.employees[0];
  assert.notEqual(person.ownerUid, "office");
  await assert.rejects(
    repository.save("employees", { name: "Changed" }, person.id),
    /ovlasti/,
  );
  await assert.rejects(repository.remove("employees", person.id), /ovlasti/);
  const model = await dashboardModel({ profile, user, repository });
  assert.deepEqual(
    model.stats.map((s) => s.name),
    ["calendarEvents", "students", "employees"],
  );
  assert.equal(model.failures.length, 0);
});

test("Broadcast inboxes isolate role audiences and keep private notices private", async () => {
  const { DemoRecords } = await import("../src/services/demo.js");
  const data = {
    notifications: [
      { id: "personal", ownerUid: "s1", title: "Private", message: "One" },
    ],
  };
  const office = new DemoRecords(
    data,
    { uid: "office" },
    { role: "administracija_par", active: true },
  );
  await office.save("notifications", {
    audience: "student",
    title: "Students",
    message: "Class notice",
  });
  await office.save("notifications", {
    audience: "profesor",
    title: "Teachers",
    message: "Meeting",
  });
  await office.save("notifications", {
    audience: "students_professors",
    title: "Both",
    message: "Shared",
  });
  const student = new DemoRecords(
    data,
    { uid: "s1" },
    { role: "student", active: true },
  );
  const teacher = new DemoRecords(
    data,
    { uid: "t1" },
    { role: "profesor", active: true },
  );
  assert.deepEqual(
    (await student.listAll("notifications")).map((r) => r.title),
    ["Private", "Students", "Both"],
  );
  assert.deepEqual(
    (await teacher.listAll("notifications")).map((r) => r.title),
    ["Teachers", "Both"],
  );
  assert.deepEqual(
    (await office.listAll("notifications")).map((r) => r.title),
    ["Students", "Teachers", "Both"],
  );
  await assert.rejects(
    teacher.save("notifications", {
      audience: "student",
      title: "No",
      message: "No",
    }),
    /ovlasti/,
  );
  await assert.rejects(
    office.save("notifications", {
      ownerUid: "s1",
      title: "No",
      message: "No",
    }),
    /primatelje/,
  );
  await assert.rejects(
    office.save("notifications", {
      audience: "admin",
      title: "No",
      message: "No",
    }),
  );
  await assert.rejects(
    office.save("notifications", {
      audience: "student",
      title: " ",
      message: "No",
    }),
  );
});

test("Course calendar uses actual linked dates, academic year and complete metadata", async () => {
  const { courseCalendarItems } =
    await import("../src/utils/course-calendar.js");
  const course = {
    id: "c",
    academicYear: "2026/2027",
    day: "Pon",
    startTime: "08:00",
  };
  const rows = [
    {
      id: "a",
      courseId: "c",
      title: "Business",
      academicYear: "2026/2027",
      date: "2026-10-19",
      time: "15:45",
      endTime: "17:15",
      room: "Učionica 1",
      instructorName: "Teacher",
      description: "Bring a laptop",
    },
    { id: "b", courseId: "other", date: "2026-10-20", time: "10:00" },
    {
      id: "c",
      courseId: "c",
      academicYear: "2025/2026",
      date: "2025-10-19",
      time: "10:00",
    },
  ];
  const items = courseCalendarItems(course, rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].start, "2026-10-19T13:45:00.000Z");
  assert.equal(items[0].end, "2026-10-19T15:15:00.000Z");
  assert.match(items[0].description, /Teacher/);
  assert.match(items[0].description, /Učionica 1/);
  assert.match(items[0].description, /laptop/);
  assert.deepEqual(courseCalendarItems(course, []), []);
});

test("Mini calendar uses Monday-first complete weeks, including leap years", async () => {
  const { monthDays } = await import("../src/components/mini-calendar.js");
  const feb = monthDays("2028-02");
  assert.equal(feb.filter(Boolean).length, 29);
  assert.equal(feb.length % 7, 0);
  assert.equal(feb[0], null);
  assert.equal(feb[1], "2028-02-01");
  const nov = monthDays("2026-11");
  assert.equal(nov[6], "2026-11-01");
  assert.equal(nov.filter(Boolean).length, 30);
});

test("Self check-in is own approved attendance, inside the exact Zagreb lesson window", async () => {
  const { checkinOpen, attendanceValues } =
    await import("../src/utils/attendance.js");
  const event = {
    id: "e",
    courseId: "c",
    title: "Class",
    date: "2026-10-19",
    time: "15:45",
    endTime: "17:15",
    academicYear: "2026/2027",
    instructorUid: "teacher",
  };
  const en = {
    id: "en",
    courseId: "c",
    ownerUid: "student",
    ownerName: "Student",
    status: "Odobreno",
    academicYear: "2026/2027",
  };
  const profile = { role: "student" };
  assert.equal(checkinOpen(event, new Date("2026-10-19T13:44:59.999Z")), false);
  assert.equal(checkinOpen(event, new Date("2026-10-19T13:45:00.000Z")), true);
  assert.equal(checkinOpen(event, new Date("2026-10-19T15:14:59.999Z")), true);
  assert.equal(checkinOpen(event, new Date("2026-10-19T15:15:00.000Z")), false);
  assert.equal(
    checkinOpen({ ...event, endTime: "" }, new Date("2026-10-19T14:00:00Z")),
    false,
  );
  assert.equal(
    checkinOpen(
      { ...event, date: "2026-10-20" },
      new Date("2026-10-19T14:00:00Z"),
    ),
    false,
  );
  const record = attendanceValues(
    event,
    en,
    "Prisutan",
    profile,
    "student",
    new Date("2026-10-19T14:00:00Z"),
  );
  assert.equal(record.markedByUid, "student");
  assert.equal(record.markedByRole, "student");
  for (const status of ["Odsutan", "Opravdano odsutan", "Nije evidentirano"])
    assert.throws(() =>
      attendanceValues(
        event,
        en,
        status,
        profile,
        "student",
        new Date("2026-10-19T14:00:00Z"),
      ),
    );
  assert.throws(() =>
    attendanceValues(
      event,
      { ...en, ownerUid: "other" },
      "Prisutan",
      profile,
      "student",
      new Date("2026-10-19T14:00:00Z"),
    ),
  );
  assert.throws(() =>
    attendanceValues(
      event,
      { ...en, status: "Na čekanju" },
      "Prisutan",
      profile,
      "student",
      new Date("2026-10-19T14:00:00Z"),
    ),
  );
  assert.throws(
    () =>
      attendanceValues(
        event,
        en,
        "Prisutan",
        profile,
        "student",
        new Date("2026-10-19T13:44:00Z"),
      ),
    /tijekom/,
  );
  assert.equal(
    attendanceValues(
      event,
      en,
      "Odsutan",
      { role: "administracija_par" },
      "office",
      new Date("2027-01-01T00:00:00Z"),
    ).markedByRole,
    "administracija_par",
  );
});

test("Self check-in follows winter offset and Zagreb date at UTC midnight", async () => {
  const { checkinOpen } = await import("../src/utils/attendance.js");
  assert.equal(
    checkinOpen(
      { date: "2026-12-01", time: "08:00", endTime: "09:00" },
      new Date("2026-12-01T07:30:00Z"),
    ),
    true,
  );
  assert.equal(
    checkinOpen(
      { date: "2026-07-02", time: "00:00", endTime: "01:00" },
      new Date("2026-07-01T22:30:00Z"),
    ),
    true,
  );
  assert.equal(
    checkinOpen(
      { date: "2026-07-01", time: "00:00", endTime: "01:00" },
      new Date("2026-07-01T22:30:00Z"),
    ),
    false,
  );
  assert.equal(
    checkinOpen(
      { date: "2026-03-29", time: "03:00", endTime: "04:00" },
      new Date("2026-03-29T01:00:00Z"),
    ),
    true,
  );
  assert.equal(
    checkinOpen(
      { date: "2026-10-25", time: "02:00", endTime: "03:00" },
      new Date("2026-10-25T00:30:00Z"),
    ),
    true,
  );
  assert.equal(
    checkinOpen(
      { date: "2026-10-25", time: "02:00", endTime: "03:00" },
      new Date("2026-10-25T01:30:00Z"),
    ),
    true,
  );
});
