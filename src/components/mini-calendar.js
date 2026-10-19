import { zagrebDate } from "../utils/calendar.js";
import { escapeHTML as e } from "../utils/helpers.js";
export function monthDays(month) {
  const first = new Date(month + "-01T12:00:00Z");
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day < 1 || day > count
      ? null
      : month + "-" + String(day).padStart(2, "0");
  });
}
export function mountMiniCalendar(root, events, { onEvent, onOpen }) {
  const today = zagrebDate();
  let selected = today,
    month = today.slice(0, 7);
  const dateLabel = (date) =>
    new Intl.DateTimeFormat("hr-HR", {
      dateStyle: "long",
      timeZone: "Europe/Zagreb",
    }).format(new Date(date + "T12:00:00Z"));
  const dates = new Set(events.map((r) => r.date));
  function render() {
    const lessons = events
      .filter((r) => r.date === selected)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const next = events
      .filter((r) => r.date > selected)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    root.innerHTML = `<div class="panel-title"><h2>Mini kalendar</h2><button class="button" id="mini-open">Cijeli raspored</button></div><div class="mini-calendar"><div class="mini-calendar-heading"><button class="button icon-button" id="mini-prev" aria-label="Prethodni mjesec">‹</button><strong>${e(new Intl.DateTimeFormat("hr-HR", { month: "long", year: "numeric", timeZone: "Europe/Zagreb" }).format(new Date(month + "-01T12:00:00Z")))}</strong><button class="button icon-button" id="mini-next" aria-label="Sljedeći mjesec">›</button></div><div class="mini-calendar-grid" aria-label="Dani u mjesecu">${["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"].map((day) => `<span class="mini-weekday">${day}</span>`).join("")}${monthDays(
      month,
    )
      .map((date) =>
        date
          ? `<button type="button" class="mini-day ${date === today ? "is-today" : ""} ${dates.has(date) ? "has-lessons" : ""}" data-mini-date="${date}" aria-pressed="${date === selected}" ${date === today ? 'aria-current="date"' : ""} aria-label="${e(dateLabel(date))}${dates.has(date) ? ", ima nastave" : ""}">${Number(date.slice(-2))}<span aria-hidden="true"></span></button>`
          : '<span aria-hidden="true"></span>',
      )
      .join(
        "",
      )}</div><div class="mini-calendar-heading"><strong>${e(dateLabel(selected))}</strong><button class="button" id="mini-today">Danas</button></div><div class="mini-lessons" aria-live="polite">${lessons.length ? lessons.map((row, i) => `<button class="mini-lesson" data-mini-lesson="${i}"><strong>${e(row.time)}${row.endTime ? "–" + e(row.endTime) : ""} · ${e(row.title)}</strong><span>${e(row.room || (row.online ? "Online" : "Dvorana nije određena"))}${row.instructorName ? " · " + e(row.instructorName) : ""}</span></button>`).join("") : `<p class="muted">Nema nastave na odabrani dan.</p>${next ? '<button class="button" id="mini-next-lesson">Sljedeći termin</button>' : ""}`}</div></div>`;
    root
      .querySelector("#mini-open")
      .addEventListener("click", () => onOpen(selected));
    for (const [id, delta] of [
      ["mini-prev", -1],
      ["mini-next", 1],
    ])
      root.querySelector("#" + id).addEventListener("click", () => {
        const date = new Date(month + "-01T12:00:00Z");
        date.setUTCMonth(date.getUTCMonth() + delta);
        month = date.toISOString().slice(0, 7);
        selected = month + "-01";
        render();
      });
    root.querySelector("#mini-today").addEventListener("click", () => {
      selected = today;
      month = today.slice(0, 7);
      render();
    });
    root.querySelectorAll("[data-mini-date]").forEach((button) =>
      button.addEventListener("click", () => {
        selected = button.dataset.miniDate;
        render();
        root.querySelector(`[data-mini-date="${selected}"]`)?.focus();
      }),
    );
    root
      .querySelectorAll("[data-mini-lesson]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          onEvent(lessons[Number(button.dataset.miniLesson)]),
        ),
      );
    root.querySelector("#mini-next-lesson")?.addEventListener("click", () => {
      selected = next.date;
      month = selected.slice(0, 7);
      render();
    });
  }
  render();
}
