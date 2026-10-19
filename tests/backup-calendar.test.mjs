import test from "node:test";
import {
  attendanceValues,
  attendanceSummary,
  attendanceId,
  attendanceTotals,
} from "../src/utils/attendance.js";
import assert from "node:assert/strict";
test("Satnica changes retain online notes, validate them and allow online without a room", () => {
  const event = {
    id: "online",
    date: "2026-10-19",
    time: "15:45",
    endTime: "17:15",
    room: "Room",
    online: false,
  };
  const result = prepareCalendarMove(
    event,
    { online: true, room: "", description: "Teams: https://example.test" },
    [],
  );
  assert.equal(result.online, true);
  assert.equal(result.description, "Teams: https://example.test");
  assert.equal(result.time, "15:45");
  assert.equal(result.room, "");
  assert.throws(() =>
    prepareCalendarMove(event, { online: false, room: "" }, []),
  );
  assert.throws(() =>
    prepareCalendarMove(event, { description: "x".repeat(2001) }, []),
  );
  const item = calendarItems({
    calendarEvents: [{ ...event, ...result, title: "Online lesson" }],
  })[0];
  assert.equal(item.location, "Online");
  assert.match(item.description, /Online nastava/);
  assert.match(item.description, /Teams: https:\/\/example.test/);
});
test("Attendance totals sum counts rather than averaging percentages and preserve student identities", () => {
  const base = {
    studentId: "s",
    student: "Student",
    year: "2026/2027",
    total: 3,
    present: 1,
    absent: 0,
    justified: 0,
    unmarked: 2,
  };
  const totals = attendanceTotals([
    base,
    { ...base, total: 1, present: 0, absent: 1, unmarked: 0 },
    { ...base, studentId: "other" },
  ]);
  assert.equal(totals.length, 2);
  assert.equal(totals[0].percentage, "50%");
  assert.equal(totals[0].unmarked, 2);
  assert.equal(totals[0].total, 4);
});

test("Attendance validates approved year-specific enrollment and teacher ownership", () => {
  const event = {
    id: "event",
    courseId: "course",
    title: "Course",
    academicYear: "2026/2027",
    date: "2026-10-19",
    instructorUids: ["teacher", "co-teacher"],
  };
  const enrollment = {
    id: "enrollment",
    studentId: "offline-student",
    ownerName: "Student",
    courseId: "course",
    academicYear: "2026/2027",
    status: "Odobreno",
  };
  const values = attendanceValues(
    event,
    enrollment,
    "Prisutan",
    { role: "profesor" },
    "co-teacher",
  );
  assert.equal(values.ownerUid, "");
  assert.equal(values.studentId, "offline-student");
  assert.equal(attendanceId(event.id, enrollment.id), "event__enrollment");
  assert.throws(() =>
    attendanceValues(
      event,
      enrollment,
      "Prisutan",
      { role: "profesor" },
      "other",
    ),
  );
  assert.throws(() =>
    attendanceValues(
      event,
      { ...enrollment, academicYear: "2025/2026" },
      "Prisutan",
      { role: "admin" },
      "admin",
    ),
  );
  assert.throws(() =>
    attendanceValues(
      event,
      { ...enrollment, status: "Na čekanju" },
      "Prisutan",
      { role: "admin" },
      "admin",
    ),
  );
  assert.throws(() =>
    attendanceValues(event, enrollment, "", { role: "admin" }, "admin"),
  );
});
test("Attendance statistics keep unmarked sessions separate and do not count other years", () => {
  const enrollment = {
    id: "en",
    studentId: "s",
    ownerName: "Student",
    courseId: "c",
    courseTitle: "Course",
    academicYear: "2026/2027",
    status: "Odobreno",
  };
  const events = ["a", "b", "c", "d"].map((id) => ({
    id,
    courseId: "c",
    title: "Course",
    academicYear: "2026/2027",
  }));
  events.push({ id: "old", courseId: "c", academicYear: "2025/2026" });
  const records = ["Prisutan", "Odsutan", "Opravdano odsutan"].map(
    (status, i) => ({ eventId: events[i].id, enrollmentId: "en", status }),
  );
  const summary = attendanceSummary(events, [enrollment], records)[0];
  assert.deepEqual(
    [
      summary.total,
      summary.present,
      summary.absent,
      summary.justified,
      summary.unmarked,
      summary.percentage,
    ],
    [4, 1, 1, 1, 1, "33.3%"],
  );
  assert.equal(attendanceSummary(events, [enrollment], [])[0].percentage, "—");
  const legacy = { ...enrollment, academicYear: "" };
  assert.equal(attendanceSummary(events, [legacy], []).length, 2);
});
import { readFileSync } from "node:fs";
import {
  buildBackup,
  validateBackup,
  backupFile,
  readBackupFile,
  backupCSV,
  backupFromCSV,
  validateRecord,
} from "../src/services/backup-format.js";
import {
  assertRestoreChain,
  restoreBackup,
  confirmBackup,
  getBackupState,
  backupScope,
} from "../src/services/backup.js";
import { DemoRecords } from "../src/services/demo.js";
import { demoData } from "../src/data/demoData.js";
import {
  zonedUTC,
  calendarItems,
  calendarICS,
  googleCalendarURL,
  foldICS,
  isoWeek,
  firstTeachingDate,
  personalCalendarRecords,
  studentCalendarRecords,
  eventHasNotEnded,
  adjacentTeaching,
} from "../src/utils/calendar.js";

test("Student exports follow approved enrollment years and exclude other accounts", () => {
  const events = [
    { id: "yes", courseId: "c", academicYear: "2026/2027" },
    { id: "old", courseId: "c", academicYear: "2025/2026" },
    { id: "pending", courseId: "d", academicYear: "2026/2027" },
  ];
  const enrollments = [
    {
      ownerUid: "me",
      courseId: "c",
      academicYear: "2026/2027",
      status: "Odobreno",
    },
    {
      ownerUid: "me",
      courseId: "d",
      academicYear: "2026/2027",
      status: "Na čekanju",
    },
    {
      ownerUid: "other",
      courseId: "c",
      academicYear: "2025/2026",
      status: "Odobreno",
    },
  ];
  const scoped = studentCalendarRecords(
    { calendarEvents: events, exams: events },
    enrollments,
    "me",
  );
  assert.deepEqual(
    scoped.calendarEvents.map((r) => r.id),
    ["yes"],
  );
  assert.deepEqual(
    scoped.exams.map((r) => r.id),
    ["yes"],
  );
});
test("Day view finds an actual future teaching day and past navigation is explicit", () => {
  const events = [
    { date: "2026-10-19", instructorUid: "me" },
    { date: "2026-10-21", instructorUid: "me" },
  ];
  assert.equal(
    firstTeachingDate(events, "me", "2026-10-20", "day"),
    "2026-10-21",
  );
  assert.equal(
    firstTeachingDate(events, "me", "2026-10-20", "week"),
    "2026-10-20",
  );
  assert.equal(adjacentTeaching(events, "2026-11-01").past, true);
  assert.equal(adjacentTeaching(events, "2026-10-20").past, false);
  assert.equal(adjacentTeaching([], "2026-10-20").event, undefined);
});
test("Upcoming events exclude finished lessons but retain ongoing lessons", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  assert.equal(
    eventHasNotEnded(
      { date: "2026-10-18", time: "09:00", endTime: "11:00" },
      now,
    ),
    false,
  );
  assert.equal(
    eventHasNotEnded(
      { date: "2026-10-18", time: "11:00", endTime: "13:00" },
      now,
    ),
    true,
  );
  assert.equal(
    eventHasNotEnded({ date: "2026-10-18", time: "11:00" }, now),
    true,
  );
  assert.equal(eventHasNotEnded({ date: "bad" }, now), false);
});

test("Personal calendar opens the current teaching week or next future week, including co-teachers", () => {
  const events = [
    { date: "2026-09-01", instructorUid: "me" },
    { date: "2026-10-20", instructorUid: "other" },
    { date: "2026-11-03", instructorUids: ["other", "me"] },
  ];
  assert.equal(firstTeachingDate(events, "me", "2026-10-17"), "2026-11-03");
  assert.equal(firstTeachingDate(events, "me", "2026-11-05"), "2026-11-05");
  assert.equal(firstTeachingDate(events, "me", "2027-01-01"), "2027-01-01");
  assert.equal(firstTeachingDate([], "me", "2026-10-17"), "2026-10-17");
});
test("ISO week labels handle year boundaries", () => {
  assert.deepEqual(isoWeek("2026-10-17"), { year: 2026, week: 42 });
  assert.deepEqual(isoWeek("2021-01-01"), { year: 2020, week: 53 });
  assert.deepEqual(isoWeek("2024-12-30"), { year: 2025, week: 1 });
});
test("Teacher calendar export keeps every assigned date and excludes other teachers", () => {
  const rows = [
    {
      id: "a",
      title: "A",
      date: "2026-10-19",
      time: "10:00",
      instructorUid: "me",
    },
    {
      id: "b",
      title: "B",
      date: "2026-11-02",
      time: "10:00",
      instructorUids: ["other", "me"],
    },
    {
      id: "c",
      title: "C",
      date: "2026-11-03",
      time: "10:00",
      instructorUid: "other",
    },
  ];
  const filtered = personalCalendarRecords(
    { calendarEvents: rows, exams: rows, vacations: [{ ownerUid: "other" }] },
    "me",
  );
  assert.deepEqual(
    filtered.calendarEvents.map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(filtered.vacations.length, 0);
  const items = calendarItems(filtered);
  assert.equal(items.length, 4);
  assert.match(calendarICS(items), /20261102/);
});
import { rangeBounds } from "../src/utils/backup-range.js";
import {
  prepareCalendarMove,
  scheduleConflicts,
  availableSlots,
} from "../src/utils/schedule.js";

test("Slot suggestions combine optional date, room and time filters and preserve duration", () => {
  const events = [
    {
      id: "a",
      date: "2026-10-14",
      room: "Dvorana PAR",
      time: "10:00",
      endTime: "12:00",
    },
  ];
  const base = { from: "2026-10-14", duration: 90 };
  assert.equal(
    availableSlots(events, {
      ...base,
      date: "2026-10-14",
      room: "Dvorana PAR",
      time: "10:00",
    }).length,
    0,
  );
  assert.equal(
    availableSlots(events, {
      ...base,
      date: "2026-10-14",
      room: "Dvorana PAR",
      time: "12:00",
    })[0].endTime,
    "13:30",
  );
  assert.equal(
    availableSlots(events, { ...base, room: "Dvorana PAR", time: "10:00" })[0]
      .date,
    "2026-10-15",
  );
  assert.ok(
    availableSlots(events, {
      ...base,
      date: "2026-10-14",
      time: "10:00",
    }).every((s) => s.room !== "Dvorana PAR"),
  );
  assert.equal(
    availableSlots(events, {
      ...base,
      date: "2026-10-14",
      room: "Dvorana PAR",
      time: "10:00",
      excludeId: "a",
    }).length,
    1,
  );
  assert.throws(() => availableSlots(events, { ...base, duration: 0 }));
});

test("Room availability detects partial overlap, adjacent slots, other dates and excludes the edited event", () => {
  const events = [
    {
      id: "a",
      date: "2026-10-14",
      room: "PAR",
      time: "09:30",
      endTime: "11:00",
      title: "Nastava",
      instructorName: "Profesor A",
    },
  ];
  const target = {
    date: "2026-10-14",
    room: "PAR",
    time: "10:00",
    endTime: "12:00",
  };
  assert.equal(
    scheduleConflicts(events, target)[0].instructorName,
    "Profesor A",
  );
  assert.equal(
    scheduleConflicts(events, { ...target, time: "11:00" }).length,
    0,
  );
  assert.equal(
    scheduleConflicts(events, { ...target, date: "2026-10-15" }).length,
    0,
  );
  assert.equal(
    scheduleConflicts(events, { ...target, room: "Druga" }).length,
    0,
  );
  assert.equal(scheduleConflicts(events, target, "a").length, 0);
  assert.throws(() =>
    scheduleConflicts(events, { ...target, endTime: "09:00" }),
  );
});
const source = { projectId: "demo", uid: "demo-admin" };
test("Date-range backup uses inclusive Zagreb dates, timestamp fallback, and does not advance incremental baseline", async () => {
  const rows = [
    { ...row("before", "Prije"), updatedAt: "2026-10-13T21:59:59Z" },
    {
      ...row("start", "Početak"),
      updatedAt: {
        $timestamp: {
          seconds: Date.parse("2026-10-13T22:00:00Z") / 1000,
          nanoseconds: 0,
        },
      },
    },
    { ...row("last", "Kraj"), updatedAt: "2026-10-14T21:59:59Z" },
    { ...row("after", "Poslije"), updatedAt: "2026-10-14T22:00:00Z" },
    {
      ...row("fallback", "Kreirano"),
      updatedAt: undefined,
      createdAt: "2026-10-14T12:00:00Z",
    },
    row("unknown", "Bez datuma"),
  ];
  const result = await buildBackup(
    { calendarEvents: rows },
    ["calendarEvents"],
    "range",
    {},
    source,
    { from: "2026-10-14", to: "2026-10-14" },
  );
  assert.deepEqual(
    result.backup.modules.calendarEvents.upserts.map((r) => r.id),
    ["start", "last", "fallback"],
  );
  assert.deepEqual(result.next, {});
  assert.equal(result.backup.omittedWithoutTimestamp.calendarEvents, 1);
  await validateBackup(result.backup);
  for (const format of ["json", "csv", "zip"])
    assert.deepEqual(
      await readBackupFile(
        file("range." + format, backupFile(result.backup, format).content),
      ),
      result.backup,
    );
  assert.equal(
    rangeBounds({ from: "2026-03-29", to: "2026-03-29" }).end -
      rangeBounds({ from: "2026-03-29", to: "2026-03-29" }).start,
    23 * 60 * 60 * 1000,
  );
  assert.throws(
    () => rangeBounds({ from: "2026-10-15", to: "2026-10-14" }),
    /Završni datum/,
  );
});
test("Calendar moves preserve duration, detect conflicts only on same date/room and reject stale or unauthorized changes", async () => {
  const event = {
    id: "a",
    title: "Ekonomija",
    date: "2026-10-12",
    time: "08:00",
    endTime: "10:00",
    room: "PAR",
    updatedAt: "v1",
  };
  const block = {
    id: "b",
    title: "Ispit",
    date: "2026-10-12",
    time: "10:00",
    endTime: "12:00",
    room: "PAR",
  };
  assert.throws(
    () => prepareCalendarMove(event, { time: "10:00" }, [event, block]),
    /preklapa/,
  );
  assert.deepEqual(
    prepareCalendarMove(event, { time: "10:00", room: " Dvorana 1 " }, [
      event,
      block,
    ]),
    {
      date: "2026-10-12",
      time: "10:00",
      endTime: "12:00",
      room: "Dvorana 1",
      day: "Pon",
    },
  );
  assert.equal(
    prepareCalendarMove(event, { time: "10:00", date: "2026-10-13" }, [
      event,
      block,
    ]).day,
    "Uto",
  );
  assert.equal(
    prepareCalendarMove(event, { time: "12:00" }, [event, block]).endTime,
    "14:00",
  );
  assert.throws(
    () => prepareCalendarMove(event, { time: "23:00" }, []),
    /unutar istog dana/,
  );
  const profile = { role: "admin", active: true },
    data = { calendarEvents: [{ ...event }, block] },
    repo = new DemoRecords(data, { uid: "demo-admin" }, profile);
  await repo.moveCalendar(event, { room: "Dvorana 1", time: "10:00" });
  assert.equal(data.calendarEvents[0].endTime, "12:00");
  await assert.rejects(
    repo.moveCalendar(event, { time: "12:00" }),
    /izmijenjen/,
  );
  await assert.rejects(
    new DemoRecords(
      data,
      { uid: "demo-student" },
      { role: "student", active: true },
    ).moveCalendar(data.calendarEvents[0], { time: "12:00" }),
    /ovlasti/,
  );
});
const row = (id, title) => ({
  id,
  title,
  date: "2026-10-14",
  time: "08:00",
  room: "PAR",
  description: "Opis",
  createdAt: "Ogledni zapis",
  updatedAt: "Ogledni zapis",
  createdBy: "demo-admin",
});
const file = (name, content) => {
  const blob = new Blob([content]);
  return {
    name,
    size: blob.size,
    text: () => blob.text(),
    arrayBuffer: () => blob.arrayBuffer(),
  };
};
test("Incremental backup includes new/changed records and deletions, and partial checkpoints are independent", async () => {
  const first = await buildBackup(
    { calendarEvents: [row("a", "Nastava"), row("b", "Ispit")] },
    ["calendarEvents"],
    "full",
    {},
    source,
  );
  const next = await buildBackup(
    { calendarEvents: [row("a", "Nova nastava"), row("c", "Novi ispit")] },
    ["calendarEvents"],
    "incremental",
    first.next,
    source,
  );
  assert.deepEqual(
    next.backup.modules.calendarEvents.upserts.map((r) => r.id),
    ["a", "c"],
  );
  assert.deepEqual(next.backup.modules.calendarEvents.deleted, ["b"]);
  assert.equal(next.backup.baseBackupIds.calendarEvents, first.backup.id);
  await validateBackup(next.backup);
  const same = await buildBackup(
    { calendarEvents: [row("a", "Nastava"), row("b", "Ispit")] },
    ["calendarEvents"],
    "incremental",
    first.next,
    source,
  );
  assert.equal(same.backup.modules.calendarEvents.upserts.length, 0);
  await assert.rejects(
    buildBackup(
      { courses: [] },
      ["courses"],
      "incremental",
      first.next,
      source,
    ),
    /potpuni backup/,
  );
  assert.throws(
    () =>
      assertRestoreChain(next.backup, ["calendarEvents"], {
        checkpoints: {},
        restored: {},
      }),
    /prvo vratite/,
  );
  assert.doesNotThrow(() =>
    assertRestoreChain(next.backup, ["calendarEvents"], {
      checkpoints: {},
      restored: { calendarEvents: first.backup.id },
    }),
  );
});
test("JSON, typed CSV and compressed ZIP round trip nested timestamp metadata and empty modules", async () => {
  const records = {
    calendarEvents: [
      {
        ...row("=1+1", 'Četvrtak; "nastava"\nDrugi red'),
        createdAt: { $timestamp: { seconds: 123, nanoseconds: 456 } },
      },
    ],
    courses: [],
  };
  const { backup } = await buildBackup(
    records,
    ["calendarEvents", "courses"],
    "full",
    {},
    source,
  );
  for (const format of ["json", "csv", "zip"]) {
    const output = backupFile(backup, format),
      restored = await readBackupFile(file("backup." + format, output.content));
    assert.deepEqual(restored, backup);
  }
  assert.deepEqual(backupFromCSV(backupCSV(backup)), backup);
});
test("Corrupted files, unknown modules, duplicate IDs and invalid schemas are rejected before restore", async () => {
  const { backup } = await buildBackup(
    { calendarEvents: [row("a", "Nastava")] },
    ["calendarEvents"],
    "full",
    {},
    source,
  );
  const damaged = structuredClone(backup);
  damaged.modules.calendarEvents.upserts[0].data.title = "Promijenjeno";
  await assert.rejects(validateBackup(damaged), /oštećen/);
  await assert.rejects(
    buildBackup({}, ["__proto__"], "full", {}, source),
    /poznati modul/,
  );
  await assert.rejects(
    buildBackup(
      { calendarEvents: [row("same", "Prvi"), row("same", "Drugi")] },
      ["calendarEvents"],
      "full",
      {},
      source,
    ),
    /dupliciran/,
  );
  assert.throws(
    () => validateRecord("calendarEvents", "bad/id", row("a", "x")),
    /Neispravan zapis/,
  );
  assert.throws(
    () =>
      validateRecord("calendarEvents", "a", {
        ...row("a", "x"),
        id: undefined,
        secret: "x",
      }),
    /Nepoznato polje/,
  );
  assert.throws(
    () =>
      validateRecord("calendarEvents", "a", {
        title: "x",
        date: "2026-02-31",
        time: "08:00",
        room: "PAR",
      }),
    /datum/,
  );
  await assert.rejects(
    readBackupFile({ name: "large.json", size: 26 * 1024 * 1024 }),
    /25 MB/,
  );
});
test("Full then incremental restore is repeatable, preserves IDs and rejects non-admin access", async () => {
  const originalLocation = globalThis.location,
    originalStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.location = new URL("http://127.0.0.1:4173/demo.html");
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  try {
    const user = { uid: "demo-admin" },
      profile = { role: "admin", active: true };
    const repo = new DemoRecords(
        { calendarEvents: [row("a", "Stariji zapis"), row("b", "Brisanje")] },
        user,
        profile,
      ),
      context = { user, profile, repository: repo, demo: true };
    const first = await buildBackup(
      { calendarEvents: [row("a", "Nastava"), row("b", "Ispit")] },
      ["calendarEvents"],
      "full",
      {},
      source,
    );
    const unsafe = await buildBackup(
      {
        users: [
          {
            id: "demo-admin",
            name: "Administrator",
            email: "admin@example.test",
            role: "student",
            active: false,
            departmentId: "",
          },
        ],
      },
      ["users"],
      "full",
      {},
      source,
    );
    await assert.rejects(
      restoreBackup(context, unsafe.backup, ["users"]),
      /administratorsku ulogu/,
    );
    assert.equal(
      Object.keys(getBackupState(backupScope(context)).checkpoints).length,
      0,
    );
    await restoreBackup(context, first.backup, ["calendarEvents"]);
    confirmBackup(context, first);
    const next = await buildBackup(
      { calendarEvents: [row("a", "Promjena"), row("c", "Dodatak")] },
      ["calendarEvents"],
      "incremental",
      first.next,
      source,
    );
    await restoreBackup(context, next.backup, ["calendarEvents"], true);
    assert.deepEqual(
      repo.data.calendarEvents.map((r) => r.id),
      ["a", "c"],
    );
    assert.equal(repo.data.calendarEvents[0].title, "Promjena");
    // Same full backup can be merged repeatedly without duplicate identities.
    await restoreBackup(context, first.backup, ["calendarEvents"]);
    await restoreBackup(context, first.backup, ["calendarEvents"]);
    assert.equal(
      repo.data.calendarEvents.filter((r) => r.id === "a").length,
      1,
    );
    await assert.rejects(
      restoreBackup(
        { ...context, profile: { role: "student", active: true } },
        first.backup,
        ["calendarEvents"],
      ),
      /administratoru/,
    );
  } finally {
    globalThis.location = originalLocation;
    globalThis.localStorage = originalStorage;
  }
});
test("All prototype modules can be archived and validated, including editable syllabus fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () =>
      JSON.parse(readFileSync("src/data/prototype-fixtures.json", "utf8")),
  });
  let records;
  try {
    records = await demoData();
  } finally {
    globalThis.fetch = originalFetch;
  }
  const { backup } = await buildBackup(
    records,
    Object.keys(records),
    "full",
    {},
    source,
  );
  await validateBackup(backup);
  assert.match(backup.modules.courses.upserts[0].data.outcomes, /Definirati/);
  assert.equal(backup.modules.students.upserts.length, 30);
  assert.equal(backup.modules.enrollments.upserts.length, 150);
});
test("Calendar UTC conversion handles Zagreb summer/winter time and rejects nonexistent DST hours", () => {
  assert.equal(zonedUTC("2026-07-01", "08:00"), "2026-07-01T06:00:00.000Z");
  assert.equal(zonedUTC("2026-12-01", "08:00"), "2026-12-01T07:00:00.000Z");
  assert.throws(() => zonedUTC("2026-03-29", "02:30"), /ne postoji/);
  const items = calendarItems(
    {
      courses: [
        {
          id: "c1",
          title: "Ekonomija",
          day: "Pon",
          startTime: "08:00",
          endTime: "10:00",
          room: "PAR",
        },
      ],
      vacations: [
        {
          id: "v1",
          ownerName: "Ana",
          startDate: "2026-10-14",
          endDate: "2026-10-16",
        },
      ],
    },
    { monday: "2026-10-12" },
  );
  assert.equal(
    items.find((i) => i.id === "c1").start,
    "2026-10-12T06:00:00.000Z",
  );
  assert.equal(items.find((i) => i.id === "v1").end, "2026-10-17");
});
test("ICS escaping/folding and Google Calendar links preserve event times and literal text", () => {
  const item = calendarItems({
    calendarEvents: [row("a", "Naslov, test;\nBEGIN:VEVENT")],
  })[0];
  const ics = calendarICS([item], new Date("2026-10-14T10:00:00Z"));
  assert.match(ics, /DTSTART:20261014T060000Z/);
  assert.match(ics, /SUMMARY:Naslov\\, test\\;\\nBEGIN:VEVENT/);
  assert.equal(
    ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length,
    1,
  ); // literal text cannot create another event
  const folded = foldICS("SUMMARY:" + "Ž".repeat(100));
  assert.ok(
    folded
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  );
  assert.equal(folded.replaceAll("\r\n ", ""), "SUMMARY:" + "Ž".repeat(100));
  const url = new URL(googleCalendarURL(item));
  assert.equal(url.hostname, "calendar.google.com");
  assert.equal(
    url.searchParams.get("dates"),
    "20261014T060000Z/20261014T070000Z",
  );
  assert.equal(url.searchParams.get("text"), item.title);
});

test("Bulk ICS and Google links include professor, room and original description", () => {
  const items = calendarItems({
    calendarEvents: [
      {
        ...row("one", "Ekonomija"),
        room: "Dvorana PAR",
        instructorName: "Profesor A",
        description: "Ponesite bilježnicu",
      },
      { ...row("two", "Menadžment"), instructorName: "Profesor B" },
    ],
  });
  assert.equal(items.length, 2);
  const ics = calendarICS(items).replaceAll("\r\n ", "");
  assert.equal(
    ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length,
    2,
  );
  assert.ok(ics.includes("Profesor: Profesor A"));
  assert.ok(ics.includes("Profesor: Profesor B"));
  const details = new URL(googleCalendarURL(items[0])).searchParams.get(
    "details",
  );
  assert.ok(details.includes("Naziv: Ekonomija"));
  assert.ok(details.includes("Dvorana / lokacija: Dvorana PAR"));
  assert.ok(details.includes("Profesor: Profesor A"));
  assert.ok(details.includes("Ponesite bilježnicu"));
});

test("Syllabus-only courses never fabricate calendar times", () => {
  assert.deepEqual(
    calendarItems({
      courses: [{ id: "syllabus", title: "Course", semester: "Zimski" }],
    }),
    [],
  );
});
