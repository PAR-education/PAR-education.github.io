import { appendAudit } from "./audit.js";
import { instructorFields, instructorIds } from "../utils/instructors.js";
export function courseScheduleUpdates(events, courseId, course) {
  const fields = {
    ...instructorFields(course),
    instructorName: course.instructorName || "",
  };
  return events
    .filter(
      (r) =>
        r.courseId === courseId &&
        (r.instructorUid !== fields.instructorUid ||
          (r.instructorName || "") !== fields.instructorName ||
          JSON.stringify(r.instructorUids || []) !==
            JSON.stringify(fields.instructorUids)),
    )
    .map((r) => ({ id: r.id, ...fields }));
}
export async function saveCourseAndSchedule(
  sdk,
  db,
  courseId,
  values,
  uid,
  allowCreate = false,
) {
  const names = [
    "calendarEvents",
    "enrollments",
    "exams",
    "examBookings",
    "grades",
  ];
  const snapshots = await Promise.all(
    names.map((name) =>
      sdk.getDocsFromServer(
        sdk.query(
          sdk.collection(db, name),
          sdk.where("courseId", "==", courseId),
          sdk.limit(450),
        ),
      ),
    ),
  );
  if (snapshots.reduce((n, s) => n + s.size, 0) >= 200)
    throw new Error(
      "Kolegij ima previše povezanih evidencija za jedno sigurno spremanje. Ništa nije promijenjeno.",
    );
  return sdk.runTransaction(db, async (tx) => {
    const ref = sdk.doc(db, "courses", courseId),
      old = await tx.get(ref);
    if (!old.exists() && !allowCreate)
      throw new Error("Kolegij više ne postoji.");
    const course = { ...(old.exists() ? old.data() : {}), ...values };
    course.instructorUids = instructorIds(course);
    const profiles = [];
    for (const teacher of course.instructorUids) {
      const user = await tx.get(sdk.doc(db, "users", teacher));
      if (
        !user.exists() ||
        user.data().role !== "profesor" ||
        !user.data().active
      )
        throw new Error(
          "Odaberite aktivne nastavničke račune. UID mora pripadati aktivnom računu s ulogom profesor.",
        );
      profiles.push(user.data());
    }
    if (!course.instructorName && profiles.length)
      course.instructorName = profiles.map((p) => p.name).join("; ");
    const related = [];
    for (let i = 0; i < names.length; i++)
      for (const document of snapshots[i].docs) {
        const fresh = await tx.get(document.ref);
        if (fresh.exists() && fresh.data().courseId === courseId)
          related.push({
            name: names[i],
            ref: document.ref,
            data: fresh.data(),
          });
      }
    const dayLocks = [];
    for (const date of [
      ...new Set(
        related
          .filter((r) => r.name === "calendarEvents")
          .map((r) => r.data.date)
          .filter(Boolean),
      ),
    ].sort()) {
      const lockRef = sdk.doc(db, "calendarLocks", date),
        lock = await tx.get(lockRef);
      dayLocks.push({
        ref: lockRef,
        version: lock.exists() ? lock.data().version : 0,
      });
    }
    const fields = instructorFields(course),
      changes = [];
    for (const row of related) {
      const desired = {
        ...fields,
        ...(["calendarEvents", "exams"].includes(row.name)
          ? { instructorName: course.instructorName || "" }
          : {}),
      };
      if (
        Object.keys(desired).some(
          (k) =>
            JSON.stringify(
              row.data[k] ?? (k === "instructorUids" ? [] : ""),
            ) !== JSON.stringify(desired[k]),
        )
      )
        changes.push({ ...row, fields: desired });
    }
    if (changes.length * 2 + dayLocks.length + 2 > 450)
      throw new Error(
        "Previše promjena za jednu transakciju. Ništa nije spremljeno.",
      );
    const data = {
      ...values,
      ...fields,
      instructorName: course.instructorName || "",
      updatedAt: sdk.serverTimestamp(),
    };
    if (old.exists()) {
      tx.update(ref, data);
      appendAudit(
        tx,
        sdk,
        db,
        "courses",
        courseId,
        old.data(),
        { ...old.data(), ...data },
        uid,
      );
    } else {
      const after = {
        ...data,
        createdAt: sdk.serverTimestamp(),
        createdBy: uid,
      };
      tx.set(ref, after);
      appendAudit(tx, sdk, db, "courses", courseId, null, after, uid);
    }
    for (const change of changes) {
      const after = {
        ...change.data,
        ...change.fields,
        updatedAt: sdk.serverTimestamp(),
      };
      tx.update(change.ref, {
        ...change.fields,
        updatedAt: sdk.serverTimestamp(),
      });
      appendAudit(
        tx,
        sdk,
        db,
        change.name,
        change.ref.id,
        change.data,
        after,
        uid,
      );
    }
    for (const lock of dayLocks)
      tx.set(lock.ref, {
        version: lock.version + 1,
        updatedAt: sdk.serverTimestamp(),
        actorUid: uid,
      });
    return {
      syncedEvents: changes.filter((r) => r.name === "calendarEvents").length,
      syncedRecords: changes.length,
    };
  });
}
