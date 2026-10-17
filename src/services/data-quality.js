import { instructorIds } from "../utils/instructors.js";
export function dataQuality(data) {
  const issues = [];
  const add = (module, row, reason) => issues.push({ module, row, reason });
  for (const row of data.students || []) {
    if (!row.ownerUid) add("students", row, "Studentski račun nije povezan");
    if (!row.email) add("students", row, "Nedostaje e-adresa");
  }
  for (const row of data.courses || [])
    if (!instructorIds(row).length)
      add("courses", row, "Nastavnik nije dodijeljen");
  for (const row of data.calendarEvents || []) {
    if (!row.room) add("calendarEvents", row, "Dvorana nije određena");
    if (!instructorIds(row).length)
      add("calendarEvents", row, "Nastavnik nije dodijeljen");
    if (
      row.courseId &&
      !(data.courses || []).some((c) => c.id === row.courseId)
    )
      add("calendarEvents", row, "Kolegij nije pronađen");
  }
  for (const row of data.enrollments || []) {
    const course = (data.courses || []).find((c) => c.id === row.courseId);
    if (course?.academicYear && !row.academicYear)
      add(
        "enrollments",
        row,
        "Dopunite akademsku godinu starog upisa prije novog ciklusa",
      );
    if (!row.ownerUid) add("enrollments", row, "Upis nije povezan s računom");
    if (!(data.courses || []).some((c) => c.id === row.courseId))
      add("enrollments", row, "Kolegij nije pronađen");
    if (
      row.studentId &&
      !(data.students || []).some((s) => s.id === row.studentId)
    )
      add("enrollments", row, "Studentski dosje nije pronađen");
  }
  for (const name of ["students", "courses", "rooms"]) {
    const seen = new Map();
    for (const row of data[name] || []) {
      const key = String(
        name === "students"
          ? row.jmbag || row.email || row.name
          : row.title || row.name,
      )
        .trim()
        .toLowerCase();
      if (seen.has(key))
        add(name, row, "Mogući duplikat — provjerite prije spajanja");
      seen.set(key, row);
    }
  }
  return issues;
}
