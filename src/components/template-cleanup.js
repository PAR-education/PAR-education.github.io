import {
  reviewTemplates,
  deleteReviewedTemplates,
} from "../services/template-cleanup.js";
import { createBackup } from "../services/backup.js";
import { backupFile } from "../services/backup-format.js";
import { modules } from "../modules/catalog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { downloadFile } from "../utils/download.js";
export function mountTemplateCleanup(root, context, isCurrent) {
  if (context.demo) {
    root.innerHTML =
      '<div class="notice">Čišćenje stvarne baze nije dostupno u demo načinu. Izađite iz demo načina za pregled.</div>';
    return;
  }
  const operation = { ...context, isCurrent };
  let review = null,
    busy = false,
    backedUp = false;
  root.innerHTML = `<div class="page-heading"><div><h1>Priprema baze za prave podatke</h1><p>Pregled oglednih zapisa. Korisnički profili i Authentication računi nikad se ne brišu ovim alatom.</p></div></div><section class="panel cleanup-panel"><p>Ne brišite cijele kolekcije. Ovdje se izdvajaju samo poznati zapisi <code>template-…</code> čiji sadržaj odgovara izvornom predlošku. Izmijenjeni, nepoznati i zapisi s vezama iz drugih evidencija ostaju.</p><p>Čišćenje radite prije uvoza pravih podataka. Dok traje čišćenje, drugi korisnici neka ne unose nove podatke.</p><button id="cleanup-review" class="button">Pregledaj bazu bez promjena</button><div id="cleanup-message" role="status" aria-live="polite"></div><div id="cleanup-results"></div></section>`;
  const $ = (id) => root.querySelector("#" + id),
    message = (text) => {
      $("cleanup-message").textContent = text;
    };
  function lock(value) {
    busy = value;
    root
      .querySelectorAll("button,input")
      .forEach((el) => (el.disabled = value));
  }
  $("cleanup-review").addEventListener("click", async () => {
    if (busy) return;
    lock(true);
    backedUp = false;
    $("cleanup-results").replaceChildren();
    message("Pregled svih modula…");
    try {
      review = await reviewTemplates(operation);
      if (!isCurrent()) return;
      const table = (items, selectable) =>
        `<div class="import-preview"><table><thead><tr><th>Odabir</th><th>Modul / ID</th><th>Naziv / datum</th><th>Razlog</th></tr></thead><tbody>${items.map((r) => `<tr><td>${selectable ? `<input type="checkbox" class="cleanup-item" value="${e(r.name + "/" + r.id)}" aria-label="Odaberi ${e(r.name + "/" + r.id)}">` : "Ostaje"}</td><td>${e(modules[r.name].title)}<br><code>${e(r.id)}</code></td><td>${e(r.title)}<br>${e(r.date)}</td><td>${e(r.reason || "Odgovara poznatom oglednom zapisu")}</td></tr>`).join("")}</tbody></table></div>`;
      $("cleanup-results").innerHTML =
        `<h2>${review.confirmed.length} provjerenih oglednih zapisa</h2><button id="cleanup-all" class="button">Odaberi sve provjerene</button><button id="cleanup-none" class="button">Poništi odabir</button>${table(review.confirmed, true)}<details><summary>${review.retained.length} sumnjivih/izmijenjenih zapisa — ostaju u bazi</summary>${table(review.retained, false)}</details><p>Zapisi bez prefiksa template- ostaju netaknuti, čak i ako nalikuju oglednim podacima.</p><button id="cleanup-backup" class="button">1. Preuzmi potpuni backup baze</button><label><input id="cleanup-backup-saved" type="checkbox"> Provjerio/la sam da je backup datoteka spremljena.</label><label>2. Za potvrdu upišite OBRISI OGLEDNE<input id="cleanup-confirm" autocomplete="off" placeholder="OBRISI OGLEDNE"></label><button id="cleanup-delete" class="button danger">3. Obriši odabrane provjerene ogledne zapise</button><p>Brisanje je trajno u bazi; podaci se mogu vratiti iz preuzetog backupa. Upisi se provjeravaju ponovno. Korisnici i uloge se ne brišu.</p>`;
      $("cleanup-all").addEventListener("click", () =>
        root
          .querySelectorAll(".cleanup-item")
          .forEach((el) => (el.checked = true)),
      );
      $("cleanup-none").addEventListener("click", () =>
        root
          .querySelectorAll(".cleanup-item")
          .forEach((el) => (el.checked = false)),
      );
      $("cleanup-backup").addEventListener("click", async () => {
        if (busy) return;
        lock(true);
        backedUp = false;
        try {
          $("cleanup-backup-saved").checked = false;
          const pending = await createBackup(
            operation,
            Object.keys(modules),
            "full",
          );
          const file = backupFile(pending.backup, "json");
          if (!isCurrent()) return;
          downloadFile(
            `par-prije-ciscenja-${new Date().toISOString().replaceAll(":", "-")}.json`,
            file.content,
            file.type,
          );
          backedUp = true;
          message(
            "Backup je preuzet. Provjerite datoteku, zatim označite potvrdu i odaberite ogledne zapise.",
          );
        } catch (error) {
          message(errorMessage(error));
        } finally {
          if (isCurrent()) lock(false);
        }
      });
      $("cleanup-delete").addEventListener("click", async () => {
        if (busy) return;
        if (
          !backedUp ||
          !$("cleanup-backup-saved").checked ||
          $("cleanup-confirm").value !== "OBRISI OGLEDNE"
        ) {
          message(
            "Prvo preuzmite i provjerite backup te upišite točnu potvrdu.",
          );
          return;
        }
        const ids = Array.from(
          root.querySelectorAll(".cleanup-item:checked"),
          (el) => el.value,
        );
        if (!ids.length) {
          message("Odaberite zapise iz pregleda.");
          return;
        }
        lock(true);
        try {
          const count = await deleteReviewedTemplates(
            operation,
            review,
            ids,
            (n, total) => message(`Obrisano ${n} od ${total}…`),
          );
          if (isCurrent()) {
            message(
              `Obrisano ${count} pregledanih oglednih zapisa. Korisnički računi, uloge i drugi zapisi ostali su netaknuti.`,
            );
            $("cleanup-results").replaceChildren();
          }
        } catch (error) {
          if (isCurrent()) {
            message(errorMessage(error));
            $("cleanup-results").replaceChildren();
          }
        } finally {
          review = null;
          backedUp = false;
          if (isCurrent()) lock(false);
        }
      });
      message(
        "Pregled dovršen. Ništa nije obrisano. Odaberite samo zapise za koje ste sigurni da su ogledni.",
      );
    } catch (error) {
      if (isCurrent()) message(errorMessage(error));
    } finally {
      if (isCurrent()) lock(false);
    }
  });
}
