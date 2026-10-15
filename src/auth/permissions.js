export const roles = Object.freeze({
  admin: "Administrator",
  dept_head: "Pročelnik odjela",
  profesor: "Nastavnik",
  lab_assistant: "Voditelj laboratorija",
  student: "Student",
  alumni: "Alumni",
});
export const staffRoles = ["admin", "dept_head", "profesor", "lab_assistant"];
const readers = {
  students: ["admin", "dept_head"],
  employees: ["admin", "dept_head"],
  courses: Object.keys(roles),
  calendarEvents: Object.keys(roles),
  exams: ["admin", "dept_head", "profesor", "student"],
  grades: ["admin", "profesor", "student"],
  projects: staffRoles,
  research: staffRoles,
  labs: ["admin", "lab_assistant", "student"],
  documents: Object.keys(roles),
  requests: ["admin", "student", "alumni"],
  alumniEvents: ["admin", "alumni"],
  finances: ["admin", "student"],
  employeeSchedules: staffRoles,
  workEntries: staffRoles,
  vacations: staffRoles,
  enrollments: ["admin", "profesor", "student"],
  examBookings: ["admin", "profesor", "student"],
  labBookings: ["admin", "lab_assistant", "student"],
  evaluations: Object.keys(roles),
  notifications: Object.keys(roles),
  users: ["admin"],
};
const writers = {
  courses: ["admin"],
  calendarEvents: ["admin", "profesor"],
  exams: ["admin", "profesor"],
  grades: ["admin", "profesor"],
  projects: ["admin", "dept_head"],
  research: staffRoles,
  labs: ["admin", "lab_assistant"],
  documents: ["admin"],
  alumniEvents: ["admin"],
  employeeSchedules: ["admin"],
};
export function canRead(role, collection) {
  return (
    Object.hasOwn(readers, collection) && readers[collection].includes(role)
  );
}
export function canManage(role, collection) {
  return (
    (role === "admin" && Object.hasOwn(readers, collection)) ||
    (Object.hasOwn(writers, collection) && writers[collection].includes(role))
  );
}
export function isActiveProfile(profile) {
  return profile?.active === true && Object.hasOwn(roles, profile.role);
}
export function canEditCalendar(role, uid, record) {
  return (
    role === "admin" || (role === "profesor" && record.instructorUid === uid)
  );
}
export function canImport(role, name) {
  if (role === "admin") return Object.hasOwn(readers, name);
  if (role === "profesor")
    return ["calendarEvents", "workEntries", "research"].includes(name);
  if (role === "dept_head")
    return ["projects", "workEntries", "research"].includes(name);
  if (role === "lab_assistant")
    return ["labs", "workEntries", "research"].includes(name);
  return false;
}
export function scopeFor(role, collection) {
  if (role === "admin") return null;
  if (role === "lab_assistant" && collection === "labBookings") return null;
  if (["students", "employees"].includes(collection) && role === "dept_head")
    return "departmentId";
  if (
    [
      "employeeSchedules",
      "workEntries",
      "vacations",
      "grades",
      "enrollments",
      "examBookings",
      "labBookings",
      "finances",
      "requests",
      "evaluations",
      "notifications",
    ].includes(collection)
  ) {
    return role === "profesor" &&
      ["grades", "enrollments", "examBookings"].includes(collection)
      ? "instructorUid"
      : "ownerUid";
  }
  if (collection === "research") return "ownerUid";
  return null;
}
