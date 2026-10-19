import { canonicalRoom } from "../utils/rooms.js";
import { canEditCalendar } from "../auth/permissions.js";
import { isInstructor, instructorFields } from "../utils/instructors.js";
import { teachingConflicts, revisionOf } from "../utils/schedule.js";
import { validateFields } from "../utils/validation.js";
import { modules } from "../modules/catalog.js";
import { appendAudit } from "./audit.js";
export async function saveCalendarRecord(
  sdk,
  db,
  user,
  profile,
  values,
  id,
  options = {},
) {
  const registry = (
    await sdk.getDocsFromServer(sdk.collection(db, "rooms"))
  ).docs.map((d) => d.data());
  values = { ...values, room: canonicalRoom(values.room, registry) };
  const ref = sdk.doc(db, "calendarEvents", id);
  for (let attempt = 0; attempt < 4; attempt++) {
    const observed = await sdk.getDocFromServer(ref);
    const previous = observed.exists() ? observed.data() : null;
    if (options.requireNew && previous)
      throw new Error("Zapis s tim ID-em već postoji.");
    const dates = [
      ...new Set([values.date, previous?.date].filter(Boolean)),
    ].sort();
    if (!dates.length) throw new Error("Odaberite datum.");
    const guards = await Promise.all(
      dates.map((date) =>
        sdk.getDocFromServer(sdk.doc(db, "calendarLocks", date)),
      ),
    );
    const days = await Promise.all(
      dates.map((date) =>
        sdk.getDocsFromServer(
          sdk.query(
            sdk.collection(db, "calendarEvents"),
            sdk.where("date", "==", date),
          ),
        ),
      ),
    );
    const events = days.flatMap((day) =>
      day.docs.map((doc) => ({
        ...doc.data(),
        room: canonicalRoom(doc.data().room, registry),
        id: doc.id,
      })),
    );
    try {
      return await sdk.runTransaction(db, async (tx) => {
        const latest = await tx.get(ref);
        const current = latest.exists() ? latest.data() : null;
        if (
          JSON.stringify(current?.updatedAt || null) !==
          JSON.stringify(previous?.updatedAt || null)
        ) {
          const error = new Error("schedule-retry");
          throw error;
        }
        if (
          options.expected &&
          (!current || revisionOf({ ...current, id }) !== options.expected)
        )
          throw new Error(
            "Raspored je u međuvremenu izmijenjen. Osvježite prikaz.",
          );
        if (current && !canEditCalendar(profile.role, user.uid, current))
          throw new Error("Nemate ovlasti za tuđu nastavu.");
        const locks = [];
        for (let i = 0; i < dates.length; i++) {
          const lockRef = sdk.doc(db, "calendarLocks", dates[i]),
            lock = await tx.get(lockRef);
          const expected = guards[i].exists() ? guards[i].data().version : 0;
          const version = lock.exists() ? lock.data().version : 0;
          if (version !== expected) throw new Error("schedule-retry");
          locks.push({ ref: lockRef, version });
        }
        let data = { ...(current || {}), ...values };
        if (data.courseId) {
          const course = await tx.get(sdk.doc(db, "courses", data.courseId));
          if (!course.exists()) throw new Error("Kolegij nije pronađen.");
          if (
            profile.role === "profesor" &&
            !isInstructor(course.data(), user.uid)
          )
            throw new Error("Kolegij nije dodijeljen nastavniku.");
          Object.assign(data, instructorFields(course.data()));
          if (!data.academicYear && course.data().academicYear)
            data.academicYear = course.data().academicYear;
          data.instructorName =
            course.data().instructorName || data.instructorName || "";
        } else if (!["admin", "administracija_par"].includes(profile.role))
          throw new Error("Odaberite dodijeljeni kolegij.");
        const business = validateFields(modules.calendarEvents.fields, data);
        const conflicts = teachingConflicts(events, business, id);
        if (conflicts.length)
          throw new Error(
            `Zauzeto: ${conflicts.map((r) => r.title + " · " + r.time).join("; ")}`,
          );
        const after = {
          ...business,
          createdAt:
            current?.createdAt ||
            options.original?.createdAt ||
            sdk.serverTimestamp(),
          createdBy:
            current?.createdBy || options.original?.createdBy || user.uid,
          updatedAt: sdk.serverTimestamp(),
        };
        tx.set(ref, after);
        for (const lock of locks)
          tx.set(lock.ref, {
            version: lock.version + 1,
            updatedAt: sdk.serverTimestamp(),
            actorUid: user.uid,
          });
        appendAudit(
          tx,
          sdk,
          db,
          "calendarEvents",
          id,
          current,
          after,
          user.uid,
          options.action,
        );
        return { id, record: business };
      });
    } catch (error) {
      if (error.message === "schedule-retry" && attempt < 3) continue;
      throw error;
    }
  }
}
