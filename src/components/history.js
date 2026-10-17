import { escapeHTML as e, errorMessage, display } from "../utils/helpers.js";
import { openDialog, closeDialog } from "./dialog.js";
import { modules } from "../modules/catalog.js";
export async function mountHistory(root, context, isCurrent) {
  if (context.profile.role !== "admin") throw new Error("Samo administrator.");
  root.innerHTML = "<h1>Povijest i arhiva</h1><p>Učitavanje…</p>";
  try {
    const [history, archive, users] = await Promise.all([
      context.repository.maintenance("auditLog"),
      context.repository.maintenance("archive"),
      context.repository.listAll("users"),
    ]);
    if (!isCurrent()) return;
    root.innerHTML =
      '<div class="page-heading"><h1>Povijest i arhiva</h1></div><details class="context-help"><summary>O povijesti i povratu</summary><p>Povijest bilježi promjene kroz aplikaciju. Izravne izmjene u Firebase Console nisu obuhvaćene. Povrat ne prepisuje postojeće podatke.</p></details><section class="panel module-panel"><div class="toolbar"><label>Prikaz<select id="history-kind"><option value="auditLog">Povijest izmjena</option><option value="archive">Arhiva</option></select></label><label>Pretraži<input id="history-search" type="search"></label></div><div id="history-results"></div></section>';
    const kind = root.querySelector("#history-kind"),
      search = root.querySelector("#history-search");
    const draw = () => {
      const rows = kind.value === "archive" ? archive : history;
      const selected = rows
        .filter((r) =>
          JSON.stringify([
            r.module,
            r.recordId,
            r.actorUid,
            r.data?.name,
            r.data?.title,
          ])
            .toLowerCase()
            .includes(search.value.toLowerCase()),
        )
        .sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
      root.querySelector("#history-results").innerHTML =
        `<p class="table-footer">${selected.length} zapisa${selected.length > 100 ? " · najnovijih 100 prikazano" : ""}</p><div class="table-scroll"><table><thead><tr><th>Datum</th><th>Modul</th><th>Zapis</th><th>Korisnik</th><th>Radnja</th></tr></thead><tbody>${selected
          .slice(0, 100)
          .map(
            (r) =>
              `<tr><td>${e(display(r.createdAt))}</td><td>${e(modules[r.module]?.title || r.module)}</td><td>${e(r.data?.name || r.data?.title || r.after?.name || r.after?.title || r.recordId)}</td><td>${e(users.find((u) => u.id === r.actorUid)?.name || r.actorUid)}</td><td><button class="button" data-log="${e(r.id)}">${kind.value === "archive" && !r.restoredAt ? "Pregled i povrat" : "Detalji"}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`;
      root.querySelectorAll("[data-log]").forEach((button) =>
        button.addEventListener("click", () => {
          const r = rows.find((row) => row.id === button.dataset.log);
          const before = r.before || r.data || {},
            after = r.after || {};
          const keys = [
            ...new Set([...Object.keys(before), ...Object.keys(after)]),
          ].filter((k) => !["updatedAt", "createdAt"].includes(k));
          openDialog(
            "Pregled promjene",
            `<p>${e(modules[r.module]?.title || r.module)} · ${e(r.recordId)}</p><div class="table-scroll"><table><thead><tr><th>Polje</th><th>Prije</th><th>Poslije</th></tr></thead><tbody>${keys
              .filter(
                (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
              )
              .map(
                (k) =>
                  `<tr><td>${e(k)}</td><td>${e(display(before[k]))}</td><td>${e(display(after[k]))}</td></tr>`,
              )
              .join(
                "",
              )}</tbody></table></div>${kind.value === "archive" && !r.restoredAt ? '<button id="archive-restore" class="button primary">Potvrdi povrat zapisa</button>' : ""}<p id="history-message" role="status"></p>`,
          );
          document
            .querySelector("#archive-restore")
            ?.addEventListener("click", async (event) => {
              event.target.disabled = true;
              try {
                await context.repository.restoreArchive(r.id);
                closeDialog();
                if (isCurrent()) mountHistory(root, context, isCurrent);
              } catch (error) {
                document.querySelector("#history-message").textContent =
                  errorMessage(error);
                event.target.disabled = false;
              }
            });
        }),
      );
    };
    kind.addEventListener("change", draw);
    search.addEventListener("input", draw);
    draw();
  } catch (error) {
    if (isCurrent())
      root.innerHTML = `<div class="notice error">${e(errorMessage(error))}</div>`;
  }
}
