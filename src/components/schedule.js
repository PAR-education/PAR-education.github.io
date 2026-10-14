import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { icon } from "../modules/visuals.js";
import {
  minutes,
  timeAt,
  durationOf,
  defaultRooms,
} from "../utils/schedule.js";
import { openDialog, closeDialog } from "./dialog.js";
import { bindScheduleDrag } from "./schedule-drag.js";
export function mountSchedule(root, events, { canEdit, onMove, onDetails }) {
  const rooms = [...new Set([...events.map((r) => r.room), ...defaultRooms])];
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
  let day = root.querySelector("#schedule-day")?.value || "",
    busy = false,
    suppressClick = false;
  root.innerHTML = `<div class="schedule-tools"><label>Prikaži datum<input id="schedule-day" type="date"></label><button id="schedule-all-days" class="button">Svi dani</button><p>${canEdit ? "Povucite događaj u drugi termin ili dvoranu. Trajanje se zadržava. Tipkovnica: Alt + strelice; gumb „Satnica” omogućuje točan datum, početak i završetak." : "Raspored je dostupan za pregled. Izmjene radi administrator."}</p></div><div id="schedule-message" role="status" aria-live="polite"></div><div id="schedule-grid"></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const find = (id) => events.find((r) => r.id === id);
  function render() {
    $("schedule-grid").innerHTML =
      `<div class="timetable"><div class="time-labels" style="grid-template-columns:repeat(${hours.length},minmax(160px,1fr))">${hours.map((h) => `<span>${timeAt(h * 60)} – ${h === 22 ? "24:00" : timeAt((h + 2) * 60)}</span>`).join("")}</div>${rooms
        .map(
          (room) =>
            `<section class="room-row"><h2>${icon("door-open")} ${e(room)}</h2><div class="room-slots" style="grid-template-columns:repeat(${hours.length},minmax(160px,1fr))">${hours
              .map(
                (h) =>
                  `<div class="room-slot drop-slot" data-room="${e(room)}" data-time="${timeAt(h * 60)}" aria-label="${e(room)} ${timeAt(h * 60)}">${
                    events
                      .filter(
                        (r) =>
                          r.room === room &&
                          Math.floor(minutes(r.time) / 120) * 2 === h &&
                          (!day || r.date === day),
                      )
                      .map(
                        (r) =>
                          `<div class="schedule-event"><button class="lesson" data-event="${e(r.id)}" draggable="${canEdit}" title="${canEdit ? "Povuci za premještanje · Alt + strelice" : "Detalji događaja"}"><small>${icon("clock")} ${e(r.time)} – ${e(r.endTime || timeAt(minutes(r.time) + durationOf(r)))} · ${e(r.day || r.date)}</small><strong>${e(r.title)}</strong><small>${e(r.instructorName || r.description || "")}</small></button>${canEdit ? `<button class="schedule-edit" data-move="${e(r.id)}" aria-label="Promijeni satnicu: ${e(r.title)}">${icon("arrows-up-down-left-right")} Satnica</button>` : ""}</div>`,
                      )
                      .join("") || "<span>SLOBODNO</span>"
                  }</div>`,
              )
              .join("")}</div></section>`,
        )
        .join("")}</div>`;
    root.querySelectorAll("[data-event]").forEach((button) => {
      const record = find(button.dataset.event);
      button.addEventListener("click", () => {
        if (!suppressClick && !busy) onDetails(record);
      });
      if (!canEdit) return;
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
          move(record, { ...target, date: day || record.date }),
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
    if (busy || !canEdit) return;
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
      `<form id="schedule-move-form" class="form-grid"><div class="field"><label for="move-date">Datum</label><input id="move-date" type="date" required value="${e(record.date)}"></div><div class="field"><label for="move-room">Dvorana</label><input id="move-room" required maxlength="200" value="${e(record.room)}" list="move-rooms"><datalist id="move-rooms">${rooms.map((r) => `<option value="${e(r)}"></option>`).join("")}</datalist></div><div class="field"><label for="move-start">Početak</label><input id="move-start" type="time" required value="${e(record.time)}"></div><div class="field"><label for="move-end">Završetak</label><input id="move-end" type="time" required value="${e(record.endTime || timeAt(minutes(record.time) + durationOf(record)))}"></div><button class="button primary" type="submit">Spremi satnicu</button></form>`,
    );
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
        closeDialog();
        move(record, target);
      });
  }
  $("schedule-day").addEventListener("change", (event) => {
    day = event.target.value;
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
