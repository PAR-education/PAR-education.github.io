import { isInstructor } from "../utils/instructors.js";
export const roles = Object.freeze({
  admin: "Administrator",
  administracija_par: "AdministracijaPAR",
  dept_head: "Pročelnik odjela",
  profesor: "Nastavnik",
  lab_assistant: "Voditelj laboratorija",
  student: "Student",
  alumni: "Alumni",
});
export const staffRoles = ["admin", "dept_head", "profesor", "lab_assistant"];
const readers = {
  attendance: ["admin", "administracija_par", "profesor", "student"],
  rooms: Object.keys(roles),
  students: ["admin", "administracija_par", "dept_head"],
  employees: ["admin", "administracija_par", "dept_head"],
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
  workEntries: ["admin", "administracija_par"],
  workPlans: ["admin", "administracija_par"],
  vacations: staffRoles,
  enrollments: ["admin", "administracija_par", "profesor", "student"],
  examBookings: ["admin", "profesor", "student"],
  labBookings: ["admin", "lab_assistant", "student"],
  evaluations: Object.keys(roles),
  notifications: Object.keys(roles),
  users: ["admin"],
};
const writers = {
  workEntries: ["admin", "administracija_par"],
  workPlans: ["admin", "administracija_par"],
  attendance: ["admin", "administracija_par", "profesor"],
  courses: ["admin"],
  calendarEvents: ["admin", "administracija_par", "profesor"],
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
  if (role === "administracija_par")
    return [
      "attendance",
      "enrollments",
      "students",
      "employees",
      "calendarEvents",
      "rooms",
      "courses",
      "documents",
      "notifications",
      "workEntries",
      "workPlans",
    ].includes(collection);
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
// Office staff may add dossiers, but cannot edit existing people or grant account roles.
export function canAdd(role, collection) {
  return (
    canManage(role, collection) ||
    (role === "administracija_par" &&
      ["students", "employees", "notifications"].includes(collection))
  );
}
export function canDelete(role, collection) {
  if (["workEntries", "workPlans"].includes(collection))
    return ["admin", "administracija_par"].includes(role);
  return role !== "administracija_par" && canManage(role, collection);
}
export function isActiveProfile(profile) {
  return profile?.active === true && Object.hasOwn(roles, profile.role);
}
export function canEditCalendar(role, uid, record) {
  return (
    ["admin", "administracija_par"].includes(role) ||
    (role === "profesor" && isInstructor(record, uid))
  );
}
export function canImport(role, name) {
  if (["workEntries", "workPlans"].includes(name))
    return ["admin", "administracija_par"].includes(role);
  if (role === "admin") return Object.hasOwn(readers, name);
  if (role === "profesor")
    return ["calendarEvents", "research"].includes(name);
  if (role === "dept_head")
    return ["projects", "research"].includes(name);
  if (role === "lab_assistant")
    return ["labs", "research"].includes(name);
  return false;
}
export function scopeFor(role, collection) {
  if (
    role === "admin" ||
    (role === "administracija_par" &&
      ["attendance", "enrollments", "workEntries", "workPlans"].includes(
        collection,
      ))
  )
    return null;
  if (role === "lab_assistant" && collection === "labBookings") return null;
  if (["students", "employees"].includes(collection) && role === "dept_head")
    return "departmentId";
  if (
    [
      "employeeSchedules",
      "workEntries",
      "workPlans",
      "vacations",
      "grades",
      "enrollments",
      "examBookings",
      "labBookings",
      "finances",
      "requests",
      "evaluations",
      "notifications",
      "attendance",
    ].includes(collection)
  ) {
    return role === "profesor" &&
      ["grades", "enrollments", "examBookings", "attendance"].includes(
        collection,
      )
      ? "instructorUid"
      : "ownerUid";
  }
  if (collection === "research") return "ownerUid";
  return null;
}
