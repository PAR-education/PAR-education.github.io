export function instructorIds(record = {}) {
  return [
    ...new Set(
      [
        record.instructorUid,
        ...(Array.isArray(record.instructorUids) ? record.instructorUids : []),
      ].filter(Boolean),
    ),
  ];
}
export function isInstructor(record, uid) {
  return !!uid && instructorIds(record).includes(uid);
}
export function instructorFields(course) {
  return {
    instructorUid: course.instructorUid || "",
    instructorUids: instructorIds(course),
  };
}
