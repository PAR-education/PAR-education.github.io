import { mountSchedule } from "./schedule.js";
import { zagrebDate, weekMonday } from "../utils/calendar.js";
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
    root.querySelector("#calendar-anchor")?.value || zagrebDate();
  const oldView = root.querySelector("#calendar-view")?.value || "week";
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
  root.innerHTML = `<div class="calendar-filters"><label>Pogled<select id="calendar-view"><option value="week">Tjedan</option><option value="day">Dan</option><option value="semester">Semestar / pregled datuma</option><option value="rooms">Dvorane i dostupnost</option></select></label><label>Datum<input id="calendar-anchor" type="date" value="${e(previous)}"></label><label>Raspored<select id="calendar-scope"><option value="all">Sva nastava</option>${["student", "profesor"].includes(role) ? '<option value="mine">Moj raspored</option>' : ""}</select></label><label>Studij<select id="calendar-study"><option value="">Svi studiji</option>${[
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
    )}</select></label></div><div class="calendar-paging"><button class="button" id="calendar-prev">← Prethodno</button><button class="button" id="calendar-today">Danas</button><button class="button" id="calendar-next">Sljedeće →</button></div><p id="calendar-note" class="panel-note" role="status"></p><div id="calendar-body"></div>`;
  const $ = (id) => root.querySelector("#" + id);
  $("calendar-view").value = oldView;
  $("calendar-scope").value = oldScope;
  for (const [id, value] of Object.entries(priorFilters))
    if (Array.from($(id).options).some((o) => o.value === value))
      $(id).value = value;
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
    if (mine)
      visible = visible.filter((r) =>
        role === "profesor"
          ? r.instructorUid === uid
          : enrolled?.has(r.courseId),
      );
    $("calendar-note").textContent =
      mine && role === "student" && enrolled === null
        ? "Učitavanje odobrenih upisa…"
        : mine
          ? "Osobni raspored prema dodijeljenoj nastavi ili odobrenim upisima. Odaberite svoju grupu ako kolegij ima više grupa. Termini bez ID-a kolegija/nastavnika nalaze se pod Sva nastava."
          : "Zajednički raspored. Filtrirajte studij, grupu, semestar i akademsku godinu. Termini bez dvorane ili nastavnika zahtijevaju dopunu; dostupnost tih resursa nije potvrđena.";
    if (view === "rooms") {
      roomDay =
        $("calendar-body").querySelector("#schedule-day")?.value ?? roomDay;
      mountSchedule($("calendar-body"), visible, {
        ...options,
        initialDay: roomDay ?? date,
      });
      return;
    }
    const start = view === "week" ? weekMonday(date) : date;
    const dates =
      view === "semester"
        ? [...new Set(visible.map((r) => r.date))].sort()
        : Array.from({ length: view === "week" ? 7 : 1 }, (_, i) =>
            add(start, i),
          );
    if (view !== "semester")
      visible = visible.filter((r) => dates.includes(r.date));
    const lo = Math.min(480, ...visible.map((r) => minutes(r.time))),
      hi = Math.max(
        1080,
        ...visible.map((r) => minutes(r.time) + durationOf(r)),
      );
    const card = (r) =>
      `<button class="calendar-lesson" data-calendar-id="${e(r.id)}" title="${e([r.title, r.time, r.endTime, r.room, r.instructorName, r.study, r.group, r.teachingType].filter(Boolean).join(" · "))}"><strong>${e(r.title)}</strong><span>${e(r.time)}–${e(r.endTime || timeAt(minutes(r.time) + durationOf(r)))}</span><span>${e(r.room || "Dvorana nije određena")} · ${e(r.instructorName || "Nastavnik nije naveden")}</span><small>${e([r.study, r.group, r.teachingType].filter(Boolean).join(" · "))}</small></button>`;
    $("calendar-body").innerHTML =
      `<div id="calendar-move-message" role="status" aria-live="polite"></div>${options.canEdit ? '<p class="panel-note">Povucite svoju nastavu na drugi dan ili vrijeme (korak 15 min). Trajanje i dvorana ostaju isti. Za promjenu dvorane otvorite Dvorane i dostupnost ili Uredi. Tipkovnica: Alt + strelice.</p>' : ""}${
        view !== "semester"
          ? `<h2 class="calendar-period">${e(label(dates[0]))}${dates.length > 1 ? " – " + e(label(dates.at(-1))) : ""}</h2><div class="calendar-week" style="--day-count:${dates.length}">${dates
              .map(
                (day) =>
                  `<section class="calendar-week-day"><h3>${e(label(day))}</h3><div class="calendar-time-track drop-slot" data-date="${e(day)}" style="height:${(hi - lo) * 1.2}px">${Array.from({ length: Math.ceil((hi - lo) / 60) }, (_, i) => `<div class="calendar-hour" style="top:${i * 72}px">${timeAt(lo + i * 60)}</div>`).join("")}${calendarLanes(
                    visible.filter((r) => r.date === day),
                  )
                    .map(
                      ({ event: r, lane, columns }) =>
                        `<div class="calendar-position" style="left:calc(22px + (100% - 24px) * ${lane / columns});width:calc((100% - 24px) / ${columns});top:${(minutes(r.time) - lo) * 1.2}px;height:${Math.max(60, durationOf(r) * 1.2 - 4)}px">${card(r)}</div>`,
                    )
                    .join("")}</div></section>`,
              )
              .join("")}</div>`
          : ""
      }<div class="calendar-agenda ${view === "semester" ? "semester-agenda" : ""}">${
        dates
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
  for (const [id, sign] of [
    ["calendar-prev", -1],
    ["calendar-next", 1],
  ])
    $(id).addEventListener("click", () => {
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
  if (role === "student")
    Promise.resolve(
      context.repository.listAll?.("enrollments") ||
        context.repository.list("enrollments"),
    )
      .then((rows) => {
        if (!root.isConnected) return;
        enrolled = new Set(
          rows.filter((r) => r.status === "Odobreno").map((r) => r.courseId),
        );
        render();
      })
      .catch(() => {
        if (root.isConnected)
          $("calendar-note").textContent =
            "Osobni upisi nisu dostupni. Odaberite Sva nastava ili osvježite prikaz.";
      });
}
