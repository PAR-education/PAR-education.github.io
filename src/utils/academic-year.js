export function enrollmentId(courseId, uid, year = "") {
  if (year && !/^\d{4}\/\d{4}$/.test(year))
    throw new Error("Akademska godina mora biti u obliku 2026/2027.");
  if (year && Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1)
    throw new Error("Akademska godina mora sadržavati uzastopne godine.");
  return `${courseId}__${uid}${year ? "__" + year.slice(0, 4) : ""}`;
}

export function courseYearKey(record) {
  return `${record.courseId || record.id}::${record.academicYear || ""}`;
}

export function enrolledForEvent(keys, event) {
  return keys?.has(courseYearKey(event)) || keys?.has(`${event.courseId}::`);
}
