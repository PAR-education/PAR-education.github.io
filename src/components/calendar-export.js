import { escapeHTML as e } from "../utils/helpers.js";
import { weekMonday, zagrebDate } from "../utils/calendar.js";
import {
  minutes,
  durationOf,
  calendarLanes,
  timeAt,
} from "../utils/schedule.js";

export function calendarPrintHTML(events, anchor, view, lang = "hr") {
  const locale = lang === "en" ? "en-GB" : "hr-HR",
    en = lang === "en";
  const add = (date, n) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : zagrebDate();
  const month = date.slice(0, 7),
    first = month + "-01";
  const firstDay = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const monthLength = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
  ).getUTCDate();
  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => add(weekMonday(date), i))
      : Array.from(
          { length: Math.ceil((firstDay + monthLength) / 7) * 7 },
          (_, i) => add(weekMonday(first), i),
        );
  const selected = events.filter((r) =>
    view === "week" ? days.includes(r.date) : r.date?.startsWith(month),
  );
  const label = (d) =>
    new Date(d + "T12:00:00Z").toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      timeZone: "Europe/Zagreb",
    });
  const card = (r) =>
    `<article class="${r.online ? "online" : ""}"><strong>${e(r.title)}</strong><span>${e(r.time)}–${e(r.endTime || timeAt(minutes(r.time) + durationOf(r)))}</span><span>${e([r.room, r.instructorName, r.online ? "Online" : ""].filter(Boolean).join(" · "))}</span></article>`;
  const lo = Math.min(480, ...selected.map((r) => minutes(r.time))),
    hi = Math.max(
      1080,
      ...selected.map((r) => minutes(r.time) + durationOf(r)),
    );
  const grid =
    view === "week"
      ? days
          .map(
            (day) =>
              `<section><h2>${e(label(day))}</h2><div class="track" style="height:${(hi - lo) * 0.72}px">${Array.from({ length: Math.ceil((hi - lo) / 60) }, (_, i) => `<div class="hour" style="top:${i * 43.2}px">${String(Math.floor((lo + i * 60) / 60)).padStart(2, "0")}:00</div>`).join("")}${calendarLanes(
                selected.filter((r) => r.date === day),
              )
                .map(
                  ({ event: r, lane, columns }) =>
                    `<div class="position" style="top:${(minutes(r.time) - lo) * 0.72}px;height:${durationOf(r) * 0.72}px;left:${(lane / columns) * 100}%;width:${100 / columns}%">${card(r)}</div>`,
                )
                .join("")}</div></section>`,
          )
          .join("")
      : days
          .map(
            (day) =>
              `<section class="month-day ${day.startsWith(month) ? "" : "outside"}"><h2>${e(label(day))}</h2>${selected
                .filter((r) => r.date === day)
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(card)
                .join("")}</section>`,
          )
          .join("");
  return `<!doctype html><html lang="${en ? "en" : "hr"}"><head><meta charset="utf-8"><title>${en ? "Teaching calendar" : "Kalendar nastave"}</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#17243c;margin:16px}h1{font-size:20px}h2{font-size:11px;margin:0;padding:8px;background:#e9eef9}p{color:#52627a}.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.grid>section{border:1px solid #cdd5e2;min-width:0}.track{position:relative}.hour{position:absolute;width:100%;border-top:1px solid #dde3ed;font-size:8px;color:#65738b}.position{position:absolute;padding:1px}article{background:#edf2ff;border-left:3px solid #294893;padding:5px;overflow-wrap:anywhere}article strong,article span{display:block;margin-bottom:3px}.position article{height:100%;overflow:hidden}.online{background:#e1f5e8;border-color:#16874c}.month-day{min-height:90px;break-inside:avoid}.month-day article{margin:3px;font-size:9px}.outside{background:#f5f6f8;color:#98a1af}button{padding:10px;margin-bottom:10px}footer{margin-top:12px;font-size:9px}@media print{button{display:none}.grid{print-color-adjust:exact}}</style></head><body><button id="print">${en ? "Print / save as PDF" : "Ispis / spremi kao PDF"}</button><h1>${en ? "Teaching calendar" : "Kalendar nastave"}</h1><p>${view === "week" ? e(label(days[0]) + " – " + label(days[6])) : e(new Date(first + "T12:00:00Z").toLocaleDateString(locale, { month: "long", year: "numeric" }))} · Europe/Zagreb</p><div class="grid">${grid}</div><footer>${en ? "Export respects the selected timetable and filters." : "Izvoz poštuje odabrani raspored i filtre."}</footer></body></html>`;
}
export function printCalendar(events, date, view) {
  const popup = window.open("", "_blank", "width=1200,height=850");
  if (!popup) throw new Error("Dopustite skočne prozore za ispis.");
  popup.document.write(
    calendarPrintHTML(events, date, view, document.documentElement.lang),
  );
  popup.document.close();
  popup.document
    .getElementById("print")
    .addEventListener("click", () => popup.print());
}
