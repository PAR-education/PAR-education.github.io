import { enrolledForEvent, courseYearKey } from "./academic-year.js";
import { isInstructor, instructorFields } from "./instructors.js";
export const attendanceStatuses = ["Prisutan", "Odsutan", "Opravdano odsutan"];
export const studentKey = (row) => row.studentId || row.ownerUid || row.id;
export function enrollmentForEvent(enrollment, event) {
  return (
    enrollment.status === "Odobreno" &&
    enrolledForEvent(new Set([courseYearKey(enrollment)]), event)
  );
}
export function attendanceValues(event, enrollment, status, profile, uid) {
  if (!attendanceStatuses.includes(status) && status !== "Nije evidentirano")
    throw new Error("Odaberite prisutnost.");
  if (
    !(
      profile.role === "admin" ||
      (profile.role === "profesor" && isInstructor(event, uid))
    )
  )
    throw new Error("Nemate ovlasti za ovu nastavu.");
  if (!enrollmentForEvent(enrollment, event))
    throw new Error("Student nema odobren upis za taj kolegij i godinu.");
  return {
    eventId: event.id,
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId || "",
    ownerUid: enrollment.ownerUid || "",
    studentName: enrollment.ownerName || "Student",
    courseId: event.courseId,
    courseTitle: event.title,
    date: event.date,
    academicYear: event.academicYear || enrollment.academicYear || "",
    ...instructorFields(event),
    status,
  };
}
export function attendanceId(eventId, enrollmentId) {
  return eventId + "__" + enrollmentId;
}
export function attendanceTotals(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.studentId + "::" + row.year;
    const total = groups.get(key) || {
      studentId: row.studentId,
      student: row.student,
      course: "Svi odabrani kolegiji",
      year: row.year,
      total: 0,
      present: 0,
      absent: 0,
      justified: 0,
      unmarked: 0,
    };
    for (const field of ["total", "present", "absent", "justified", "unmarked"])
      total[field] += row[field];
    groups.set(key, total);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    percentage:
      row.present + row.absent + row.justified
        ? Math.round(
            (row.present / (row.present + row.absent + row.justified)) * 1000,
          ) /
            10 +
          "%"
        : "—",
  }));
}
// Unmarked sessions stay unmarked. Percentages use only explicitly recorded sessions.
export function attendanceSummary(events, enrollments, records) {
  const groups = new Map();
  const recorded = new Map(
    records.map((r) => [attendanceId(r.eventId, r.enrollmentId), r.status]),
  );
  for (const enrollment of enrollments.filter((r) => r.status === "Odobreno")) {
    for (const event of events.filter((event) =>
      enrollmentForEvent(enrollment, event),
    )) {
      const year = event.academicYear || enrollment.academicYear || "";
      const key =
        studentKey(enrollment) + "::" + enrollment.courseId + "::" + year;
      const group = groups.get(key) || {
        studentId: studentKey(enrollment),
        student: enrollment.ownerName || "Student",
        course: enrollment.courseTitle || event.title,
        year,
        sessions: new Map(),
      };
      const status = recorded.get(attendanceId(event.id, enrollment.id));
      if (!group.sessions.has(event.id) || status)
        group.sessions.set(event.id, status || "Nije evidentirano");
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const statuses = [...group.sessions.values()],
        present = statuses.filter((s) => s === "Prisutan").length,
        absent = statuses.filter((s) => s === "Odsutan").length,
        justified = statuses.filter((s) => s === "Opravdano odsutan").length,
        marked = present + absent + justified;
      return {
        student: group.student,
        studentId: group.studentId,
        course: group.course,
        year: group.year,
        total: statuses.length,
        present,
        absent,
        justified,
        unmarked: statuses.length - marked,
        percentage: marked
          ? Math.round((present / marked) * 1000) / 10 + "%"
          : "—",
      };
    })
    .sort(
      (a, b) =>
        a.student.localeCompare(b.student, "hr") ||
        a.course.localeCompare(b.course, "hr"),
    );
}
