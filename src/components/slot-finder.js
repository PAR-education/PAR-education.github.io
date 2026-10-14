import { escapeHTML as e } from "../utils/helpers.js";
import {
  availableSlots,
  scheduleConflicts,
  durationOf,
  minutes,
  timeAt,
} from "../utils/schedule.js";
import { zagrebDate } from "../utils/calendar.js";

export function mountSlotFinder(root, form, repository, record = {}) {
  let events = [],
    loaded = false,
    days = 14,
    limit = 12;
  const dateLabel = (date) =>
    new Date(date + "T12:00:00Z").toLocaleDateString("hr-HR", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "Europe/Zagreb",
    });
  root.innerHTML = `<section class="slot-finder"><h2>Pronađi slobodan termin</h2><p>Filtri su neobavezni i mogu se kombinirati. Bez datuma pretražujemo sljedeća dva tjedna, od 08:00 do 20:00.</p><div class="availability-fields"><label>Trajanje (min)<input id="find-duration" type="number" min="15" max="720" step="1" value="90"></label><label>Datum<input id="find-date" type="date"></label><label>Dvorana<select id="find-room"><option value="">Sve dvorane</option></select></label><label>Početak<input id="find-time" type="time"></label></div><button id="find-reset" type="button" class="button">Poništi filtre</button><div id="find-results" aria-live="polite">Učitavanje rasporeda…</div><button id="find-more" type="button" class="button" hidden>Prikaži još</button><div id="find-selected" role="status" aria-live="polite"></div></section>`;
  const $ = (id) => root.querySelector("#" + id);
  function chosenStatus() {
    if (!loaded) return;
    const target = {
      date: form.elements.date.value,
      room: form.elements.room.value,
      time: form.elements.time.value,
      endTime: form.elements.endTime.value,
    };
    if (!target.date || !target.room || !target.time || !target.endTime) {
      $("find-selected").textContent =
        "Odaberite prijedlog ili ručno upišite satnicu ispod.";
      return;
    }
    try {
      const conflicts = scheduleConflicts(events, target, record.id);
      $("find-selected").className =
        "notice" + (conflicts.length ? " error" : " availability-free");
      $("find-selected").textContent = conflicts.length
        ? "Zauzeto: " +
          conflicts
            .map(
              (r) =>
                `${r.title} · ${r.time}–${timeAt(minutes(r.time) + durationOf(r))} · ${r.instructorName || "Nastavnik nije naveden"}`,
            )
            .join("; ")
        : "Odabrani termin je slobodan. Dostupnost se ponovno provjerava prije spremanja.";
    } catch (error) {
      $("find-selected").textContent = error.message;
    }
  }
  function render() {
    if (!loaded) return;
    try {
      const date = $("find-date").value;
      const slots = availableSlots(events, {
        date,
        room: $("find-room").value,
        time: $("find-time").value,
        duration: $("find-duration").value,
        from: zagrebDate(),
        days,
        limit,
        excludeId: record.id,
      });
      $("find-results").innerHTML =
        `<p class="panel-note">${date ? e(dateLabel(date)) : `Pretraga sljedećih ${days} dana`} · ${slots.length} prikazanih prijedloga</p>` +
        (slots.length
          ? `<div class="slot-results">${slots.map((s, i) => `<button type="button" class="slot-result" data-slot="${i}"><strong>${e(dateLabel(s.date))} · ${e(s.time)}–${e(s.endTime)}</strong><span>${e(s.room)}</span></button>`).join("")}</div>`
          : '<p class="notice">Nema slobodnih termina za ove filtre. Promijenite dvoranu, vrijeme ili proširite raspon datuma.</p>');
      $("find-more").hidden = date ? slots.length < limit : false;
      root.querySelectorAll("[data-slot]").forEach((button) =>
        button.addEventListener("click", () => {
          const slot = slots[Number(button.dataset.slot)];
          for (const key of ["date", "room", "time", "endTime"])
            form.elements[key].value = slot[key];
          if (form.elements.day)
            form.elements.day.value = [
              "Ned",
              "Pon",
              "Uto",
              "Sri",
              "Čet",
              "Pet",
              "Sub",
            ][new Date(slot.date + "T12:00:00Z").getUTCDay()];
          root
            .querySelectorAll("[data-slot]")
            .forEach((el) => el.classList.toggle("selected", el === button));
          chosenStatus();
        }),
      );
    } catch (error) {
      $("find-results").textContent = error.message;
      $("find-more").hidden = true;
    }
  }
  ["find-date", "find-room", "find-time", "find-duration"].forEach((id) =>
    $(id).addEventListener("input", () => {
      days = 14;
      limit = 12;
      render();
    }),
  );
  $("find-reset").addEventListener("click", () => {
    for (const id of ["find-date", "find-room", "find-time"]) $(id).value = "";
    days = 14;
    limit = 12;
    render();
  });
  $("find-more").addEventListener("click", () => {
    days += 14;
    limit += 12;
    render();
  });
  for (const key of ["date", "room", "time", "endTime"])
    form.elements[key].addEventListener("input", chosenStatus);
  const ready = (async () => {
    try {
      events = await (repository.listAll?.("calendarEvents") ||
        repository.list("calendarEvents"));
      if (!root.isConnected) return;
      const rooms = [
        ...new Set([
          "Dvorana PAR",
          "Dvorana 1",
          "Dvorana 2",
          "Inkubator",
          "IT Lab 1",
          ...events.map((r) => r.room),
        ]),
      ];
      $("find-room").innerHTML =
        '<option value="">Sve dvorane</option>' +
        rooms.map((room) => `<option>${e(room)}</option>`).join("");
      loaded = true;
      render();
      chosenStatus();
    } catch (error) {
      if (root.isConnected)
        $("find-results").textContent =
          "Raspored nije učitan: " + error.message;
    }
  })();
  return async (values) => {
    await ready;
    const fresh = await (repository.listAll?.("calendarEvents") ||
      repository.list("calendarEvents"));
    const endTime =
      values.endTime || timeAt(minutes(values.time) + durationOf(values));
    const conflicts = scheduleConflicts(
      fresh,
      { ...values, endTime },
      record.id,
    );
    if (conflicts.length)
      throw new Error(
        "Termin je zauzet: " +
          conflicts
            .map(
              (r) =>
                `${r.title} · ${r.time}–${timeAt(minutes(r.time) + durationOf(r))} · ${r.instructorName || "Nastavnik nije naveden"}`,
            )
            .join("; "),
      );
    values.endTime = endTime;
  };
}
