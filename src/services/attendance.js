import { attendanceId, attendanceValues } from "../utils/attendance.js";
import { appendAudit } from "./audit.js";
export async function saveAttendanceRecord(sdk, db, user, profile, values, id) {
  if (id !== attendanceId(values.eventId, values.enrollmentId))
    throw new Error("Neispravan zapis prisutnosti.");
  const ref = sdk.doc(db, "attendance", id);
  return sdk.runTransaction(db, async (tx) => {
    const event = await tx.get(sdk.doc(db, "calendarEvents", values.eventId));
    const enrollment = await tx.get(
      sdk.doc(db, "enrollments", values.enrollmentId),
    );
    const previous = await tx.get(ref);
    if (!event.exists() || !enrollment.exists())
      throw new Error("Termin ili upis više ne postoji. Osvježite evidenciju.");
    const data = attendanceValues(
      { ...event.data(), id: event.id },
      { ...enrollment.data(), id: enrollment.id },
      values.status,
      profile,
      user.uid,
    );
    const before = previous.exists() ? previous.data() : null;
    if (profile.role === "student" && before)
      throw new Error(
        "Prisutnost je već evidentirana. Ispravak radi nastavnik ili studentski ured.",
      );
    const after = {
      ...data,
      createdAt: before?.createdAt || sdk.serverTimestamp(),
      createdBy: before?.createdBy || user.uid,
      updatedAt: sdk.serverTimestamp(),
    };
    tx.set(ref, after);
    appendAudit(tx, sdk, db, "attendance", id, before, after, user.uid);
    return { id };
  });
}
