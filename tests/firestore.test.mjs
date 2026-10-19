import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { prepareCalendarMove } from "../src/utils/schedule.js";
let env;
test("Attendance is canonical, teacher-scoped, student read-only and audit-backed", async () => {
  const sdk = await import("firebase/firestore");
  const { saveAttendanceRecord } =
    await import("../src/services/attendance.js");
  const { readAllRecords } = await import("../src/services/records.js");
  const admin = database("admin"),
    teacher = database("teacher"),
    student = database("student-a");
  await updateDoc(doc(admin, "courses", "c1"), {
    instructorUids: ["teacher", "teacher-b"],
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(admin, "calendarEvents", "lesson"), {
    title: "Business",
    courseId: "c1",
    date: "2026-10-19",
    time: "10:00",
    instructorUid: "teacher",
    instructorUids: ["teacher", "teacher-b"],
    ...meta(),
    createdBy: "admin",
  });
  await updateDoc(doc(admin, "enrollments", "c1__student-a"), {
    instructorUids: ["teacher", "teacher-b"],
    updatedAt: serverTimestamp(),
  });
  const values = {
      eventId: "lesson",
      enrollmentId: "c1__student-a",
      status: "Prisutan",
    },
    id = "lesson__c1__student-a";
  await saveAttendanceRecord(
    sdk,
    teacher,
    { uid: "teacher" },
    { role: "profesor" },
    values,
    id,
  );
  const record = (await getDoc(doc(student, "attendance", id))).data();
  assert.equal(record.ownerUid, "student-a");
  assert.equal(record.studentName, "A");
  await assertFails(getDoc(doc(database("student-b"), "attendance", id)));
  await assertFails(
    updateDoc(doc(student, "attendance", id), {
      status: "Prisutan",
      updatedAt: serverTimestamp(),
    }),
  );
  assert.equal(
    (await readAllRecords(sdk, teacher, "attendance", "courseId", "c1")).length,
    1,
  );
  assert.equal(
    (
      await readAllRecords(
        sdk,
        student,
        "attendance",
        "enrollmentId",
        "c1__student-a",
      )
    ).length,
    1,
  );
  await saveAttendanceRecord(
    sdk,
    database("teacher-b"),
    { uid: "teacher-b" },
    { role: "profesor" },
    { ...values, status: "Opravdano odsutan" },
    id,
  );
  assert.equal(
    (await getDoc(doc(student, "attendance", id))).data().status,
    "Opravdano odsutan",
  );
  await saveAttendanceRecord(
    sdk,
    teacher,
    { uid: "teacher" },
    { role: "profesor" },
    { ...values, status: "Nije evidentirano" },
    id,
  );
  assert.equal(
    (await getDoc(doc(student, "attendance", id))).data().status,
    "Nije evidentirano",
  );
  await assertFails(
    updateDoc(doc(teacher, "attendance", id), {
      ownerUid: "student-b",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(teacher, "attendance", id), {
      academicYear: "2025/2026",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(teacher, "attendance", "duplicate"), {
      ...record,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: "teacher",
    }),
  );
  const logs = await getDocs(
    query(collection(admin, "auditLog"), where("module", "==", "attendance")),
  );
  assert.equal(logs.size, 3);
  await updateDoc(doc(admin, "enrollments", "c1__student-a"), {
    ownerUid: "student-b",
    updatedAt: serverTimestamp(),
  });
  await assertFails(getDoc(doc(student, "attendance", id)));
  await assertSucceeds(getDoc(doc(database("student-b"), "attendance", id)));
  await assertFails(
    readAllRecords(sdk, database("head"), "attendance", "courseId", "c1"),
  );
  await updateDoc(doc(admin, "calendarEvents", "lesson"), {
    instructorUid: "other",
    instructorUids: ["other"],
    updatedAt: serverTimestamp(),
  });
  await assertFails(
    updateDoc(doc(teacher, "attendance", id), {
      status: "Odsutan",
      updatedAt: serverTimestamp(),
    }),
  );
});
const database = (uid) => env.authenticatedContext(uid).firestore();
const meta = () => ({
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: "student-a",
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-par-education",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firebase/firestore.rules", "utf8"),
    },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, active, departmentId] of [
      ["admin", "admin", true, "business"],
      ["office", "administracija_par", true, "business"],
      ["student-a", "student", true, "business"],
      ["student-b", "student", true, "business"],
      ["teacher", "profesor", true, "business"],
      ["teacher-b", "profesor", true, "other"],
      ["lab", "lab_assistant", true, "business"],
      ["head", "dept_head", true, "business"],
      ["blocked", "student", false, "business"],
    ]) {
      await setDoc(doc(db, "users", uid), {
        name: uid,
        email: `${uid}@example.test`,
        role,
        active,
        departmentId,
      });
    }
    const stamp = {
      createdBy: "admin",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await setDoc(doc(db, "courses", "c1"), {
      title: "Business",
      ects: 6,
      semester: "Zimski",
      instructorUid: "teacher",
      instructorName: "Teacher",
      room: "1",
      day: "Pon",
      startTime: "08:00",
      endTime: "10:00",
      ...stamp,
    });
    await setDoc(doc(db, "students", "s1"), {
      ownerUid: "student-a",
      name: "Student A",
      jmbag: "DEMO",
      year: 1,
      status: "Redovni",
      email: "a@example.test",
      departmentId: "business",
      ...stamp,
    });
    await setDoc(doc(db, "students", "s2"), {
      ownerUid: "student-b",
      name: "Student B",
      jmbag: "DEMO2",
      year: 2,
      status: "Redovni",
      email: "b@example.test",
      departmentId: "other",
      ...stamp,
    });
    await setDoc(doc(db, "finances", "f1"), {
      ownerUid: "student-a",
      ownerName: "A",
      title: "Tuition",
      amount: 100,
      dueDate: "2026-12-01",
      status: "Dugovanje",
      ...stamp,
    });
    await setDoc(doc(db, "enrollments", "c1__student-a"), {
      ownerUid: "student-a",
      ownerName: "A",
      courseId: "c1",
      courseTitle: "Business",
      instructorUid: "teacher",
      status: "Odobreno",
      ...stamp,
    });
    await setDoc(doc(db, "labs", "l1"), {
      title: "Computer",
      tag: "LAB1",
      category: "Hardware",
      status: "Dostupno",
      ...stamp,
    });
    await setDoc(doc(db, "labBookings", "l1__student-a"), {
      ownerUid: "student-a",
      ownerName: "A",
      title: "Computer",
      labId: "l1",
      status: "Na čekanju",
      ...stamp,
    });
  });
});
test("Anonymous, inactive and unprovisioned accounts cannot read ERP data", async () => {
  for (const db of [
    env.unauthenticatedContext().firestore(),
    database("blocked"),
    database("missing"),
  ])
    await assertFails(getDoc(doc(db, "courses", "c1")));
});
test("Users cannot self-assign roles or activate themselves", async () => {
  await assertFails(
    updateDoc(doc(database("student-a"), "users", "student-a"), {
      role: "admin",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(database("missing"), "users", "missing"), {
      name: "X",
      email: "x@example.test",
      role: "admin",
      active: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(database("blocked"), "users", "blocked"), {
      active: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(database("missing"), "users", "missing")));
});
test("New account can create only its own inactive profile and cannot activate it", async () => {
  const db = env
    .authenticatedContext("new-account", { email: "new@example.test" })
    .firestore();
  const profile = {
    name: "New user",
    emailVerificationRequired: true,
    emailVerified: false,
    email: "new@example.test",
    role: "student",
    active: false,
    departmentId: "",
    ...meta(),
    createdBy: "new-account",
  };
  await assertSucceeds(setDoc(doc(db, "users", "new-account"), profile));
  await assertFails(getDoc(doc(db, "courses", "c1")));
  await assertFails(
    updateDoc(doc(db, "users", "new-account"), {
      role: "admin",
      active: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(db, "users", "new-account"), {
      active: true,
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Pending self-provisioning cannot forge identity, approval, department or privileged role", async () => {
  const db = env
    .authenticatedContext("new-account", { email: "new@example.test" })
    .firestore();
  const profile = {
    name: "New user",
    email: "new@example.test",
    role: "student",
    active: false,
    departmentId: "",
    ...meta(),
    createdBy: "new-account",
  };
  for (const change of [
    { role: "admin" },
    { role: "profesor" },
    { active: true },
    { departmentId: "business" },
    { email: "other@example.test" },
    { extraPermission: true },
    { createdBy: "admin" },
  ]) {
    await assertFails(
      setDoc(doc(db, "users", "new-account"), { ...profile, ...change }),
    );
  }
  await assertFails(setDoc(doc(db, "users", "someone-else"), profile));
  await assertFails(
    setDoc(
      doc(env.unauthenticatedContext().firestore(), "users", "new-account"),
      profile,
    ),
  );
});
test("Admin can provision users but cannot disable own admin profile", async () => {
  await assertSucceeds(
    setDoc(doc(database("admin"), "users", "new-user"), {
      name: "New",
      email: "new@example.test",
      role: "student",
      active: true,
      departmentId: "business",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(database("admin"), "users", "admin"), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Student can query own finances but cannot query all or alter them", async () => {
  const db = database("student-a");
  await assertSucceeds(
    getDocs(
      query(collection(db, "finances"), where("ownerUid", "==", "student-a")),
    ),
  );
  await assertFails(getDocs(collection(db, "finances")));
  await assertFails(getDoc(doc(database("student-b"), "finances", "f1")));
  await assertFails(
    updateDoc(doc(db, "finances", "f1"), {
      status: "Plaćeno",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Department head is restricted to department and cannot modify records", async () => {
  const db = database("head");
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "students"),
        where("departmentId", "==", "business"),
      ),
    ),
  );
  await assertFails(getDoc(doc(db, "students", "s2")));
  await assertFails(getDocs(collection(db, "students")));
  await assertFails(
    updateDoc(doc(db, "students", "s1"), {
      name: "Change",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Students can submit requests but cannot approve or forge ownership", async () => {
  const db = database("student-a");
  const data = {
    ownerUid: "student-a",
    ownerName: "A",
    type: "Ostalo",
    details: "Test request",
    status: "Na čekanju",
    response: "",
    ...meta(),
  };
  await assertSucceeds(setDoc(doc(db, "requests", "r1"), data));
  await assertFails(
    setDoc(doc(db, "requests", "r2"), { ...data, ownerUid: "student-b" }),
  );
  await assertFails(
    setDoc(doc(db, "requests", "r3"), { ...data, status: "Riješeno" }),
  );
  await assertFails(
    updateDoc(doc(db, "requests", "r1"), {
      status: "Riješeno",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Only assigned instructor can grade an approved enrolled student", async () => {
  const data = {
    ownerUid: "student-a",
    studentName: "A",
    courseId: "c1",
    courseTitle: "Business",
    instructorUid: "teacher",
    grade: 5,
    date: "2026-10-13",
    ...meta(),
    createdBy: "teacher",
  };
  await assertSucceeds(setDoc(doc(database("teacher"), "grades", "g1"), data));
  await assertFails(
    setDoc(doc(database("teacher-b"), "grades", "g2"), {
      ...data,
      instructorUid: "teacher-b",
      createdBy: "teacher-b",
    }),
  );
  await assertFails(
    setDoc(doc(database("teacher"), "grades", "g3"), {
      ...data,
      ownerUid: "student-b",
    }),
  );
  await assertFails(
    setDoc(doc(database("teacher"), "grades", "g4"), { ...data, grade: 6 }),
  );
  await assertSucceeds(getDoc(doc(database("student-a"), "grades", "g1")));
  await assertFails(getDoc(doc(database("student-b"), "grades", "g1")));
});
test("Enrollment requests have deterministic identity and trusted instructor", async () => {
  const data = {
    ownerUid: "student-b",
    ownerName: "B",
    courseId: "c1",
    courseTitle: "Business",
    instructorUid: "teacher",
    status: "Na čekanju",
    ...meta(),
    createdBy: "student-b",
  };
  const db = database("student-b");
  await assertFails(setDoc(doc(db, "enrollments", "random-id"), data));
  await assertFails(
    setDoc(doc(db, "enrollments", "c1__student-b"), {
      ...data,
      instructorUid: "student-b",
    }),
  );
  await assertSucceeds(setDoc(doc(db, "enrollments", "c1__student-b"), data));
  await assertFails(
    updateDoc(doc(db, "enrollments", "c1__student-b"), {
      status: "Odobreno",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(database("teacher"), "enrollments", "c1__student-b"), {
      status: "Odobreno",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Lab assistant can query all reservations and decide but cannot reassign", async () => {
  const db = database("lab");
  await assertSucceeds(getDocs(collection(db, "labBookings")));
  await assertFails(
    updateDoc(doc(db, "labBookings", "l1__student-a"), {
      ownerUid: "student-b",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db, "labBookings", "l1__student-a"), {
      status: "Odobreno",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("Unexpected fields, invalid dates and unknown collections are denied", async () => {
  const db = database("student-a");
  const request = {
    ownerUid: "student-a",
    ownerName: "A",
    type: "Ostalo",
    details: "Request",
    status: "Na čekanju",
    response: "",
    ...meta(),
    role: "admin",
  };
  await assertFails(setDoc(doc(db, "requests", "bad"), request));
  await assertFails(setDoc(doc(database("admin"), "unknown", "x"), { a: 1 }));
  await assertFails(deleteDoc(doc(db, "users", "student-a")));
  await assertFails(
    setDoc(doc(database("admin"), "calendarEvents", "invalid-date"), {
      title: "Invalid",
      date: "not-a-date",
      time: "10:00",
      room: "PAR",
      ...meta(),
      createdBy: "admin",
    }),
  );
});

test("Original template records can be imported by admin under published schemas", async () => {
  const { demoData } = await import("../src/data/demoData.js");
  const { templateValues } = await import("../src/services/import-template.js");
  const { writeBatch } = await import("firebase/firestore");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () =>
      JSON.parse(readFileSync("src/data/prototype-fixtures.json", "utf8")),
  });
  let data;
  try {
    data = await demoData();
  } finally {
    globalThis.fetch = originalFetch;
  }
  const db = database("admin");
  for (const [name, list] of Object.entries(data)) {
    if (name === "users" || !list.length) continue;
    const batch = writeBatch(db);
    for (const row of list)
      batch.set(doc(db, name, "template-" + row.id), {
        ...templateValues(name, row),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "admin",
      });
    await assertSucceeds(batch.commit());
  }
  await assertFails(
    setDoc(doc(database("student-a"), "enrollments", "template-forged"), {
      ...templateValues("enrollments", data.enrollments[0]),
      ...meta(),
    }),
  );
});

test("Administrator restores historical backup records; student cannot restore other owners or forge timestamps", async () => {
  const db = database("admin"),
    createdAt = Timestamp.fromDate(new Date("2025-02-01T10:00:00Z"));
  const evaluation = {
    ownerUid: "student-b",
    subject: "Kolegij",
    rating: 4,
    answers: "Odgovori",
    comments: "",
    createdAt,
    createdBy: "former-admin",
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(
    setDoc(doc(db, "evaluations", "restored-evaluation"), evaluation),
  );
  await assertSucceeds(
    updateDoc(doc(db, "evaluations", "restored-evaluation"), {
      rating: 5,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(database("student-a"), "evaluations", "forged-history"), {
      ...evaluation,
      ownerUid: "student-a",
      createdBy: "student-a",
    }),
  );
  await assertFails(
    updateDoc(
      doc(database("student-b"), "evaluations", "restored-evaluation"),
      { rating: 1, updatedAt: serverTimestamp() },
    ),
  );
  const booking = {
    ownerUid: "student-a",
    ownerName: "A",
    courseId: "c1",
    courseTitle: "Business",
    instructorUid: "teacher",
    status: "Odobreno",
    createdAt,
    createdBy: "former-admin",
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(
    setDoc(doc(db, "enrollments", "restored-booking"), booking),
  );
  await assertSucceeds(
    updateDoc(doc(db, "enrollments", "restored-booking"), {
      ownerName: "Restored A",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(
      doc(database("student-a"), "enrollments", "forged-booking"),
      booking,
    ),
  );
  await assertFails(
    updateDoc(doc(db, "enrollments", "restored-booking"), {
      createdAt: Timestamp.now(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("Backup pagination includes more than 500 records without truncation and respects owner queries", async () => {
  const sdk = await import("firebase/firestore");
  const { readAllRecords } = await import("../src/services/records.js");
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (let offset = 0; offset < 510; offset += 200) {
      const batch = sdk.writeBatch(db);
      for (let i = offset; i < Math.min(offset + 200, 510); i++)
        batch.set(doc(db, "notifications", "n-" + String(i).padStart(4, "0")), {
          ownerUid: i % 2 ? "student-a" : "student-b",
          title: "Test " + i,
          message: "Pagination",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "admin",
        });
      await batch.commit();
    }
  });
  const all = await readAllRecords(sdk, database("admin"), "notifications");
  if (all.length !== 510 || new Set(all.map((r) => r.id)).size !== 510)
    throw new Error("Backup lost or duplicated records.");
  const own = await readAllRecords(
    sdk,
    database("student-a"),
    "notifications",
    "ownerUid",
    "student-a",
  );
  if (own.length !== 255 || own.some((r) => r.ownerUid !== "student-a"))
    throw new Error("Owner scope not preserved.");
  await assertFails(
    readAllRecords(sdk, database("student-a"), "notifications"),
  );
});

test("Calendar end times may be defined only by admin and must follow the start time", async () => {
  const db = database("admin");
  const event = {
    title: "Nastava",
    date: "2026-10-14",
    time: "08:00",
    endTime: "10:00",
    room: "PAR",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: "admin",
  };
  await assertSucceeds(setDoc(doc(db, "calendarEvents", "drag-test"), event));
  await assertSucceeds(
    updateDoc(doc(db, "calendarEvents", "drag-test"), {
      time: "10:00",
      endTime: "12:00",
      room: "Dvorana 1",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    runTransaction(db, async (transaction) => {
      const ref = doc(db, "calendarEvents", "drag-test");
      const snapshot = await transaction.get(ref);
      const current = { ...snapshot.data(), id: snapshot.id };
      const values = prepareCalendarMove(
        current,
        { time: "12:30", room: "Dvorana 2" },
        [current],
      );
      transaction.update(ref, { ...values, updatedAt: serverTimestamp() });
    }),
  );
  await assertFails(
    updateDoc(doc(db, "calendarEvents", "drag-test"), {
      time: "14:00",
      endTime: "13:00",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(database("teacher"), "calendarEvents", "drag-test"), {
      time: "12:00",
      endTime: "14:00",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("Teachers may create and update only their assigned teaching, never another teacher or course", async () => {
  const db = database("teacher"),
    ref = doc(db, "calendarEvents", "teacher-import");
  const value = {
    title: "Ekonomija",
    courseId: "c1",
    instructorUid: "teacher",
    instructorName: "Profesor",
    date: "2026-10-19",
    time: "10:00",
    endTime: "11:30",
    room: "PAR",
    study: "Poslovanje",
    group: "1A",
    academicYear: "2026/2027",
    semester: "Zimski",
    seriesId: "series-test",
    createdBy: "teacher",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(ref, value));
  await assertSucceeds(
    updateDoc(ref, {
      time: "12:00",
      endTime: "13:30",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(database("teacher-b"), "calendarEvents", "teacher-import"), {
      room: "Other",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, {
      instructorUid: "teacher-b",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db, "calendarEvents", "foreign-course"), {
      ...value,
      courseId: "missing",
    }),
  );
  await assertFails(
    setDoc(doc(database("student-a"), "calendarEvents", "student-import"), {
      ...value,
      createdBy: "student-a",
    }),
  );
  await assertSucceeds(deleteDoc(ref));
});

test("Admin can import incomplete Erasmus dossiers, syllabi and unlinked enrollments without granting access", async () => {
  const db = database("admin");
  const metadata = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: "admin",
  };
  await assertSucceeds(
    setDoc(doc(db, "students", "erasmus"), {
      name: "Exchange Student",
      departmentId: "erasmus",
      status: "Erasmus",
      ...metadata,
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, "courses", "erasmus-course"), {
      title: "Exchange Course",
      semester: "Zimski",
      description: "x".repeat(3000),
      ...metadata,
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, "calendarEvents", "erasmus-event"), {
      title: "Exchange Course",
      date: "2026-10-19",
      time: "08:00",
      endTime: "09:30",
      ...metadata,
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, "enrollments", "unlinked"), {
      studentId: "erasmus",
      ownerName: "Exchange Student",
      courseId: "erasmus-course",
      courseTitle: "Exchange Course",
      status: "Odobreno",
      ...metadata,
    }),
  );
  await assertFails(
    getDoc(doc(database("student-a"), "enrollments", "unlinked")),
  );
  await assertFails(
    setDoc(doc(db, "enrollments", "no-identity"), {
      ownerName: "Nobody",
      courseId: "erasmus-course",
      courseTitle: "Exchange Course",
      status: "Odobreno",
      ...metadata,
    }),
  );
  await assertFails(
    setDoc(doc(database("student-a"), "calendarEvents", "unauthorized"), {
      title: "Exchange Course",
      date: "2026-10-19",
      time: "08:00",
      endTime: "09:30",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: "student-a",
    }),
  );
});

test("Real import creates deterministic IDs, preserves metadata on retry and links approved enrollments atomically", async () => {
  const sdk = await import("firebase/firestore"),
    db = database("admin");
  const { writeImportedRecord } = await import("../src/services/records.js");
  const { linkStudentAccount } =
    await import("../src/services/student-link.js");
  await updateDoc(doc(db, "users", "student-a"), {
    email: "exchange@example.test",
    updatedAt: serverTimestamp(),
  });
  await writeImportedRecord(
    sdk,
    db,
    "students",
    "excel-student",
    {
      name: "Exchange Student",
      email: "exchange@example.test",
      departmentId: "erasmus",
      status: "Erasmus",
    },
    "admin",
  );
  const first = (await getDoc(doc(db, "students", "excel-student"))).data();
  await writeImportedRecord(
    sdk,
    db,
    "students",
    "excel-student",
    {
      name: "Exchange Student",
      email: "exchange@example.test",
      departmentId: "erasmus",
      status: "Erasmus",
    },
    "admin",
  );
  assert.equal(
    (await getDoc(doc(db, "students", "excel-student")))
      .data()
      .createdAt.toMillis(),
    first.createdAt.toMillis(),
  );
  await writeImportedRecord(
    sdk,
    db,
    "enrollments",
    "excel-enrollment",
    {
      studentId: "excel-student",
      ownerName: "Exchange Student",
      courseId: "c1",
      courseTitle: "Business",
      status: "Odobreno",
    },
    "admin",
  );
  const rows = [
    {
      ...(await getDoc(doc(db, "enrollments", "excel-enrollment"))).data(),
      id: "excel-enrollment",
    },
  ];
  const context = {
    demo: false,
    profile: { role: "admin", active: true },
    repository: { listAll: async () => rows },
  };
  assert.equal(
    await linkStudentAccount(
      context,
      "excel-student",
      "student-a",
      async () => ({ db, firestore: sdk }),
    ),
    1,
  );
  assert.equal(
    (await getDoc(doc(db, "students", "excel-student"))).data().ownerUid,
    "student-a",
  );
  assert.equal(
    (
      await getDoc(doc(database("student-a"), "enrollments", "c1__student-a"))
    ).data().status,
    "Odobreno",
  );
  assert.equal(
    (await getDoc(doc(db, "enrollments", "excel-enrollment"))).exists(),
    false,
  );
});

test("Saving course assignment synchronizes linked calendar events atomically and preserves unrelated dates and rooms", async () => {
  const sdk = await import("firebase/firestore"),
    db = database("admin");
  const { saveCourseAndSchedule } =
    await import("../src/services/course-schedule.js");
  const meta = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: "admin",
  };
  for (const [id, courseId] of [
    ["linked-1", "c1"],
    ["linked-2", "c1"],
    ["unrelated", "other-course"],
  ])
    await setDoc(doc(db, "calendarEvents", id), {
      title: "Business",
      courseId,
      date: "2026-10-20",
      time: "08:00",
      endTime: "09:30",
      room: "Room 1",
      description: "Keep this",
      ...meta,
    });
  const result = await saveCourseAndSchedule(
    sdk,
    db,
    "c1",
    { instructorUid: "teacher", instructorName: "Assigned Teacher" },
    "admin",
  );
  assert.equal(result.syncedEvents, 2);
  const event = (await getDoc(doc(db, "calendarEvents", "linked-1"))).data();
  assert.equal(event.instructorUid, "teacher");
  assert.equal(event.instructorName, "Assigned Teacher");
  assert.equal(event.date, "2026-10-20");
  assert.equal(event.room, "Room 1");
  assert.equal(event.description, "Keep this");
  assert.equal(
    (await getDoc(doc(db, "calendarEvents", "unrelated"))).data().instructorUid,
    undefined,
  );
  assert.equal(
    (
      await saveCourseAndSchedule(
        sdk,
        db,
        "c1",
        { instructorUid: "teacher", instructorName: "Assigned Teacher" },
        "admin",
      )
    ).syncedEvents,
    0,
  );
  await assert.rejects(
    () =>
      saveCourseAndSchedule(
        sdk,
        db,
        "c1",
        { instructorUid: "student-a" },
        "admin",
      ),
    /akt/,
  );
  assert.equal(
    (await getDoc(doc(db, "courses", "c1"))).data().instructorUid,
    "teacher",
  );
  await saveCourseAndSchedule(
    sdk,
    db,
    "c1",
    { instructorUid: "", instructorName: "Not yet assigned" },
    "admin",
  );
  assert.equal(
    (await getDoc(doc(db, "calendarEvents", "linked-1"))).data().instructorUid,
    "",
  );
});

test("Concurrent calendar bookings reserve one room once; aliases collide and audit is append-only", async () => {
  const sdk = await import("firebase/firestore");
  const { saveCalendarRecord } =
    await import("../src/services/calendar-save.js");
  const { archiveRecord, restoreArchived } =
    await import("../src/services/audit.js");
  const db = database("admin"),
    user = { uid: "admin" },
    profile = { role: "admin", active: true };
  const values = {
    title: "Concurrent",
    date: "2026-12-12",
    time: "10:00",
    endTime: "12:00",
    room: "Dvorana 1",
  };
  const outcomes = await Promise.allSettled([
    saveCalendarRecord(sdk, db, user, profile, values, "parallel-a"),
    saveCalendarRecord(
      sdk,
      db,
      user,
      profile,
      { ...values, room: "Učionica 1" },
      "parallel-b",
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    outcomes.find((r) => r.status === "rejected").reason.message,
    /Zauzeto/,
  );
  const saved = (await getDocs(collection(db, "calendarEvents"))).docs.find(
    (d) => d.id.startsWith("parallel-"),
  );
  const logs = await getDocs(collection(db, "auditLog"));
  assert.equal(logs.size, 1);
  await assertFails(updateDoc(logs.docs[0].ref, { action: "archive" }));
  await saveCalendarRecord(
    sdk,
    db,
    user,
    profile,
    {
      ...values,
      time: "12:00",
      endTime: "14:00",
      online: true,
      description: "Teams: https://example.test",
    },
    saved.id,
  );
  assert.equal((await getDoc(saved.ref)).data().time, "12:00");
  assert.equal((await getDoc(saved.ref)).data().online, true);
  assert.equal(
    (await getDoc(saved.ref)).data().description,
    "Teams: https://example.test",
  );
  await assertFails(
    updateDoc(saved.ref, { online: "true", updatedAt: serverTimestamp() }),
  );
  await archiveRecord(sdk, db, "calendarEvents", saved.id, "admin");
  assert.equal((await getDoc(saved.ref)).exists(), false);
  const archive = (await getDocs(collection(db, "archive"))).docs[0];
  await restoreArchived(sdk, db, archive.id, "admin");
  assert.equal((await getDoc(saved.ref)).exists(), true);
});

test("Co-teachers can query their assignments and students cannot forge lecturer arrays", async () => {
  const sdk = await import("firebase/firestore"),
    db = database("admin");
  await updateDoc(doc(db, "courses", "c1"), {
    instructorUids: ["teacher", "teacher-b"],
    updatedAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, "enrollments", "c1__student-a"));
  const student = database("student-a");
  const values = {
    ownerUid: "student-a",
    ownerName: "A",
    academicYear: "",
    courseId: "c1",
    courseTitle: "Business",
    instructorUid: "teacher",
    instructorUids: ["teacher", "teacher-b"],
    status: "Na čekanju",
    ...meta(),
  };
  await assertSucceeds(
    setDoc(doc(student, "enrollments", "c1__student-a"), values),
  );
  const teacher = database("teacher-b");
  const q = query(
    collection(teacher, "enrollments"),
    sdk.or(
      where("instructorUid", "==", "teacher-b"),
      where("instructorUids", "array-contains", "teacher-b"),
    ),
  );
  assert.equal((await assertSucceeds(getDocs(q))).size, 1);
  await assertFails(
    setDoc(doc(database("student-b"), "enrollments", "c1__student-b"), {
      ...values,
      ownerUid: "student-b",
      instructorUids: ["student-b"],
      createdBy: "student-b",
    }),
  );
});

test("Verification gate blocks new unverified accounts while preserving legacy accounts", async () => {
  await env.withSecurityRulesDisabled(async (context) =>
    updateDoc(doc(context.firestore(), "users", "student-a"), {
      emailVerificationRequired: true,
    }),
  );
  await assertFails(getDocs(collection(database("student-a"), "courses")));
  const verified = env
    .authenticatedContext("student-a", { email_verified: true })
    .firestore();
  await assertSucceeds(getDocs(collection(verified, "courses")));
  await assertSucceeds(getDocs(collection(database("student-b"), "courses")));
});

test("Automatic course notifications target approved students only", async () => {
  const db = database("admin"),
    teacher = database("teacher");
  await setDoc(doc(db, "calendarEvents", "notice-source"), {
    title: "Lecture",
    courseId: "c1",
    instructorUid: "teacher",
    date: "2026-12-20",
    time: "08:00",
    endTime: "10:00",
    room: "Room 1",
    createdBy: "admin",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const notice = {
    ownerUid: "student-a",
    title: "Promjena rasporeda",
    message: "Updated timetable",
    sourceModule: "calendarEvents",
    sourceId: "notice-source",
    createdBy: "teacher",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(teacher, "notifications", "n1"), notice));
  await assertFails(
    setDoc(doc(teacher, "notifications", "n2"), {
      ...notice,
      ownerUid: "student-b",
    }),
  );
  await assertSucceeds(
    getDoc(doc(database("student-a"), "notifications", "n1")),
  );
  await assertFails(getDoc(doc(database("student-b"), "notifications", "n1")));
});

test("AdministracijaPAR can add dossiers across departments and schedule teaching without admin powers", async () => {
  const db = database("office");
  const sdk = await import("firebase/firestore");
  const { validateFields } = await import("../src/utils/validation.js");
  const { modules } = await import("../src/modules/catalog.js");
  const { writeImportedRecord } = await import("../src/services/records.js");
  const { saveCalendarRecord } =
    await import("../src/services/calendar-save.js");
  const profile = { role: "administracija_par", active: true };
  for (const name of [
    "students",
    "employees",
    "courses",
    "rooms",
    "calendarEvents",
  ])
    await assertSucceeds(getDocs(collection(db, name)));
  for (const [name, id, values] of [
    [
      "students",
      "office-student",
      { name: "New student", status: "Erasmus", departmentId: "other" },
    ],
    [
      "employees",
      "office-professor",
      {
        name: "New teacher",
        position: "Nastavnik",
        email: "teacher@example.test",
        departmentId: "other",
      },
    ],
  ]) {
    const data = validateFields(modules[name].fields, values);
    await writeImportedRecord(sdk, db, name, id, data, "office");
    await assertFails(
      setDoc(doc(db, name, id + "-linked"), {
        ...data,
        ownerUid: "teacher",
        createdBy: "office",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    assert.equal((await getDoc(doc(db, name, id))).data().ownerUid, "");
    await assertFails(
      updateDoc(doc(db, name, id), {
        name: "Changed",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(db, name, id)));
  }
  const values = {
    title: "Business",
    courseId: "c1",
    date: "2026-10-19",
    time: "10:00",
    endTime: "11:30",
    room: "PAR",
  };
  await saveCalendarRecord(
    sdk,
    db,
    { uid: "office" },
    profile,
    values,
    "office-lesson",
  );
  assert.equal(
    (await getDoc(doc(db, "calendarEvents", "office-lesson"))).data()
      .instructorUid,
    "teacher",
  );
  await saveCalendarRecord(
    sdk,
    db,
    { uid: "office" },
    profile,
    { ...values, time: "12:00", endTime: "13:30" },
    "office-lesson",
  );
  await assert.rejects(
    saveCalendarRecord(
      sdk,
      db,
      { uid: "office" },
      profile,
      { ...values, time: "12:30", endTime: "14:00" },
      "conflicting-lesson",
    ),
    /Zauzeto/,
  );
  await assertFails(deleteDoc(doc(db, "calendarEvents", "office-lesson")));
  for (const name of [
    "users",
    "grades",
    "finances",
    "attendance",
    "enrollments",
    "projects",
    "evaluations",
    "auditLog",
    "archive",
  ])
    await assertFails(getDocs(collection(db, name)));
  await assertFails(
    updateDoc(doc(db, "users", "office"), {
      role: "admin",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(db, "courses", "c1"), {
      title: "Changed",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db, "notifications", "broadcast"), {
      ownerUid: "student-a",
      title: "Test",
      message: "Test",
      createdBy: "office",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("Broadcast notices are office-created, role-scoped, queryable and preserve private inboxes", async () => {
  const sdk = await import("firebase/firestore");
  const { saveAnnouncementRecord } =
    await import("../src/services/notifications.js");
  const { readAllRecords } = await import("../src/services/records.js");
  const office = database("office"),
    student = database("student-a"),
    teacher = database("teacher");
  const values = {
    title: "Students notice",
    message: "Class moved",
    audience: "student",
  };
  const saved = await saveAnnouncementRecord(
    sdk,
    office,
    { uid: "office" },
    { role: "administracija_par" },
    values,
  );
  const ref = doc(student, "notifications", saved.id);
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(teacher, "notifications", saved.id)));
  await assertFails(getDoc(doc(database("lab"), "notifications", saved.id)));
  await assertFails(
    getDoc(doc(database("blocked"), "notifications", saved.id)),
  );
  assert.equal(
    (await readAllRecords(sdk, student, "notifications", "audience", "student"))
      .length,
    1,
  );
  assert.equal(
    (await readAllRecords(sdk, office, "notifications", "audience", "student"))
      .length,
    1,
  );
  await assertFails(getDocs(collection(student, "notifications")));
  await assertFails(
    updateDoc(doc(office, "notifications", saved.id), {
      message: "Changed",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(deleteDoc(doc(office, "notifications", saved.id)));
  await assertFails(
    setDoc(doc(teacher, "notifications", "forged"), {
      ...values,
      ownerUid: "",
      createdBy: "teacher",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(student, "notifications", "forged-student"), {
      ...values,
      ownerUid: "",
      createdBy: "student-a",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(office, "notifications", "owner-and-audience"), {
      ...values,
      ownerUid: "student-a",
      createdBy: "office",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  const both = await saveAnnouncementRecord(
    sdk,
    office,
    { uid: "office" },
    { role: "administracija_par" },
    { ...values, title: "Both", audience: "students_professors" },
  );
  await assertSucceeds(getDoc(doc(student, "notifications", both.id)));
  await assertSucceeds(getDoc(doc(teacher, "notifications", both.id)));
  const teachers = await saveAnnouncementRecord(
    sdk,
    office,
    { uid: "office" },
    { role: "administracija_par" },
    { ...values, title: "Teachers", audience: "profesor" },
  );
  await assertSucceeds(getDoc(doc(teacher, "notifications", teachers.id)));
  await assertFails(getDoc(doc(student, "notifications", teachers.id)));
  await setDoc(doc(database("admin"), "notifications", "private-inbox"), {
    ownerUid: "student-a",
    title: "Private",
    message: "One only",
    createdBy: "admin",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(getDoc(doc(student, "notifications", "private-inbox")));
  await assertFails(getDoc(doc(office, "notifications", "private-inbox")));
  assert.equal(
    (
      await readAllRecords(
        sdk,
        student,
        "notifications",
        "ownerUid",
        "student-a",
      )
    ).length,
    1,
  );
  const history = await getDocs(
    query(
      collection(database("admin"), "auditLog"),
      where("recordId", "==", saved.id),
    ),
  );
  assert.equal(history.size, 1);
});
