import { studentKey } from "../utils/attendance.js";
import { courseYearKey, enrolledForEvent } from "../utils/academic-year.js";
import { isInstructor } from "../utils/instructors.js";
import { mountSchedule } from "./schedule.js";
import {
  zagrebDate,
  weekMonday,
  isoWeek,
  firstTeachingDate,
  adjacentTeaching,
} from "../utils/calendar.js";
import {
  minutes,
  durationOf,
  timeAt,
  calendarLanes,
  calendarDropTime,
} from "../utils/schedule.js";
import { escapeHTML as e } from "../utils/helpers.js";
import { errorMessage } from "../utils/helpers.js";
import { bindScheduleDrag } from "./schedule-drag.js";

export function mountCalendarView(root, events, options) {
  root.classList.add("calendar-layout");
  const { context } = options,
    role = context.profile.role,
    uid = context.user.uid;
  const previous =
    root.querySelector("#calendar-anchor")?.value ||
    (role === "profesor"
      ? firstTeachingDate(
          events,
          uid,
          zagrebDate(),
          matchMedia("(max-width: 760px)").matches ? "day" : "week",
        )
      : zagrebDate());
  const oldView =
    root.querySelector("#calendar-view")?.value ||
    (matchMedia("(max-width: 760px)").matches ? "day" : "week");
  const priorFilters = Object.fromEntries(
    [
      "calendar-study",
      "calendar-group",
      "calendar-semester",
      "calendar-year",
    ].map((id) => [id, root.querySelector("#" + id)?.value || ""]),
  );
  let roomDay = root.querySelector("#schedule-day")?.value;
  const oldScope =
    root.querySelector("#calendar-scope")?.value ||
    (["student", "profesor"].includes(role) ? "mine" : "all");
  const priorStudent = root.querySelector("#calendar-student")?.value || "";
  const filtersOpen = root.querySelector("#calendar-filters-panel")?.open;
  root.innerHTML = `<div class="calendar-filters calendar-controls"><div class="calendar-primary"><label>Pogled<select id="calendar-view"><option value="week">Tjedan</option><option value="day">Dan</option><option value="month">Mjesec</option><option value="semester">Semestar / pregled datuma</option><option value="rooms">Dvorane i dostupnost</option></select></label><label>Datum<input id="calendar-anchor" type="date" value="${e(previous)}"></label><label>Raspored<select id="calendar-scope"><option value="all">Sva nastava</option>${["student", "profesor"].includes(role) ? '<option value="mine">Moj raspored</option>' : ""}</select></label></div><details class="calendar-filter-panel" id="calendar-filters-panel" ${filtersOpen ? "open" : ""}><summary class="button"><i class="fa-solid fa-filter" aria-hidden="true"></i> <span id="calendar-filter-label">Filtri</span></summary><div class="filter-fields"><label>Studij<select id="calendar-study"><option value="">Svi studiji</option>${[
    ...new Set(events.map((r) => r.study).filter(Boolean)),
  ]
    .sort()
    .map((v) => `<option>${e(v)}</option>`)
    .join(
      "",
    )}</select></label><label>Grupa<select id="calendar-group"><option value="">Sve grupe</option>${[
    ...new Set(events.map((r) => r.group).filter(Boolean)),
  ]
    .sort()
    .map((v) => `<option>${e(v)}</option>`)
    .join(
      "",
    )}</select></label><label>Semestar<select id="calendar-semester"><option value="">Svi semestri</option><option>Zimski</option><option>Ljetni</option></select></label><label>Akademska godina<select id="calendar-year"><option value="">Sve godine</option>${[
    ...new Set(events.map((r) => r.academicYear).filter(Boolean)),
  ]
    .sort()
    .map((v) => `<option>${e(v)}</option>`)
    .join(
      "",
    )}</select></label><button class="button" id="calendar-clear-filters">Očisti filtre</button></div></details></div><div class="calendar-paging"><button class="button" id="calendar-prev">← Prethodno</button><button class="button" id="calendar-today">Danas</button><button class="button" id="calendar-next">Sljedeće →</button></div><p id="calendar-note" class="panel-note" role="status"></p><div id="calendar-body"></div>`;
  const $ = (id) => root.querySelector("#" + id);
  $("calendar-view").value = oldView;
  $("calendar-scope").value = oldScope;
  if (["student", "profesor"].includes(role)) {
    $("calendar-scope").closest("label").hidden = true;
    const toggle = document.createElement("button");
    toggle.id = "calendar-scope-toggle";
    toggle.className = "button";
    toggle.addEventListener("click", () => {
      $("calendar-scope").value =
        $("calendar-scope").value === "mine" ? "all" : "mine";
      render();
    });
    root.querySelector(".calendar-primary").append(toggle);
  }
  for (const [id, value] of Object.entries(priorFilters))
    if (Array.from($(id).options).some((o) => o.value === value))
      $(id).value = value;
  let studentEnrollments = [];
  let enrolled = null,
    busy = false,
    suppressClick = false;
  const label = (date) =>
    new Date(date + "T12:00:00Z").toLocaleDateString("hr-HR", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "Europe/Zagreb",
    });
  function add(date, n) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function render() {
    const mine = $("calendar-scope").value === "mine",
      date = $("calendar-anchor").value || zagrebDate(),
      view = $("calendar-view").value;
    let visible = events.filter(
      (r) =>
        (!$("calendar-study").value || r.study === $("calendar-study").value) &&
        (!$("calendar-group").value || r.group === $("calendar-group").value) &&
        (!$("calendar-semester").value ||
          r.semester === $("calendar-semester").value) &&
        (!$("calendar-year").value ||
          r.academicYear === $("calendar-year").value),
    );
    const selectedStudent = $("calendar-student")?.value;
    if (selectedStudent) {
      const selectedKeys = new Set(
        studentEnrollments
          .filter(
            (r) => studentKey(r) === selectedStudent && r.status === "Odobreno",
          )
          .map(courseYearKey),
      );
      visible = visible.filter((r) => enrolledForEvent(selectedKeys, r));
    }
    if (mine)
      visible = visible.filter((r) =>
        role === "profesor"
          ? isInstructor(r, uid)
          : enrolledForEvent(enrolled, r),
      );
    if ($("calendar-scope-toggle"))
      $("calendar-scope-toggle").textContent = mine
        ? "Prikaži svu nastavu"
        : "Prikaži samo moju nastavu";
    const count = [
      "calendar-study",
      "calendar-group",
      "calendar-semester",
      "calendar-year",
      "calendar-student",
    ].filter((id) => $(id)?.value).length;
    $("calendar-filter-label").textContent =
      `Filtri${count ? ` (${count})` : ""}`;
    $("calendar-note").textContent =
      mine && role === "student" && enrolled === null
        ? "Učitavanje upisa…"
        : selectedStudent
          ? "Raspored studenta: " +
            $("calendar-student").selectedOptions[0].textContent +
            (role === "profesor" ? " · Vaši kolegiji" : "")
          : "";
    $("calendar-note").hidden = !$("calendar-note").textContent;
    $("calendar-anchor").closest("label").hidden = [
      "rooms",
      "semester",
    ].includes(view);
    root.querySelector(".calendar-paging").hidden = view === "semester";
    if (view === "rooms") {
      roomDay =
        $("calendar-body").querySelector("#schedule-day")?.value ?? roomDay;
      mountSchedule($("calendar-body"), visible, {
        ...options,
        initialDay: roomDay ?? date,
        onVisible: options.onVisible,
      });
      return;
    }
    const start =
      view === "week"
        ? weekMonday(date)
        : view === "month"
          ? date.slice(0, 7) + "-01"
          : date;
    const dates =
      view === "semester"
        ? [...new Set(visible.map((r) => r.date))].sort()
        : Array.from(
            {
              length:
                view === "week"
                  ? 7
                  : view === "month"
                    ? new Date(
                        Number(date.slice(0, 4)),
                        Number(date.slice(5, 7)),
                        0,
                      ).getDate()
                    : 1,
            },
            (_, i) => add(start, i),
          );
    const matching = visible.slice();
    if (view !== "semester")
      visible = visible.filter((r) => dates.includes(r.date));
    options.onVisible?.(visible);
    const lo = Math.min(480, ...visible.map((r) => minutes(r.time))),
      hi = Math.max(
        1080,
        ...visible.map((r) => minutes(r.time) + durationOf(r)),
      );
    const card = (r) =>
      `<button class="calendar-lesson" data-calendar-id="${e(r.id)}" title="${e([r.title, r.time, r.endTime, r.room, r.instructorName, r.study, r.group, r.teachingType].filter(Boolean).join(" · "))}"><strong>${e(r.title)}</strong><span>${e(r.time)}–${e(r.endTime || timeAt(minutes(r.time) + durationOf(r)))}</span><span>${e(r.room || "Dvorana nije određena")} · ${e(r.instructorName || "Nastavnik nije naveden")}</span><small>${e([r.study, r.group, r.teachingType].filter(Boolean).join(" · "))}</small></button>`;
    $("calendar-body").innerHTML =
      `<div id="calendar-move-message" role="status" aria-live="polite"></div>${
        !["semester", "month"].includes(view)
          ? `<h2 class="calendar-period">${e(label(dates[0]))}${dates.length > 1 ? " – " + e(label(dates.at(-1))) : ""} <span class="pill">W${isoWeek(date).week} · ${isoWeek(date).week}. tjedan</span></h2><div class="calendar-week" style="--day-count:${dates.length}">${dates
              .map(
                (day) =>
                  `<section class="calendar-week-day ${day === zagrebDate() ? "is-today" : ""}"><h3 title="${e(label(day))}">${e(new Date(day + "T12:00:00Z").toLocaleDateString("hr-HR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Zagreb" }))}</h3><div class="calendar-time-track drop-slot" data-date="${e(day)}" style="height:${(hi - lo) * 1.2}px">${Array.from({ length: Math.ceil((hi - lo) / 60) }, (_, i) => `<div class="calendar-hour" style="top:${i * 72}px">${timeAt(lo + i * 60)}</div>`).join("")}${calendarLanes(
                    visible.filter((r) => r.date === day),
                  )
                    .map(
                      ({ event: r, lane, columns }) =>
                        `<div class="calendar-position" style="left:calc(22px + (100% - 24px) * ${lane / columns});width:calc((100% - 24px) / ${columns});top:${(minutes(r.time) - lo) * 1.2}px;height:${Math.max(60, durationOf(r) * 1.2 - 4)}px">${card(r)}</div>`,
                    )
                    .join("")}</div></section>`,
              )
              .join("")}</div>`
          : view === "month"
            ? `<h2 class="calendar-period">${e(new Date(date + "T12:00:00Z").toLocaleDateString("hr-HR", { month: "long", year: "numeric", timeZone: "Europe/Zagreb" }))}</h2>`
            : ""
      }<div class="calendar-agenda ${["semester", "month"].includes(view) ? "semester-agenda" : ""}">${
        dates
          .filter(
            (day) => view !== "month" || visible.some((r) => r.date === day),
          )
          .map(
            (day) =>
              `<section class="drop-slot" data-date="${e(day)}"><h3>${e(label(day))}</h3>${
                visible
                  .filter((r) => r.date === day)
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map(card)
                  .join("") || '<p class="panel-note">Nema nastave.</p>'
              }</section>`,
          )
          .join("") ||
        '<p class="panel-note">Nema termina za odabrane filtre.</p>'
      }</div>`;
    if (!visible.length) {
      const { event: next, past } = adjacentTeaching(matching, date);
      const note = document.createElement("div");
      note.className = "calendar-empty-state";
      note.innerHTML = `<p>${mine && role === "student" && enrolled?.size === 0 ? "Još nemate odobrenih upisa." : matching.length ? "Nema nastave u ovom razdoblju." : "Nema termina za odabrani raspored."}</p><div>${count ? '<button class="button" id="calendar-reset-filters">Očisti filtre</button>' : ""}${next ? '<button class="button" id="calendar-jump">' + (past ? "Posljednji termin" : "Sljedeći termin") + "</button>" : ""}</div>`;
      $("calendar-body").prepend(note);
      note
        .querySelector("#calendar-reset-filters")
        ?.addEventListener("click", () => {
          for (const id of [
            "calendar-study",
            "calendar-group",
            "calendar-semester",
            "calendar-year",
          ])
            $(id).value = "";
          if ($("calendar-student")) $("calendar-student").value = "";
          render();
        });
      note.querySelector("#calendar-jump")?.addEventListener("click", () => {
        $("calendar-anchor").value = next.date;
        render();
      });
    }
    root.querySelectorAll("[data-calendar-id]").forEach((button) => {
      const record = events.find((r) => r.id === button.dataset.calendarId);
      button.addEventListener("click", () => {
        if (!busy && !suppressClick) options.onDetails(record);
      });
      if (!options.canEditRecord?.(record)) return;
      bindScheduleDrag(button, root, record, {
        isBusy: () => busy,
        onStart: () => {
          suppressClick = true;
        },
        onEnd: () =>
          setTimeout(() => {
            suppressClick = false;
          }, 150),
        resolveDrop: (slot, point, row) => {
          const time = slot.classList.contains("calendar-time-track")
            ? calendarDropTime(
                lo,
                point.y - slot.getBoundingClientRect().top,
                point.offsetY,
                durationOf(row),
              )
            : row.time;
          return time
            ? { date: slot.dataset.date, time, room: row.room }
            : null;
        },
        onDrop: move,
      });
      button.addEventListener("keydown", (event) => {
        if (
          !event.altKey ||
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          ) ||
          busy
        )
          return;
        event.preventDefault();
        const delta =
          event.key === "ArrowDown" ? 15 : event.key === "ArrowUp" ? -15 : 0;
        const start = minutes(record.time) + delta;
        if (start < 0 || start + durationOf(record) >= 1440) return;
        move(record, {
          date: add(
            record.date,
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0,
          ),
          time: timeAt(start),
          room: record.room,
        });
      });
    });
  }
  async function move(record, target) {
    if (busy || !options.canEditRecord?.(record)) return;
    busy = true;
    const show = (text, error = false) => {
      const el = $("calendar-move-message");
      if (root.isConnected && el) {
        el.className = "notice" + (error ? " error" : "");
        el.textContent = text;
      }
    };
    show("Spremanje nove satnice…");
    root
      .querySelectorAll("button,input,select")
      .forEach((el) => (el.disabled = true));
    try {
      await options.onMove(record, target);
      show(
        `Satnica je spremljena: ${target.date} · ${target.time} · ${target.room}.`,
      );
      Array.from(root.querySelectorAll("[data-calendar-id]"))
        .find(
          (el) =>
            el.dataset.calendarId === record.id && el.getClientRects().length,
        )
        ?.focus({ preventScroll: true });
    } catch (error) {
      show(errorMessage(error), true);
    } finally {
      busy = false;
      suppressClick = false;
      if (root.isConnected)
        root
          .querySelectorAll("button,input,select")
          .forEach((el) => (el.disabled = false));
    }
  }
  root
    .querySelectorAll(".calendar-filters input,.calendar-filters select")
    .forEach((el) => el.addEventListener("change", render));
  $("calendar-clear-filters").addEventListener("click", () => {
    for (const id of [
      "calendar-study",
      "calendar-group",
      "calendar-semester",
      "calendar-year",
    ])
      $(id).value = "";
    if ($("calendar-student")) $("calendar-student").value = "";
    render();
  });
  for (const [id, sign] of [
    ["calendar-prev", -1],
    ["calendar-next", 1],
  ])
    $(id).addEventListener("click", () => {
      if ($("calendar-view").value === "month") {
        const current = new Date(
          ($("calendar-anchor").value || zagrebDate()).slice(0, 7) +
            "-01T12:00:00Z",
        );
        current.setUTCMonth(current.getUTCMonth() + sign);
        $("calendar-anchor").value = current.toISOString().slice(0, 10);
        render();
        return;
      }
      $("calendar-anchor").value = add(
        $("calendar-anchor").value || zagrebDate(),
        sign * ($("calendar-view").value === "day" ? 1 : 7),
      );
      render();
    });
  $("calendar-today").addEventListener("click", () => {
    $("calendar-anchor").value = zagrebDate();
    render();
  });
  render();
  if (["student", "profesor", "admin"].includes(role))
    Promise.resolve(
      context.repository.listAll?.("enrollments") ||
        context.repository.list("enrollments"),
    )
      .then((rows) => {
        if (!root.isConnected) return;
        studentEnrollments = rows;
        if (role !== "student") {
          let select = $("calendar-student");
          if (!select) {
            const label = document.createElement("label");
            label.textContent = "Student";
            select = document.createElement("select");
            select.id = "calendar-student";
            label.append(select);
            root.querySelector(".filter-fields").prepend(label);
            select.addEventListener("change", render);
          }
          const people = [
            ...new Map(
              rows
                .filter((r) => r.status === "Odobreno")
                .map((r) => [studentKey(r), r.ownerName || "Student"]),
            ).entries(),
          ].sort((a, b) => a[1].localeCompare(b[1], "hr"));
          select.innerHTML =
            '<option value="">Svi studenti</option>' +
            people
              .map(
                ([id, name]) => `<option value="${e(id)}">${e(name)}</option>`,
              )
              .join("");
          select.value = people.some(([id]) => id === priorStudent)
            ? priorStudent
            : "";
        }
        enrolled = new Set(
          rows.filter((r) => r.status === "Odobreno").map(courseYearKey),
        );
        render();
      })
      .catch(() => {
        if (root.isConnected) {
          $("calendar-note").hidden = false;
          $("calendar-note").textContent =
            "Upisi nisu dostupni. Odaberite Sva nastava ili osvježite prikaz.";
        }
      });
}
