import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { icon } from "../modules/visuals.js";
import {
  minutes,
  timeAt,
  durationOf,
  defaultRooms,
  scheduleConflicts,
  teachingConflicts,
} from "../utils/schedule.js";
import { openDialog, closeDialog } from "./dialog.js";
import { bindScheduleDrag } from "./schedule-drag.js";
export function mountSchedule(
  root,
  events,
  {
    canEdit,
    onMove,
    onDetails,
    allEvents = events,
    canEditRecord = () => canEdit,
    initialDay = "",
  },
) {
  const rooms = [
    ...new Set([...allEvents.map((r) => r.room || ""), ...defaultRooms]),
  ];
  const hours = [
    ...new Set([
      8,
      10,
      12,
      14,
      16,
      ...events.map((r) => Math.floor(minutes(r.time) / 120) * 2),
    ]),
  ].sort((a, b) => a - b);
  let day = root.querySelector("#schedule-day")?.value ?? initialDay,
    busy = false,
    suppressClick = false;
  root.innerHTML = `<div class="schedule-tools"><label>Prikaži datum<input id="schedule-day" type="date"></label><button id="schedule-all-days" class="button">Svi dani</button><p>${canEdit ? "Povucite događaj u drugi termin ili dvoranu. Trajanje se zadržava. Tipkovnica: Alt + strelice; gumb „Satnica” omogućuje točan datum, početak i završetak." : "Raspored je dostupan za pregled. Izmjene radi administrator."}</p></div><div id="schedule-message" role="status" aria-live="polite"></div><section class="panel availability-panel"><h2>Provjeri slobodan termin</h2><p>Odaberite datum, dvoranu i točan vremenski raspon. Provjera uključuje i događaje skrivene pretraživanjem. Termini bez određene dvorane ne potvrđuju slobodnu dvoranu; treba ih dopuniti.</p><div class="availability-fields"><label>Datum<input id="available-date" type="date"></label><label>Dvorana<select id="available-room">${rooms.map((r) => `<option value="${e(r)}">${e(r || "Dvorana nije određena")}</option>`).join("")}</select></label><label>Početak<input id="available-start" type="time" value="08:00"></label><label>Završetak<input id="available-end" type="time" value="10:00"></label></div><div id="available-result" role="status" aria-live="polite"></div></section><div id="schedule-grid"></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const find = (id) => events.find((r) => r.id === id);
  const dateLabel = (date) =>
    new Date(date + "T12:00:00Z").toLocaleDateString("hr-HR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Zagreb",
    });
  function availability(target, excludeId) {
    try {
      const conflicts = excludeId
        ? teachingConflicts(
            allEvents,
            { ...find(excludeId), ...target },
            excludeId,
          )
        : scheduleConflicts(allEvents, target);
      return {
        blocked: conflicts.length > 0,
        html: conflicts.length
          ? `<div class="notice error"><strong>Zauzeto</strong><p>${e(dateLabel(target.date))} · ${e(target.room)}</p>${conflicts.map((r) => `<p><strong>${e(r.title)}</strong><br>${e(r.time)}–${e(timeAt(minutes(r.time) + durationOf(r)))} · ${e(r.instructorName || "Nastavnik nije naveden")}</p>`).join("")}<p>Za dogovor o zamjeni javite se navedenom nastavniku.</p></div>`
          : `<div class="notice availability-free"><strong>Nema evidentirane rezervacije</strong><p>${e(dateLabel(target.date))} · ${e(target.room)} · ${e(target.time)}–${e(target.endTime)}</p></div>`,
      };
    } catch (error) {
      return {
        blocked: true,
        html: `<p class="panel-note">${e(error.message)}</p>`,
      };
    }
  }
  function checkAvailability() {
    $("available-result").innerHTML = availability({
      date: $("available-date").value,
      room: $("available-room").value,
      time: $("available-start").value,
      endTime: $("available-end").value,
    }).html;
  }
  [
    "available-date",
    "available-room",
    "available-start",
    "available-end",
  ].forEach((id) => $(id).addEventListener("input", checkAvailability));
  checkAvailability();
  function render() {
    const dates = day ? [day] : [...new Set(events.map((r) => r.date))].sort();
    $("schedule-grid").innerHTML =
      dates
        .map(
          (date) =>
            `<section class="schedule-date-section"><h2 class="schedule-date-heading">${e(dateLabel(date))}</h2><div class="timetable"><div class="time-labels" style="grid-template-columns:repeat(${hours.length},minmax(160px,1fr))">${hours.map((h) => `<span>${timeAt(h * 60)} – ${h === 22 ? "24:00" : timeAt((h + 2) * 60)}</span>`).join("")}</div>${rooms
              .map(
                (room) =>
                  `<section class="room-row"><h3>${icon("door-open")} ${e(room || "Dvorana nije određena")}</h3><div class="room-slots" style="grid-template-columns:repeat(${hours.length},minmax(160px,1fr))">${hours
                    .map((h) => {
                      const occupied = allEvents.filter(
                        (r) =>
                          r.date === date &&
                          (r.room || "") === room &&
                          minutes(r.time) < (h + 2) * 60 &&
                          minutes(r.time) + durationOf(r) > h * 60,
                      );
                      const cards = events.filter(
                        (r) =>
                          r.date === date &&
                          (r.room || "") === room &&
                          Math.floor(minutes(r.time) / 120) * 2 === h,
                      );
                      return `<div class="room-slot drop-slot ${occupied.length ? "slot-occupied" : "slot-free"}" data-date="${e(date)}" data-room="${e(room)}" data-time="${timeAt(h * 60)}" aria-label="${e(dateLabel(date))} ${e(room || "Dvorana nije određena")} ${timeAt(h * 60)}"><span class="slot-status">${!room ? "DVORANA NIJE ODREĐENA" : occupied.length ? "ZAUZETO · provjerite točne minute" : "SLOBODNO"}</span>${cards.map((r) => `<div class="schedule-event"><button class="lesson" data-event="${e(r.id)}" title="${canEdit ? "Povuci za premještanje · Alt + strelice" : "Detalji događaja"}"><small>${icon("clock")} ${e(r.time)} – ${e(timeAt(minutes(r.time) + durationOf(r)))}</small><strong>${e(r.title)}</strong><small>${e(r.instructorName || "Nastavnik nije naveden")}</small><small>${e(dateLabel(r.date))}</small></button>${canEditRecord(r) ? `<button class="schedule-edit" data-move="${e(r.id)}" aria-label="Promijeni satnicu: ${e(r.title)}">${icon("arrows-up-down-left-right")} Satnica</button>` : ""}</div>`).join("")}${occupied
                        .filter((r) => !cards.some((c) => c.id === r.id))
                        .map(
                          (r) =>
                            `<div class="schedule-continuation">${e(r.time)}–${e(timeAt(minutes(r.time) + durationOf(r)))} · ${e(r.title)}<br>${e(r.instructorName || "Nastavnik nije naveden")}</div>`,
                        )
                        .join("")}</div>`;
                    })
                    .join("")}</div></section>`,
              )
              .join("")}</div></section>`,
        )
        .join("") ||
      '<p class="panel-note">Nema događaja za prikaz. Dostupnost provjerite odabirom datuma iznad.</p>';
    root.querySelectorAll("[data-event]").forEach((button) => {
      const record = find(button.dataset.event);
      button.addEventListener("click", () => {
        if (!suppressClick && !busy) onDetails(record);
      });
      if (!canEditRecord(record)) return;
      bindScheduleDrag(button, root, record, {
        isBusy: () => busy,
        onStart: () => {
          suppressClick = true;
        },
        onEnd: () =>
          setTimeout(() => {
            suppressClick = false;
          }, 150),
        onDrop: (record, target) =>
          move(record, { ...target, date: target.date || day || record.date }),
      });
      button.addEventListener("keydown", (event) => {
        if (!event.altKey || !event.key.startsWith("Arrow") || busy) return;
        event.preventDefault();
        const h = hours.indexOf(Math.floor(minutes(record.time) / 120) * 2),
          room = rooms.indexOf(record.room);
        const nextTime =
          event.key === "ArrowRight"
            ? hours[h + 1]
            : event.key === "ArrowLeft"
              ? hours[h - 1]
              : undefined;
        const nextRoom =
          event.key === "ArrowDown"
            ? rooms[room + 1]
            : event.key === "ArrowUp"
              ? rooms[room - 1]
              : undefined;
        if (nextTime !== undefined || nextRoom)
          move(record, {
            time: nextTime !== undefined ? timeAt(nextTime * 60) : record.time,
            room: nextRoom || record.room,
            date: day || record.date,
          });
      });
    });
    root
      .querySelectorAll("[data-move]")
      .forEach((button) =>
        button.addEventListener("click", () => edit(find(button.dataset.move))),
      );
  }
  async function move(record, target) {
    if (busy || !canEditRecord(record)) return;
    busy = true;
    $("schedule-message").className = "notice";
    $("schedule-message").textContent = "Spremanje nove satnice…";
    root.querySelectorAll("button,input").forEach((el) => (el.disabled = true));
    try {
      await onMove(record, target);
      if (root.isConnected && $("schedule-message")) {
        $("schedule-message").className = "notice";
        $("schedule-message").textContent = "Satnica je spremljena.";
      }
    } catch (error) {
      if (root.isConnected && $("schedule-message")) {
        $("schedule-message").className = "notice error";
        $("schedule-message").textContent = errorMessage(error);
      }
    } finally {
      busy = false;
      suppressClick = false;
      if (root.isConnected)
        root
          .querySelectorAll("button,input")
          .forEach((el) => (el.disabled = false));
    }
  }
  function edit(record) {
    openDialog(
      "Premjesti događaj i definiraj satnicu",
      `<form id="schedule-move-form" class="form-grid"><div class="field"><label for="move-date">Datum</label><input id="move-date" type="date" required value="${e(record.date)}"></div><div class="field"><label for="move-room">Dvorana</label><input id="move-room" required maxlength="200" value="${e(record.room)}" list="move-rooms"><datalist id="move-rooms">${rooms.map((r) => `<option value="${e(r)}"></option>`).join("")}</datalist></div><div class="field"><label for="move-start">Početak</label><input id="move-start" type="time" required value="${e(record.time)}"></div><div class="field"><label for="move-end">Završetak</label><input id="move-end" type="time" required value="${e(record.endTime || timeAt(minutes(record.time) + durationOf(record)))}"></div><div id="move-availability" class="span-two" role="status" aria-live="polite"></div><button id="move-submit" class="button primary" type="submit">Spremi satnicu</button></form>`,
    );
    const moveTarget = () => ({
      date: document.getElementById("move-date").value,
      room: document.getElementById("move-room").value,
      time: document.getElementById("move-start").value,
      endTime: document.getElementById("move-end").value,
    });
    const checkMove = () => {
      const result = availability(moveTarget(), record.id);
      document.getElementById("move-availability").innerHTML = result.html;
      document.getElementById("move-submit").disabled = result.blocked;
      return !result.blocked;
    };
    ["move-date", "move-room", "move-start", "move-end"].forEach((id) =>
      document.getElementById(id).addEventListener("input", checkMove),
    );
    checkMove();
    document
      .getElementById("schedule-move-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        const target = {
          date: document.getElementById("move-date").value,
          room: document.getElementById("move-room").value,
          time: document.getElementById("move-start").value,
          endTime: document.getElementById("move-end").value,
        };
        if (!checkMove()) return;
        closeDialog();
        move(record, target);
      });
  }
  $("schedule-day").addEventListener("change", (event) => {
    day = event.target.value;
    $("available-date").value = day;
    checkAvailability();
    render();
  });
  $("schedule-day").value = day;
  $("schedule-all-days").addEventListener("click", () => {
    day = "";
    $("schedule-day").value = "";
    render();
  });
  render();
}
