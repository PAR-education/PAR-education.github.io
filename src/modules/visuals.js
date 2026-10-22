import { escapeHTML as e } from "../utils/helpers.js";
export const icons = {
  attendance: "clipboard-check",
  dashboard: "chart-pie",
  rooms: "door-open",
  students: "users",
  employees: "id-badge",
  courses: "book-open",
  exams: "calendar-check",
  grades: "award",
  enrollments: "user-graduate",
  examBookings: "clipboard-check",
  calendarEvents: "calendar-days",
  projects: "rocket",
  research: "microscope",
  labs: "network-wired",
  labBookings: "toolbox",
  documents: "folder-open",
  requests: "clipboard-list",
  finances: "file-invoice-dollar",
  employeeSchedules: "calendar-week",
  workEntries: "business-time",
  vacations: "plane-departure",
  alumniEvents: "user-tie",
  evaluations: "list-check",
  notifications: "bell",
  users: "user-shield",
  help: "circle-question",
};
export const icon = (name) =>
  `<i class="fa-solid fa-${icons[name] || name}" aria-hidden="true"></i>`;
const initials = (name) =>
  String(name || "PAR")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const date = (value) =>
  value ? String(value).split("-").reverse().join(".") : "—";
const money = (value) =>
  new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const open = (i, label = "Detalji") =>
  `<button class="button card-link" data-row="${i}">${e(label)} ${icon("arrow-right")}</button>`;
const cards = (rows, render, classes = "") =>
  `<div class="record-grid ${classes}">${rows.map(render).join("")}</div>`;
export function visualRecords(name, rows, badge) {
  if (name === "enrollments") {
    const groups = new Map();
    rows.forEach((row, index) => {
      const key = row.studentId
        ? "student:" + row.studentId
        : row.ownerUid
          ? "uid:" + row.ownerUid
          : "name:" +
            String(row.ownerName || "Neimenovani student")
              .trim()
              .toLocaleLowerCase("hr");
      if (!groups.has(key))
        groups.set(key, {
          name: row.ownerName || "Neimenovani student",
          items: [],
        });
      groups.get(key).items.push({ row, index });
    });
    return `<div class="enrollment-groups">${[...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "hr"))
      .map(
        (group) =>
          `<section class="panel enrollment-student"><h2>${icon("user-graduate")} ${e(group.name)} <span class="muted">(${group.items.length})</span></h2><div class="table-scroll"><table><thead><tr><th scope="col">Kolegij</th><th scope="col">Status</th><th scope="col">Detalji</th></tr></thead><tbody>${group.items
            .sort((a, b) =>
              String(a.row.courseTitle || "").localeCompare(
                String(b.row.courseTitle || ""),
                "hr",
              ),
            )
            .map(
              ({ row, index }) =>
                `<tr><td>${e(row.courseTitle)}</td><td>${badge(row.status)}</td><td>${open(index, "Otvori")}</td></tr>`,
            )
            .join("")}</tbody></table></div></section>`,
      )
      .join("")}</div>`;
  }
  if (["students", "grades", "labs", "finances", "vacations"].includes(name)) {
    const headers = {
      students: ["Student", "Kontakt", "Status", "Prosjek"],
      grades: ["Student", "Kolegij", "Datum unosa", "Ocjena (1–5)"],
      labs: ["Oznaka / naziv", "Kategorija", "Status"],
      finances: ["Student / opis", "Iznos", "Dospijeće", "Status"],
      vacations: ["Zaposlenik", "Period", "Dani", "Status"],
    }[name];
    return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}<th>Akcija</th></tr></thead><tbody>${rows
      .map((r, i) => {
        let cells;
        if (name === "students")
          cells = [
            `<span class="student-name"><span class="student-avatar">${e(initials(r.name))}</span><strong>${e(r.name)}</strong></span>`,
            `${e(r.jmbag)}<small class="cell-note">${e(r.email)}</small>`,
            `${r.year ? e(r.year) + ". godina" : "Godina nije navedena"}<small class="cell-note">${badge(r.status)}</small>`,
            r.gpa
              ? `<strong class="${r.gpa < 3 ? "risk-grade" : ""}">${e(r.gpa)}</strong><small class="cell-note">${e(r.ects)} ECTS</small>`
              : "—",
          ];
        if (name === "grades")
          cells = [
            `<strong>${icon("user-graduate")} ${e(r.studentName)}</strong>`,
            e(r.courseTitle),
            e(date(r.date)),
            `<span class="grade-value">${e(["", "Nedovoljan", "Dovoljan", "Dobar", "Vrlo dobar", "Izvrstan"][r.grade])} (${e(r.grade)})</span>`,
          ];
        if (name === "labs")
          cells = [
            `<strong>${e(r.title)}</strong><small class="cell-note">${e(r.tag)}</small>`,
            e(r.category),
            badge(r.status),
          ];
        if (name === "finances")
          cells = [
            `<strong>${e(r.ownerName)}</strong><small class="cell-note">${e(r.title)}</small>`,
            `<strong>${e(money(r.amount))}</strong>`,
            e(date(r.dueDate)),
            badge(r.status),
          ];
        if (name === "vacations")
          cells = [
            `<strong>${e(r.ownerName)}</strong>`,
            `${e(date(r.startDate))} – ${e(date(r.endDate))}`,
            e(r.days),
            badge(r.status),
          ];
        return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}<td>${open(i, name === "grades" ? "Ocjena i detalji" : name === "vacations" ? "Pregled zahtjeva" : "Otvori")}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }
  if (name === "courses")
    return cards(
      rows,
      (r, i) =>
        `<article class="record-card course-card"><div class="card-top">${badge(r.courseType || "Kolegij")}<strong class="ects">${r.ects == null ? "ECTS nije naveden" : e(r.ects) + " ECTS"}</strong></div><h2>${e(r.title)}</h2><p class="instructor">${icon("chalkboard-user")} ${e(r.instructorName || "Nastavnik nije naveden")}</p><div class="course-card-actions"><button class="button" data-row="${i}" title="Silabus i detalji">Silabus</button><button class="button" data-course-schedule="${i}">Raspored</button><button class="button" data-course-calendar="${i}">Integracija</button></div></article>`,
    );
  if (name === "projects")
    return cards(
      rows,
      (r, i) =>
        `<article class="record-card"><div class="card-top">${badge(r.fundingLine)}</div><h2>${e(r.title)}</h2><p class="card-description">${e(r.description)}</p><div class="card-metrics"><div><small>BUDŽET</small><strong>${e(money(r.budget))}</strong></div><div><small>TRAJANJE</small><strong>${e(r.duration || r.startDate + " – " + r.endDate)}</strong></div></div>${open(i, "Projekt i partneri")}</article>`,
    );
  if (name === "employees")
    return cards(
      rows,
      (r, i) =>
        `<article class="record-card employee-card"><span class="employee-avatar">${e(initials(r.name.replace(/(?:izv\.|prof\.|dr\.|sc\.|mr\.|doc\.)/g, "")))}</span><h2>${e(r.name)}</h2><strong class="employee-position">${e(r.position)}</strong><p>${e(r.departmentName || r.departmentId)}</p>${open(i, "Profil zaposlenika")}</article>`,
    );
  if (name === "exams")
    return cards(
      rows,
      (r, i) =>
        `<article class="record-card"><div class="card-top">${badge(date(r.date) + " @ " + r.time)}<small>${icon("door-open")} ${e(r.room)}</small></div><h2>${e(r.title)}</h2><p>${e(r.instructorName || "")}</p>${r.enrolledStudents ? `<div class="exam-students"><small>PRIJAVLJENI STUDENTI (${r.enrolledStudents.length} / ${e(r.capacity)})</small><div>${r.enrolledStudents.map((s) => `<span>${icon("user-graduate")} ${e(s.name)}</span>`).join("")}</div></div>` : `<p>Kapacitet: ${e(r.capacity)} mjesta</p>`}${open(i, "Detalji i prijava roka")}</article>`,
      "two-columns",
    );
  if (["requests", "research"].includes(name)) {
    const statuses =
      name === "requests"
        ? ["Na čekanju", "U obradi", "Riješeno", "Odbijeno"]
        : ["U pripremi", "Recenzija", "Objavljeno"];
    return `<div class="kanban">${statuses
      .filter((s) => s !== "Odbijeno" || rows.some((r) => r.status === s))
      .map(
        (s, k) =>
          `<section class="kanban-column"><header><h2>${e(s)}</h2><span>${rows.filter((r) => r.status === s).length}</span></header>${rows.map((r, i) => (r.status === s ? `<button class="kanban-card stage-${k}" data-row="${i}"><strong>${e(r.title || r.type)}</strong><p>${e(r.authors || r.ownerName)}</p><small>${e(r.link || r.projectId || "")}</small></button>` : "")).join("")}</section>`,
      )
      .join("")}</div>`;
  }
  if (name === "documents")
    return cards(
      rows,
      (r, i) =>
        `<button class="document-card" data-row="${i}"><span class="document-icon">${icon("file-pdf")}</span><div><strong>${e(r.title)}</strong><p>${e(r.category)} · ${e(date(r.date))}</p></div>${icon("arrow-right")}</button>`,
      "two-columns",
    );
  if (name === "alumniEvents")
    return `<div class="alumni-layout"><section class="alumni-intro"><h2>Alumni mreža PAR</h2><p>Povezivanje bivših studenata i poslovne zajednice.</p><p>Susreti, kontakti i prilike za razvoj karijere.</p>${icon("user-graduate")}</section><section class="record-card"><h2>Događaji i susreti</h2>${rows.map((r, i) => `<button class="alumni-event" data-row="${i}"><span class="event-day"><small>${e(r.date?.slice(5, 7))}</small><strong>${e(r.date?.slice(8, 10))}</strong></span><div><strong>${e(r.title)}</strong><p>${icon("location-dot")} ${e(r.location)}</p>${badge(r.description || "Alumni")}</div></button>`).join("")}</section></div>`;
  if (name === "calendarEvents") {
    const rooms = [...new Set(rows.map((r) => r.room || "Ostalo"))];
    return `<div class="timetable"><div class="time-labels">${[8, 10, 12, 14, 16].map((h) => `<span>${h}:00 – ${h + 2}:00</span>`).join("")}</div>${rooms.map((room) => `<section class="room-row"><h2>${icon("door-open")} ${e(room)}</h2><div class="room-slots">${[8, 10, 12, 14, 16].map((h) => `<div class="room-slot">${rows.map((r, i) => (r.room === room && parseInt(r.time) === h ? `<button class="lesson" data-row="${i}"><small>${icon("clock")} ${e(r.time)} · ${e(r.day || date(r.date))}</small><strong>${e(r.title)}</strong><small>${e(r.instructorName || "")}</small></button>` : "")).join("") || "<span>SLOBODNO</span>"}</div>`).join("")}</div></section>`).join("")}</div>`;
  }
  if (name === "employeeSchedules") {
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const names = [...new Set(rows.map((r) => r.ownerName))];
    return `<div class="table-scroll"><table class="schedule-table"><thead><tr><th>Djelatnik</th>${dates.map((d) => `<th>${e(date(d))}</th>`).join("")}</tr></thead><tbody>${names
      .map(
        (n) =>
          `<tr><th>${e(n)}</th>${dates
            .map((d) => {
              const i = rows.findIndex(
                (r) => r.ownerName === n && r.date === d,
              );
              return `<td>${i < 0 ? "—" : `<button class="schedule-activity" data-row="${i}">${badge(rows[i].activity)}</button>`}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("")}</tbody></table></div>`;
  }
  return null;
}
