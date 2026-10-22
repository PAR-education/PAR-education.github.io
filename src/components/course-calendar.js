import { courseCalendarItems } from "../utils/course-calendar.js";
import {
  calendarItems,
  calendarICS,
  googleCalendarURL,
  calendarDateLabel,
} from "../utils/calendar.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { downloadFile } from "../utils/download.js";
export function mountCourseCalendar(root, name, record, context, isCurrent) {
  root.innerHTML =
    '<button class="button" type="button" id="course-calendar-open">Dodaj u kalendar</button><div id="course-calendar-preview" aria-live="polite"></div>';
  const button = root.querySelector("button");
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    root.hidden = false;
    button.disabled = true;
    const preview = root.querySelector("#course-calendar-preview");
    preview.textContent = "Učitavanje termina…";
    try {
      const items =
        name === "courses"
          ? courseCalendarItems(
              record,
              await context.repository.listAll("calendarEvents"),
            )
          : calendarItems({ [name]: [record] });
      if (!isCurrent() || !root.isConnected) return;
      preview.innerHTML = items.length
        ? `<p>${items.length} termina · Europe/Zagreb</p><button type="button" class="button primary" id="course-calendar-download">Preuzmi sve termine (.ics)</button><details class="context-help"><summary>Kako dodati sve u Google kalendar</summary><p>Preuzmite datoteku pa u Google Calendaru otvorite Postavke → Uvoz i izvoz → Uvoz. Promjene u PAR-u ne prenose se automatski. Ako završetak nije upisan, izvoz koristi trajanje od 60 minuta.</p></details><div class="course-calendar-list">${items.map((item) => `<article><strong>${e(calendarDateLabel(item))}${item.allDay ? "" : " – " + e(new Intl.DateTimeFormat("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(item.end)))}</strong><p>${e(item.location || "Dvorana nije određena")}${item.instructorName ? " · " + e(item.instructorName) : ""}</p><a class="button" href="${e(googleCalendarURL(item))}" target="_blank" rel="noopener noreferrer">Dodaj u Google kalendar</a></article>`).join("")}</div>`
        : "<p>Za ovaj kolegij još nema unesenih termina nastave.</p>";
      root
        .querySelector("#course-calendar-download")
        ?.addEventListener("click", () =>
          downloadFile(
            "par-termini.ics",
            calendarICS(items),
            "text/calendar;charset=utf-8",
          ),
        );
    } catch (error) {
      if (root.isConnected) preview.textContent = errorMessage(error);
    } finally {
      button.disabled = false;
    }
  });
}
