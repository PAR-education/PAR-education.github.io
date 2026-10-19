import {
  courseNoticeRecipients,
  courseNoticeValues,
  courseNoticeId,
} from "../utils/course-notices.js";
import { appendAudit } from "./audit.js";
export async function sendCourseNotice(
  sdk,
  db,
  user,
  profile,
  draft,
  operationId,
  onProgress,
) {
  if (profile.role !== "profesor" || !profile.active)
    throw new Error("Slanje je dostupno nastavniku za njegove kolegije.");
  const courseRef = sdk.doc(db, "courses", draft.courseId);
  const courseSnapshot = await sdk.getDocFromServer(courseRef);
  const course = courseSnapshot.exists()
    ? { ...courseSnapshot.data(), id: courseSnapshot.id }
    : null;
  // Read by instructor scope, using the repository's paginated enrollment loader.
  const recipients = courseNoticeRecipients(
    course,
    draft.enrollments,
    user.uid,
    draft.academicYear,
  );
  if (!recipients.length)
    throw new Error(
      "Nema odobrenih upisa s povezanim korisničkim računom za ovu godinu.",
    );
  let sent = 0;
  for (const enrollment of recipients) {
    try {
      const id = await courseNoticeId(operationId, enrollment.ownerUid),
        ref = sdk.doc(db, "notifications", id);
      await sdk.runTransaction(db, async (tx) => {
        const previous = await tx.get(ref);
        if (previous.exists()) {
          const old = previous.data();
          if (
            old.createdBy !== user.uid ||
            old.ownerUid !== enrollment.ownerUid ||
            old.courseId !== draft.courseId ||
            (old.academicYear || "") !== draft.academicYear ||
            old.title !== draft.title.trim() ||
            old.message !== draft.message.trim()
          )
            throw new Error(
              "Ovaj pokušaj slanja sadrži drugu poruku. Otvorite novi obrazac.",
            );
          return;
        }
        const liveCourse = await tx.get(courseRef),
          liveEnrollment = await tx.get(
            sdk.doc(db, "enrollments", enrollment.id),
          );
        if (!liveCourse.exists() || !liveEnrollment.exists())
          throw new Error("Kolegij ili upis više ne postoji.");
        const values = courseNoticeValues(
          { ...liveCourse.data(), id: liveCourse.id },
          { ...liveEnrollment.data(), id: liveEnrollment.id },
          user.uid,
          draft,
        );
        if (values.ownerUid !== enrollment.ownerUid)
          throw new Error(
            "Račun studenta je promijenjen. Ponovno otvorite obrazac.",
          );
        const after = {
          ...values,
          createdBy: user.uid,
          createdAt: sdk.serverTimestamp(),
          updatedAt: sdk.serverTimestamp(),
        };
        tx.set(ref, after);
        appendAudit(tx, sdk, db, "notifications", id, null, after, user.uid);
      });
      sent++;
      onProgress?.({ sent, total: recipients.length });
    } catch (error) {
      throw new Error(
        `Dostavljeno ${sent}/${recipients.length}. ${error.message} Ponovite slanje za preostale; već poslane poruke neće se ponoviti.`,
      );
    }
  }
  return { sent, total: recipients.length };
}
