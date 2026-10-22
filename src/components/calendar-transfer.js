import { openDialog } from "./dialog.js";
import {
  calendarItems,
  calendarICS,
  googleCalendarURL,
  calendarDateLabel,
} from "../utils/calendar.js";
import { escapeHTML as e } from "../utils/helpers.js";
import { downloadFile } from "../utils/download.js";

export function showCalendarTransfer(records) {
  const items = calendarItems({ calendarEvents: records });
  openDialog(
    "Dodaj u Google kalendar",
    items.length
      ? `<p><span>Odabrani termini</span>: ${items.length}</p><button type="button" class="button primary" id="calendar-transfer-all">Preuzmi sve termine (.ics)</button><p>Za prijenos svih termina preuzmite datoteku pa u Google Calendaru otvorite Postavke → Uvoz i izvoz → Uvoz. Promjene u PAR-u ne prenose se automatski.</p><div class="course-calendar-list">${items.map((item) => `<article><strong>${e(item.title)}</strong><p>${e(calendarDateLabel(item))} · ${e(item.location || "Dvorana nije određena")}${item.instructorName ? " · " + e(item.instructorName) : ""}</p><a class="button" href="${e(googleCalendarURL(item))}" target="_blank" rel="noopener noreferrer">Dodaj u Google kalendar</a></article>`).join("")}</div>`
      : "<p>Nema termina za odabrane filtre.</p>",
  );
  document
    .getElementById("calendar-transfer-all")
    ?.addEventListener("click", () =>
      downloadFile(
        "par-raspored.ics",
        calendarICS(items),
        "text/calendar;charset=utf-8",
      ),
    );
}
