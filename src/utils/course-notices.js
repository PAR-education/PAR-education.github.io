import { isInstructor } from "./instructors.js";
import { modules } from "../modules/catalog.js";
import { validateFields } from "./validation.js";
export function courseNoticeRecipients(course, enrollments, uid, year) {
  if (!course || !isInstructor(course, uid))
    throw new Error("Odaberite svoj kolegij.");
  if (course.academicYear && course.academicYear !== year)
    throw new Error("Odaberite akademsku godinu kolegija.");
  return [
    ...new Map(
      enrollments
        .filter(
          (en) =>
            en.courseId === course.id &&
            en.status === "Odobreno" &&
            (en.academicYear || "") === year &&
            en.ownerUid,
        )
        .map((en) => [en.ownerUid, en]),
    ).values(),
  ];
}
export function courseNoticeValues(course, enrollment, uid, draft) {
  if (
    !courseNoticeRecipients(course, [enrollment], uid, draft.academicYear)
      .length
  )
    throw new Error("Student nema odobren upis za odabrani kolegij i godinu.");
  return validateFields(modules.notifications.fields, {
    ownerUid: enrollment.ownerUid,
    title: draft.title,
    message: draft.message,
    sourceModule: "courses",
    sourceId: course.id,
    courseId: course.id,
    courseTitle: course.title,
    academicYear: draft.academicYear,
    enrollmentId: enrollment.id,
  });
}
export async function courseNoticeId(operationId, uid) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(operationId))
    throw new Error("Ponovno otvorite obrazac za slanje.");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(uid),
  );
  return (
    "course-" +
    operationId +
    "-" +
    [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
