import { calendarItems } from "./calendar.js";
export function courseCalendarItems(course, events) {
  return calendarItems({
    calendarEvents: events
      .filter(
        (row) =>
          row.courseId === course.id &&
          (!course.academicYear ||
            !row.academicYear ||
            course.academicYear === row.academicYear),
      )
      .map((row) => ({
        ...row,
        title: row.title || course.title,
        instructorName: row.instructorName || course.instructorName || "",
      })),
  });
}
