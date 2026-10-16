import { canRead } from "../auth/permissions.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { icon } from "../modules/visuals.js";
import {
  calendarSources,
  calendarItems,
  calendarICS,
  googleCalendarURL,
  calendarDateLabel,
  weekMonday,
} from "../utils/calendar.js";
import { downloadFile } from "../utils/download.js";
export function mountCalendarIntegration(root, context, isCurrent) {
  const allowed = Object.keys(calendarSources).filter((name) =>
    canRead(context.profile.role, name),
  );
  let items = [],
    busy = false;
  root.innerHTML = `<div class="page-heading"><div><h1>Integracija s kalendarom</h1><p>Prijenos rasporeda u Google Calendar, Outlook ili Apple Calendar.</p></div></div><section class="panel backup-section"><h2>${icon("calendar-days")} Odaberite raspored</h2><div class="module-options">${allowed.map((name) => `<label class="module-option"><input class="calendar-source" type="checkbox" value="${name}" ${name === "calendarEvents" ? "checked" : ""}>${icon(name)}${e(calendarSources[name])}</label>`).join("")}</div><div class="backup-fields"><label>Tjedan za kolegije<input id="calendar-week" type="date" value="${weekMonday()}"></label><label>Trajanje kad završetak nije naveden<select id="calendar-duration"><option value="60">60 minuta</option><option value="90">90 minuta</option><option value="120">120 minuta</option></select></label></div><p>Vremenska zona: Europe/Zagreb. Kolegiji se prenose za odabrani tjedan; ostali zapisi zadržavaju svoj datum. Ako izvor nema završetak događaja, koristi se odabrano trajanje.</p><div class="backup-selection"><button class="button primary" id="calendar-preview">Prikaži događaje</button><button class="button" id="calendar-ics" disabled>${icon("download")} Preuzmi raspored (.ics)</button></div><div id="calendar-message" role="status" aria-live="polite"></div><div id="calendar-preview-area"></div></section><section class="panel backup-section"><h2>Kako prenijeti raspored</h2><ol><li>Odaberite izvore rasporeda i kliknite „Prikaži događaje”.</li><li>Odaberite sve ili pojedine događaje za prijenos.</li><li>Za jedan događaj kliknite „Dodaj u Google kalendar” i spremite ga na Googleovoj stranici.</li><li>Za više događaja preuzmite .ics datoteku. U Google Calendaru otvorite Postavke → Uvoz i izvoz → Uvoz, odaberite datoteku i ciljni kalendar.</li></ol><p>Ovo je prijenos događaja na vaš zahtjev. Promjene u PAR-u se ne ažuriraju automatski u Google Calendaru. Ponovljeni uvoz iste datoteke može stvoriti duplikate; za testiranje odaberite zaseban kalendar. Prije prijenosa pregledajte naslove i opise koji će biti vidljivi u odabranom kalendaru.</p><a href="https://support.google.com/calendar/answer/37118?hl=hr" target="_blank" rel="noopener noreferrer">Googleove upute za uvoz kalendara</a></section>`;
  root.innerHTML = `<div class="page-heading"><div><h1>Integracija s kalendarom</h1><p>Prijenos rasporeda u Google Calendar, Outlook ili Apple Calendar.</p></div></div><section class="panel backup-section"><h2>${icon("calendar-days")} Odaberite raspored</h2><div class="module-options">${allowed.map((name) => `<label class="module-option"><input class="calendar-source" type="checkbox" value="${name}" ${name === "calendarEvents" ? "checked" : ""}>${icon(name)}${e(calendarSources[name])}</label>`).join("")}</div><div class="backup-fields"><label>Tjedan za kolegije<input id="calendar-week" type="date" value="${weekMonday()}"></label><label>Trajanje kad završetak nije naveden<select id="calendar-duration"><option value="60">60 minuta</option><option value="90">90 minuta</option><option value="120">120 minuta</option></select></label></div><p>Vremenska zona: Europe/Zagreb. Kolegiji se prenose za odabrani tjedan; ostali zapisi zadržavaju svoj datum. Ako izvor nema završetak događaja, koristi se odabrano trajanje.</p><div class="backup-selection"><button class="button primary" id="calendar-preview">Prikaži događaje</button><button class="button" id="calendar-ics" disabled>${icon("download")} Preuzmi odabrane (.ics)</button><button class="button" id="calendar-google-all" disabled>Pripremi sve za Google kalendar (.ics)</button></div><div id="calendar-message" role="status" aria-live="polite"></div><div id="calendar-preview-area"></div></section><section class="panel backup-section"><h2>Kako prenijeti raspored</h2><ol><li>Odaberite izvore rasporeda i kliknite „Prikaži događaje”.</li><li>Odaberite sve ili pojedine događaje za prijenos.</li><li>Za jedan događaj kliknite „Dodaj u Google kalendar” i spremite ga na Googleovoj stranici.</li><li>Za sve prikazane događaje kliknite „Pripremi sve za Google kalendar (.ics)”; za dio događaja označite željene pa kliknite „Preuzmi odabrane (.ics)”. U Google Calendaru otvorite Postavke → Uvoz i izvoz → Uvoz, odaberite datoteku i ciljni kalendar.</li></ol><p>Ovo je prijenos događaja na vaš zahtjev. Promjene u PAR-u se ne ažuriraju automatski u Google Calendaru. Ponovljeni uvoz iste datoteke može stvoriti duplikate; za testiranje odaberite zaseban kalendar. Prije prijenosa pregledajte naslove i opise koji će biti vidljivi u odabranom kalendaru.</p><a href="https://support.google.com/calendar/answer/37118?hl=hr" target="_blank" rel="noopener noreferrer">Googleove upute za uvoz kalendara</a></section>`;
  const $ = (id) => root.querySelector("#" + id);
  function message(text, error = false) {
    if (!isCurrent()) return;
    $("calendar-message").className = "notice " + (error ? "error" : "");
    $("calendar-message").textContent = text;
  }
  function resetPreview() {
    items = [];
    $("calendar-preview-area").replaceChildren();
    $("calendar-ics").disabled = true;
    $("calendar-google-all").disabled = true;
  }
  root
    .querySelectorAll(".calendar-source,#calendar-week,#calendar-duration")
    .forEach((el) => el.addEventListener("change", resetPreview));
  $("calendar-preview").addEventListener("click", async () => {
    if (busy || !isCurrent()) return;
    busy = true;
    $("calendar-preview").disabled = true;
    root
      .querySelectorAll(".calendar-source,#calendar-week,#calendar-duration")
      .forEach((el) => (el.disabled = true));
    resetPreview();
    message("Učitavanje odabranog rasporeda…");
    try {
      const selected = Array.from(
        root.querySelectorAll(".calendar-source:checked"),
        (el) => el.value,
      );
      if (!selected.length)
        throw new Error("Odaberite barem jedan izvor rasporeda.");
      const data = {};
      for (const name of selected)
        data[name] = await (context.repository.listAll?.(name) ||
          context.repository.list(name));
      if (!isCurrent()) return;
      items = calendarItems(data, {
        monday: $("calendar-week").value,
        duration: Number($("calendar-duration").value),
      });
      $("calendar-preview-area").innerHTML = items.length
        ? `<div class="backup-selection"><button id="calendar-all" class="button">Odaberi sve događaje</button><button id="calendar-none" class="button">Poništi odabir</button></div><div class="calendar-export-list">${items.map((item, i) => `<article class="calendar-export-item"><input class="calendar-item" type="checkbox" value="${i}" aria-label="Odaberi događaj ${e(item.title)}" checked><div><h3>${e(item.title)}</h3><p>${e(calendarDateLabel(item))} · ${e(item.location)}</p><p>${e(item.instructorName ? "Profesor: " + item.instructorName : "")}</p><small>${e(calendarSources[item.module])}</small></div><a class="button" href="${e(googleCalendarURL(item))}" target="_blank" rel="noopener noreferrer">${icon("calendar-plus")} Dodaj u Google kalendar</a></article>`).join("")}</div>`
        : '<div class="empty"><h2>Nema događaja u odabranim izvorima</h2></div>';
      $("calendar-all")?.addEventListener("click", () =>
        root
          .querySelectorAll(".calendar-item")
          .forEach((el) => (el.checked = true)),
      );
      $("calendar-none")?.addEventListener("click", () =>
        root
          .querySelectorAll(".calendar-item")
          .forEach((el) => (el.checked = false)),
      );
      $("calendar-ics").disabled = !items.length;
      $("calendar-google-all").disabled = !items.length;
      message(
        "Pripremljeno " + items.length + " događaja za pregled i prijenos.",
      );
    } catch (error) {
      message(errorMessage(error), true);
    } finally {
      if (isCurrent()) {
        $("calendar-preview").disabled = false;
        root
          .querySelectorAll(
            ".calendar-source,#calendar-week,#calendar-duration",
          )
          .forEach((el) => (el.disabled = false));
      }
      busy = false;
    }
  });
  $("calendar-google-all").addEventListener("click", () => {
    if (!isCurrent() || !items.length || busy) return;
    downloadFile(
      "par-svi-dogadaji.ics",
      calendarICS(items),
      "text/calendar;charset=utf-8",
    );
    message(
      "Pripremljeno svih " +
        items.length +
        " prikazanih događaja s nazivom, dvoranom i profesorom ako su uneseni. U Google Calendaru otvorite Postavke → Uvoz i izvoz → Uvoz te učitajte preuzetu .ics datoteku. Bez povezivanja Google računa događaji se ne spremaju automatski.",
    );
  });
  $("calendar-ics").addEventListener("click", () => {
    if (!isCurrent() || busy) return;
    const selected = Array.from(
      root.querySelectorAll(".calendar-item:checked"),
      (el) => items[Number(el.value)],
    );
    if (!selected.length) {
      message("Odaberite barem jedan događaj.", true);
      return;
    }
    downloadFile(
      "par-raspored.ics",
      calendarICS(selected),
      "text/calendar;charset=utf-8",
    );
    message(
      "Pripremljena .ics datoteka s " +
        selected.length +
        " događaja. Uvezite je u željeni kalendar.",
    );
  });
}
