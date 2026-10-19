import { appendAudit } from "./audit.js";
import { validateFields } from "../utils/validation.js";
import { modules } from "../modules/catalog.js";
import { validateNotice } from "../utils/notices.js";
import { getFirebase } from "../config/firebase.js";
export async function notifyChange(context, name, id, row, decision) {
  if (!["calendarEvents", "enrollments", "examBookings"].includes(name))
    return { sent: 0 };
  // Office scheduling does not grant access to enrollments or broadcast messages.
  if (context.profile.role === "administracija_par") return { sent: 0 };
  let recipients = [];
  if (name === "calendarEvents" && row.courseId) {
    const enrollments = await context.repository.listAll("enrollments");
    recipients = enrollments
      .filter(
        (r) =>
          r.courseId === row.courseId &&
          r.status === "Odobreno" &&
          (!row.academicYear ||
            !r.academicYear ||
            r.academicYear === row.academicYear),
      )
      .map((r) => r.ownerUid);
  } else if (row.ownerUid) recipients = [row.ownerUid];
  recipients = [...new Set(recipients.filter(Boolean))];
  const title =
    name === "calendarEvents" ? "Promjena rasporeda" : "Odluka o prijavi";
  const message =
    name === "calendarEvents"
      ? `${row.title} · ${row.date} · ${row.time}${row.endTime ? " – " + row.endTime : ""} · ${row.room || "Dvorana nije određena"} · ${row.instructorName || ""}`
      : `${row.courseTitle || row.title || "Prijava"}: ${decision}`;
  const values = recipients.map((ownerUid) => ({
    ownerUid,
    title,
    message,
    sourceModule: name,
    sourceId: id,
  }));
  if (context.demo) {
    context.repository.data.notifications ||= [];
    for (const row of values)
      context.repository.data.notifications.push({
        ...row,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
  } else {
    const { db, firestore: sdk } = await getFirebase();
    for (let offset = 0; offset < values.length; offset += 100) {
      const batch = sdk.writeBatch(db);
      for (const value of values.slice(offset, offset + 100))
        batch.set(sdk.doc(sdk.collection(db, "notifications")), {
          ...value,
          createdAt: sdk.serverTimestamp(),
          updatedAt: sdk.serverTimestamp(),
          createdBy: context.user.uid,
        });
      await batch.commit();
    }
  }
  return { sent: values.length };
}
// Notifications are secondary: never report a successful record write as a failed write.
export async function notifyChangeSafely(context, ...args) {
  try {
    return await notifyChange(context, ...args);
  } catch (error) {
    return {
      sent: 0,
      warning:
        "Promjena je spremljena, ali obavijesti nisu poslane: " + error.message,
    };
  }
}

// Broadcasts have a generated ID and require no user-directory or private inbox reads.
export async function saveAnnouncementRecord(sdk, db, user, profile, values) {
  const data = validateFields(modules.notifications.fields, values);
  validateNotice(data, profile.role);
  if (!data.audience) throw new Error("Odaberite primatelje obavijesti.");
  const ref = sdk.doc(sdk.collection(db, "notifications"));
  const after = {
    ...data,
    createdAt: sdk.serverTimestamp(),
    updatedAt: sdk.serverTimestamp(),
    createdBy: user.uid,
  };
  await sdk.runTransaction(db, async (tx) => {
    tx.set(ref, after);
    appendAudit(tx, sdk, db, "notifications", ref.id, null, after, user.uid);
  });
  return { id: ref.id, record: after };
}
