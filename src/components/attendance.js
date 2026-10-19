import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import {
  attendanceStatuses,
  attendanceValues,
  attendanceId,
  attendanceSummary,
  attendanceTotals,
  studentKey,
  enrollmentForEvent,
} from "../utils/attendance.js";
import { isInstructor } from "../utils/instructors.js";
import { exportCSV, printReport } from "./export.js";
import { actionMenu } from "./ui-controls.js";

export async function mountAttendance(
  root,
  context,
  isCurrent,
  initialEvent = "",
) {
  const { repository, profile, user } = context,
    staff = ["admin", "profesor"].includes(profile.role);
  const [allEvents, enrollments, initialRecords] = await Promise.all(
    ["calendarEvents", "enrollments", "attendance"].map((n) =>
      repository.listAll(n),
    ),
  );
  if (!isCurrent()) return;
  const events = allEvents.filter(
    (event) =>
      event.courseId &&
      (profile.role !== "profesor" || isInstructor(event, user.uid)),
  );
  let records = initialRecords,
    busy = false;
  const students = [
    ...new Map(
      enrollments
        .filter((r) => r.status === "Odobreno")
        .map((r) => [studentKey(r), r.ownerName || "Student"]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "hr"));
  const controlIds = [
    "attendance-course",
    "attendance-student",
    "attendance-grouping",
    "attendance-year",
    "attendance-from",
    "attendance-to",
  ];
  const previousState = Object.fromEntries(
    controlIds.map((id) => [id, root.querySelector("#" + id)?.value || ""]),
  );
  const courseControl = `<label>Kolegij<select id="attendance-course"><option value="">${staff ? "Odaberite kolegij" : "Svi kolegiji"}</option>${[
    ...new Map(events.map((r) => [r.courseId, r.title])).entries(),
  ]
    .sort((a, b) => a[1].localeCompare(b[1], "hr"))
    .map(([id, title]) => `<option value="${e(id)}">${e(title)}</option>`)
    .join("")}</select></label>`;
  root.innerHTML = `<div class="page-heading"><h1>${staff ? "Prisutnost na nastavi" : "Moja prisutnost"}</h1><div class="page-actions">${actionMenu("Izvoz", '<button id="attendance-csv">CSV statistika</button><button id="attendance-print">Ispis / PDF statistike</button><button id="attendance-detail-csv">CSV evidencija</button>')}<button class="button" id="attendance-refresh">Osvježi</button></div></div>
    <section class="panel backup-section attendance-panel"><div class="attendance-tools"><details class="calendar-filter-panel" id="attendance-filters"><summary class="button"><i class="fa-solid fa-filter" aria-hidden="true"></i> <span id="attendance-filter-label">Filtri</span></summary><div class="filter-fields">
    ${staff ? `<label>Student<select id="attendance-student"><option value="">Svi studenti</option>${students.map(([key, name]) => `<option value="${e(key)}">${e(name)}</option>`).join("")}</select></label>` : courseControl}
    <label>Statistika<select id="attendance-grouping"><option value="student">Po studentu</option><option value="course">Po studentu i kolegiju</option></select></label>
    <label>Akademska godina<select id="attendance-year"><option value="">Sve godine</option>${[
      ...new Set(events.map((r) => r.academicYear).filter(Boolean)),
    ]
      .sort()
      .map((year) => `<option>${e(year)}</option>`)
      .join("")}</select></label>
    <label>Od<input id="attendance-from" type="date"></label><label>Do<input id="attendance-to" type="date"></label><button type="button" class="button" id="attendance-clear-filters">Očisti filtre</button></div></details></div>
    ${staff ? `<div class="backup-fields attendance-selection">${courseControl}<label>Termin nastave<select id="attendance-event" disabled></select></label></div>` : ""}
    <div id="attendance-message" role="status" aria-live="polite"></div>
    ${staff ? '<div id="attendance-roster"></div>' : ""}
    <h2>Statistika</h2><details class="context-help"><summary>Kako se računa prisutnost?</summary><p>Postotak = dolasci / evidentirani termini. Neevidentirani termini nisu izostanci. Opravdani izostanci prikazuju se zasebno.</p></details><div id="attendance-stats"></div><details class="context-help"><summary>Evidencija po terminima</summary><div id="attendance-detail"></div></details></section>`;
  const $ = (id) => root.querySelector("#" + id);
  for (const [id, value] of Object.entries(previousState)) {
    if (!$(id)) continue;
    if (
      $(id).tagName !== "SELECT" ||
      [...$(id).options].some((o) => o.value === value)
    )
      $(id).value = value;
  }
  const initial = events.find((r) => r.id === initialEvent);
  if (staff && initial) $("attendance-course").value = initial.courseId;
  let summary = [],
    detail = [];
  function message(text, error = false) {
    if (!isCurrent()) return;
    $("attendance-message").className = "notice" + (error ? " error" : "");
    $("attendance-message").textContent = text;
  }
  function filtered() {
    const from = $("attendance-from").value,
      to = $("attendance-to").value;
    if (from && to && from > to) {
      message("Početni datum mora biti prije završnog.", true);
      return { selectedEvents: [], selectedEnrollments: [] };
    }
    return {
      selectedEvents: events.filter(
        (r) =>
          (!$("attendance-course").value ||
            r.courseId === $("attendance-course").value) &&
          (!$("attendance-year").value ||
            r.academicYear === $("attendance-year").value) &&
          (!from || r.date >= from) &&
          (!to || r.date <= to),
      ),
      selectedEnrollments: enrollments.filter(
        (r) =>
          !$("attendance-student")?.value ||
          studentKey(r) === $("attendance-student").value,
      ),
    };
  }
  function render() {
    const filterCount =
      [
        "attendance-student",
        "attendance-year",
        "attendance-from",
        "attendance-to",
        ...(!staff ? ["attendance-course"] : []),
      ].filter((id) => $(id)?.value).length +
      ($("attendance-grouping").value === "course" ? 1 : 0);
    $("attendance-filter-label").textContent =
      "Filtri" + (filterCount ? " (" + filterCount + ")" : "");
    const { selectedEvents, selectedEnrollments } = filtered();
    const eligible =
      profile.role === "student"
        ? selectedEvents.filter((ev) =>
            selectedEnrollments.some((en) => enrollmentForEvent(en, ev)),
          )
        : selectedEvents;
    summary = attendanceSummary(eligible, selectedEnrollments, records);
    if ($("attendance-grouping").value === "student")
      summary = attendanceTotals(summary);
    detail = eligible.flatMap((ev) =>
      selectedEnrollments
        .filter((en) => enrollmentForEvent(en, ev))
        .map((en) => ({
          student: en.ownerName,
          course: ev.title,
          date: ev.date,
          time: ev.time,
          year: ev.academicYear || en.academicYear || "",
          status:
            records.find((r) => r.eventId === ev.id && r.enrollmentId === en.id)
              ?.status || "Nije evidentirano",
        })),
    );
    const screenColumns = summaryColumns.filter(
      (c) => !["year", "total"].includes(c.key),
    );
    $("attendance-stats").innerHTML = table(
      screenColumns,
      summary.map((row) => ({
        ...row,
        course:
          row.course +
          "\n" +
          [row.year, row.total + " termina"].filter(Boolean).join(" · "),
      })),
    );
    $("attendance-detail").innerHTML = table(detailColumns, detail);
    if (!staff) return;
    const previous = $("attendance-event").value;
    const sorted = ($("attendance-course").value ? eligible : [])
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    $("attendance-event").innerHTML =
      '<option value="">' +
      (!$("attendance-course").value
        ? "Prvo odaberite kolegij"
        : sorted.length
          ? "Odaberite termin"
          : "Nema termina za odabrane filtre") +
      "</option>" +
      sorted
        .map(
          (ev) =>
            `<option value="${e(ev.id)}">${e(new Date(ev.date + "T12:00:00Z").toLocaleDateString("hr-HR", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Zagreb" }))} · ${e(ev.time)}${ev.endTime ? "–" + e(ev.endTime) : ""}h · ${e(ev.online ? "Online" : ev.room || "Bez dvorane")}</option>`,
        )
        .join("");
    $("attendance-event").disabled = !sorted.length;
    const next = initialEvent || previous;
    if (sorted.some((ev) => ev.id === next)) $("attendance-event").value = next;
    initialEvent = "";
    renderRoster();
  }
  function renderRoster() {
    const event = events.find((ev) => ev.id === $("attendance-event").value);
    if (!event) {
      $("attendance-roster").innerHTML = "";
      return;
    }
    const roster = filtered().selectedEnrollments.filter((en) =>
      enrollmentForEvent(en, event),
    );
    $("attendance-roster").innerHTML = roster.length
      ? `<div class="table-scroll"><table><thead><tr><th>Student</th><th>Prisutnost</th><th></th></tr></thead><tbody>${roster
          .map((en, i) => {
            const saved = records.find(
              (r) => r.eventId === event.id && r.enrollmentId === en.id,
            );
            return `<tr><td>${e(en.ownerName || "Student")}</td><td><select data-attendance-status="${i}" aria-label="Prisutnost: ${e(en.ownerName)}"><option value="Nije evidentirano">Nije evidentirano</option>${attendanceStatuses.map((status) => `<option value="${e(status)}" ${saved?.status === status ? "selected" : ""}>${e(status)}</option>`).join("")}</select></td><td><button class="button" data-attendance-save="${i}">Spremi</button></td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : '<p class="panel-note">Nema odobrenih upisa za ovaj termin i odabrane filtre.</p>';
    root.querySelectorAll("[data-attendance-save]").forEach((button) =>
      button.addEventListener("click", async () => {
        if (busy || !isCurrent()) return;
        const index = Number(button.dataset.attendanceSave),
          enrollment = roster[index],
          status = root.querySelector(
            `[data-attendance-status="${index}"]`,
          ).value;
        busy = true;
        button.disabled = true;
        try {
          const values = attendanceValues(
              event,
              enrollment,
              status,
              profile,
              user.uid,
            ),
            id = attendanceId(event.id, enrollment.id);
          await repository.save("attendance", values, id);
          if (!isCurrent()) return;
          records = await repository.listAll("attendance");
          if (!isCurrent()) return;
          render();
          message("Prisutnost je spremljena.");
        } catch (error) {
          message(errorMessage(error), true);
        } finally {
          busy = false;
          if (button.isConnected) button.disabled = false;
        }
      }),
    );
  }
  for (const id of [
    "attendance-grouping",
    "attendance-student",
    "attendance-course",
    "attendance-year",
    "attendance-from",
    "attendance-to",
  ])
    $(id)?.addEventListener("change", render);
  $("attendance-clear-filters").addEventListener("click", () => {
    for (const id of [
      "attendance-student",
      "attendance-year",
      "attendance-from",
      "attendance-to",
      ...(!staff ? ["attendance-course"] : []),
    ])
      if ($(id)) $(id).value = "";
    $("attendance-grouping").value = "student";
    render();
  });
  $("attendance-event")?.addEventListener("change", renderRoster);
  $("attendance-refresh").addEventListener("click", async () => {
    try {
      await mountAttendance(
        root,
        context,
        isCurrent,
        $("attendance-event")?.value,
      );
    } catch (error) {
      message(errorMessage(error), true);
    }
  });
  $("attendance-csv").addEventListener("click", () =>
    exportCSV("prisutnost-statistika", summaryColumns, summary),
  );
  $("attendance-print").addEventListener("click", () => {
    try {
      printReport(
        "Statistika prisutnosti",
        summaryColumns,
        summary,
        "Postotak dolazaka među evidentiranim terminima; neevidentirani termini nisu izostanci.",
      );
    } catch (error) {
      message(errorMessage(error), true);
    }
  });
  $("attendance-detail-csv").addEventListener("click", () =>
    exportCSV("prisutnost-evidencija", detailColumns, detail),
  );
  render();
}
const summaryColumns = Object.entries({
  student: "Student",
  course: "Kolegij",
  year: "Akademska godina",
  total: "Termini",
  present: "Dolasci",
  absent: "Izostanci",
  justified: "Opravdani",
  unmarked: "Neevidentirano",
  percentage: "Prisutnost",
}).map(([key, label]) => ({ key, label }));
const detailColumns = Object.entries({
  student: "Student",
  course: "Kolegij",
  year: "Akademska godina",
  date: "Datum",
  time: "Početak",
  status: "Prisutnost",
}).map(([key, label]) => ({ key, label }));
function table(columns, rows) {
  return rows.length
    ? `<div class="table-scroll"><table><thead><tr>${columns.map((c) => `<th>${e(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${e(row[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : '<p class="panel-note">Nema termina za odabrane filtre.</p>';
}
