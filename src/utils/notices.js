export const noticeAudiences = Object.freeze({
  student: "Svi studenti",
  profesor: "Svi profesori",
  students_professors: "Studenti i profesori",
});
export function canSendAnnouncement(role) {
  return ["admin", "administracija_par", "profesor"].includes(role);
}
export function audiencesFor(role) {
  if (["admin", "administracija_par"].includes(role))
    return Object.keys(noticeAudiences);
  return ["student", "profesor"].includes(role)
    ? [role, "students_professors"]
    : [];
}
export function visibleNotice(row, role, uid) {
  return (
    role === "admin" ||
    row.ownerUid === uid ||
    audiencesFor(role).includes(row.audience)
  );
}
export function validateNotice(values, role) {
  if (values.audience) {
    if (
      !["admin", "administracija_par"].includes(role) ||
      !Object.hasOwn(noticeAudiences, values.audience) ||
      values.ownerUid ||
      values.sourceModule ||
      values.sourceId
    )
      throw new Error("Nemate ovlasti za ovu skupnu obavijest.");
  } else if (!values.ownerUid || role === "administracija_par")
    throw new Error("Odaberite primatelje obavijesti.");
}
export function noticeTime(row) {
  const value = row.createdAt;
  return typeof value?.seconds === "number"
    ? value.seconds * 1000
    : Date.parse(value) || 0;
}
