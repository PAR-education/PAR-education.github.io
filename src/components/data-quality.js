import { dataQuality } from "../services/data-quality.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { modules } from "../modules/catalog.js";
export async function mountDataQuality(root, context, isCurrent, onOpen) {
  if (context.profile.role !== "admin") throw new Error("Samo administrator.");
  root.innerHTML =
    '<h1>Kvaliteta podataka</h1><p role="status">Učitavanje…</p>';
  try {
    const data = {};
    for (const name of [
      "students",
      "courses",
      "calendarEvents",
      "enrollments",
      "rooms",
    ])
      data[name] = await context.repository.listAll(name);
    if (!isCurrent()) return;
    const issues = dataQuality(data);
    root.innerHTML = `<div class="page-heading"><h1>Kvaliteta podataka</h1><span class="pill">${issues.length} stavki za provjeru</span></div><section class="panel module-panel"><div class="toolbar"><label>Pretraži nalaze<input id="quality-search" type="search" placeholder="Pretraži…"></label></div><div id="quality-results"></div></section>`;
    const draw = () => {
      const q = root.querySelector("#quality-search").value.toLowerCase();
      root.querySelector("#quality-results").innerHTML =
        `<div class="table-scroll"><table><thead><tr><th>Modul</th><th>Zapis</th><th>Provjera</th><th>Akcija</th></tr></thead><tbody>${issues
          .map((issue, i) => ({ issue, i }))
          .filter(({ issue }) =>
            [issue.row.name, issue.row.title, issue.row.ownerName, issue.reason]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
          .map(
            ({ issue, i }) =>
              `<tr><td>${e(modules[issue.module].title)}</td><td>${e(issue.row.name || issue.row.title || issue.row.ownerName || issue.row.id)}</td><td>${e(issue.reason)}</td><td><button class="button" data-quality="${i}">Otvori i dopuni</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`;
      root
        .querySelectorAll("[data-quality]")
        .forEach((b) =>
          b.addEventListener("click", () =>
            onOpen(issues[Number(b.dataset.quality)]),
          ),
        );
    };
    root.querySelector("#quality-search").addEventListener("input", draw);
    draw();
  } catch (error) {
    if (isCurrent())
      root.innerHTML = `<div class="notice error">${e(errorMessage(error))}</div>`;
  }
}
