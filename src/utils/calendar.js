export const calendarSources = {
  calendarEvents: "Kalendar i raspored",
  courses: "Kolegiji (odabrani tjedan)",
  exams: "Ispitni rokovi",
  alumniEvents: "Alumni događaji",
  employeeSchedules: "Raspored zaposlenika",
  vacations: "Godišnji odmori",
};
export function zagrebDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function weekMonday(date = zagrebDate()) {
  const value = new Date(date + "T12:00:00Z"),
    offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}
function addDays(date, days) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function zonedUTC(date, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Događaj nema ispravan datum i vrijeme.");
  const desired = Date.parse(date + "T" + time + ":00Z");
  let value = desired;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
    );
    const actual = Date.parse(
      p.year +
        "-" +
        p.month +
        "-" +
        p.day +
        "T" +
        p.hour +
        ":" +
        p.minute +
        ":" +
        p.second +
        "Z",
    );
    if (actual === desired) return new Date(value).toISOString();
    value += desired - actual;
  }
  throw new Error(
    "Vrijeme događaja ne postoji zbog promjene ljetnog/zimskog vremena.",
  );
}
export function calendarItems(
  records,
  { monday = weekMonday(), duration = 60 } = {},
) {
  const items = [];
  for (const [module, rows] of Object.entries(records))
    for (const row of rows) {
      let date = row.date,
        time = row.time || row.startTime || "09:00",
        endTime = row.endTime,
        allDay = false,
        endDate;
      if (module === "courses")
        date = addDays(
          weekMonday(monday),
          ["Pon", "Uto", "Sri", "Čet", "Pet"].indexOf(row.day),
        );
      if (module === "vacations") {
        date = row.startDate;
        endDate = addDays(row.endDate, 1);
        allDay = true;
      }
      if (module === "alumniEvents") {
        endDate = addDays(date, 1);
        allDay = true;
      }
      if (
        module === "employeeSchedules" &&
        ["Slobodan dan", "Bolovanje", "Godišnji odmor"].includes(row.activity)
      ) {
        endDate = addDays(date, 1);
        allDay = true;
      }
      const start = allDay ? date : zonedUTC(date, time);
      const end = allDay
        ? endDate
        : endTime && endTime > time
          ? zonedUTC(date, endTime)
          : new Date(
              Date.parse(start) + Number(duration) * 60000,
            ).toISOString();
      items.push({
        uid: module + "-" + row.id + "@par-education",
        module,
        id: row.id,
        title:
          row.title ||
          row.courseTitle ||
          (row.ownerName || "Zaposlenik") +
            " · " +
            (row.activity || "Godišnji odmor"),
        location: row.room || row.location || "",
        instructorName: row.instructorName || row.instructor || "",
        description: [
          row.title || row.courseTitle
            ? "Naziv: " + (row.title || row.courseTitle)
            : "",
          row.room || row.location
            ? "Dvorana / lokacija: " + (row.room || row.location)
            : "",
          row.instructorName || row.instructor
            ? "Profesor: " + (row.instructorName || row.instructor)
            : "",
          row.description,
          row.details,
        ]
          .filter(
            (value, index, values) => value && values.indexOf(value) === index,
          )
          .join("\n"),
        start,
        end,
        allDay,
      });
    }
  return items.sort(
    (a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid),
  );
}
const stamp = (value) => value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsEscape = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
export function foldICS(line) {
  const encoder = new TextEncoder();
  let result = "",
    segment = "",
    length = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (length + size > 75) {
      result += segment + "\r\n";
      segment = " ";
      length = 1;
    }
    segment += char;
    length += size;
  }
  return result + segment;
}
export function calendarICS(items, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PAR Education//ERP Calendar//HR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:PAR Education",
  ];
  for (const item of items)
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + icsEscape(item.uid),
      "DTSTAMP:" + stamp(now.toISOString()),
      item.allDay
        ? "DTSTART;VALUE=DATE:" + stamp(item.start)
        : "DTSTART:" + stamp(item.start),
      item.allDay
        ? "DTEND;VALUE=DATE:" + stamp(item.end)
        : "DTEND:" + stamp(item.end),
      "SUMMARY:" + icsEscape(item.title),
      "DESCRIPTION:" + icsEscape(item.description),
      "LOCATION:" + icsEscape(item.location),
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(foldICS).join("\r\n") + "\r\n";
}
export function googleCalendarURL(item) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: stamp(item.start) + "/" + stamp(item.end),
    details: item.description,
    location: item.location,
    ctz: "Europe/Zagreb",
  }).toString();
  return url.href;
}
export function calendarDateLabel(item) {
  if (item.allDay)
    return item.start.split("-").reverse().join(".") + " · cijeli dan";
  return new Intl.DateTimeFormat("hr-HR", {
    timeZone: "Europe/Zagreb",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(item.start));
}
