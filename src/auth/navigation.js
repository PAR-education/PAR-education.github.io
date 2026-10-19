import { canRead } from "./permissions.js";
import { modules } from "../modules/catalog.js";
const primary = {
  administracija_par: [
    "calendarEvents",
    "students",
    "employees",
    "courses",
    "rooms",
    "notifications",
  ],
  student: [
    "calendarEvents",
    "attendance",
    "courses",
    "exams",
    "examBookings",
    "grades",
    "enrollments",
    "requests",
    "finances",
  ],
  profesor: [
    "calendarEvents",
    "attendance",
    "courses",
    "enrollments",
    "exams",
    "examBookings",
    "grades",
  ],
  dept_head: ["students", "employees", "calendarEvents", "courses", "projects"],
  lab_assistant: ["labs", "labBookings", "calendarEvents"],
  alumni: ["alumniEvents", "documents", "requests"],
};
const personal = {
  dashboard: "Moj pregled",
  calendarEvents: "Moj raspored",
  grades: "Moje ocjene",
  finances: "Moje financije",
  requests: "Moje zamolbe",
};
export function navigationLabel(role, name) {
  if (role === "administracija_par" && name === "employees")
    return "Profesori i zaposlenici";
  if (role === "administracija_par" && name === "dashboard")
    return "Studentski ured";
  if (role === "student" && name === "attendance") return "Moja prisutnost";
  if (role === "admin") return modules[name]?.title || "Nadzorna ploča";
  if (name === "calendarEvents" && !["student", "profesor"].includes(role))
    return "Raspored";
  if (name === "grades" && role === "profesor") return "Ocjene studenata";
  if (name === "courses" && role === "profesor") return "Moji kolegiji";
  if (name === "enrollments")
    return role === "profesor" ? "Studenti i upisi" : "Moji upisi";
  return personal[name] || modules[name]?.title || name;
}
export function roleNavigation(role) {
  const allowed = Object.keys(modules).filter((n) => canRead(role, n));
  if (role === "admin") return { primary: allowed, more: [] };
  const main = (primary[role] || []).filter((n) => allowed.includes(n));
  return { primary: main, more: allowed.filter((n) => !main.includes(n)) };
}
