import { courseYearKey, enrolledForEvent } from "../utils/academic-year.js";
import { canRead } from "../auth/permissions.js";
import { isInstructor } from "../utils/instructors.js";
import { zagrebDate } from "../utils/calendar.js";
export async function dashboardModel(context) {
  const { role } = context.profile,
    uid = context.user.uid;
  const choices =
    {
      admin: ["students", "employees", "enrollments", "requests"],
      student: ["enrollments", "grades", "requests", "finances"],
      profesor: ["courses", "calendarEvents", "enrollments", "examBookings"],
      dept_head: ["students", "employees", "projects", "calendarEvents"],
      lab_assistant: ["labs", "labBookings", "calendarEvents"],
      alumni: ["alumniEvents", "requests", "documents"],
    }[role] || [];
  const names = [
    ...new Set([
      ...choices,
      "calendarEvents",
      "notifications",
      ...(role === "student" ? ["enrollments"] : []),
    ]),
  ].filter((n) => canRead(role, n));
  const results = await Promise.allSettled(
    names.map((n) => context.repository.listAll(n)),
  );
  const records = Object.fromEntries(
    names.map((n, i) => [
      n,
      results[i].status === "fulfilled" ? results[i].value : [],
    ]),
  );
  const enrolled = new Set(
    (records.enrollments || [])
      .filter((r) => r.status === "Odobreno")
      .map(courseYearKey),
  );
  let events = records.calendarEvents || [];
  if (role === "student")
    events = events.filter((r) => enrolledForEvent(enrolled, r));
  if (role === "profesor") events = events.filter((r) => isInstructor(r, uid));
  const today = zagrebDate();
  const stats = choices.map((name) => {
    let rows = records[name] || [],
      label = name,
      value = rows.length,
      detail = "Ukupno";
    if (role === "profesor" && name === "courses") {
      rows = rows.filter((r) => isInstructor(r, uid));
      value = rows.length;
      label = "Moji kolegiji";
    }
    if (name === "calendarEvents") {
      value = events.filter((r) => r.date === today).length;
      label = "Nastava danas";
      detail = "Današnji termini";
    }
    if (["requests", "examBookings", "labBookings"].includes(name)) {
      value = rows.filter((r) => r.status === "Na čekanju").length;
      detail = "Na čekanju";
    }
    if (name === "finances") {
      value = new Intl.NumberFormat("hr-HR", {
        style: "currency",
        currency: "EUR",
      }).format(
        rows
          .filter((r) => r.status !== "Plaćeno")
          .reduce((sum, r) => sum + Number(r.amount || 0), 0),
      );
      label = "Moje dugovanje";
      detail = "Otvorene obveze";
    }
    return { name, label, value, detail };
  });
  return {
    stats,
    upcoming: events
      .filter((r) => r.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 5),
    notices: (records.notifications || [])
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 3),
    unavailable: names.filter((n, i) => results[i].status === "rejected"),
    failures: results
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason),
  };
}
