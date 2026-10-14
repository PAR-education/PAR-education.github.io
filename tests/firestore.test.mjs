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
} from "firebase/firestore";
let env;
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
