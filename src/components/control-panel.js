import { modules } from "../modules/catalog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { icon } from "../modules/visuals.js";
import { downloadFile } from "../utils/download.js";
import { zagrebDate } from "../utils/calendar.js";
import {
  backupModules,
  backupFile,
  readBackupFile,
  MAX_BACKUP_BYTES,
} from "../services/backup-format.js";
import {
  createBackup,
  confirmBackup,
  restoreBackup,
  getBackupState,
  backupScope,
} from "../services/backup.js";
export function mountControlPanel(root, context, isCurrent) {
  if (context.profile.role !== "admin" || context.profile.active !== true)
    throw new Error("Nemate pristup control panelu.");
  let pending = null,
    loaded = null,
    busy = false;
  const operationContext = { ...context, isCurrent };
  const checked = (selector) =>
    Array.from(root.querySelectorAll(selector + ":checked"), (el) => el.value);
  const choices = (names, type) =>
    names
      .map(
        (name) =>
          `<label class="module-option"><input type="checkbox" class="${type}" value="${e(name)}" checked>${icon(name)}<span>${e(modules[name].title)}</span></label>`,
      )
      .join("");
  root.innerHTML = `<div class="page-heading"><div><h1>Control panel</h1><p>Sigurnosne kopije, izvoz modula i vraćanje podataka.</p></div></div><div id="backup-message" role="status" aria-live="polite"></div><div class="backup-layout"><section class="panel backup-section"><h2>${icon("database")} Izvoz i backup</h2><p>Odaberite module i format. Potpuni backup sadrži sve zapise; inkrementalni samo promjene od zadnjeg potvrđenog backupa.</p><div class="backup-selection"><button class="button" id="backup-all">Odaberi sve</button><button class="button" id="backup-none">Poništi odabir</button></div><div class="module-options">${choices(backupModules, "backup-module")}</div><div class="backup-fields"><label>Vrsta backupa<select id="backup-mode" aria-label="Vrsta backupa"><option value="full">Potpuni backup</option><option value="incremental">Inkrementalni backup</option><option value="range">Backup vremenskog raspona</option></select></label><label>Format<select id="backup-format" aria-label="Format backupa"><option value="json">JSON — strukturirani backup</option><option value="csv">CSV — backup i pregled u tablici</option><option value="zip">ZIP — JSON i CSV po modulima</option></select></label></div><div id="backup-range" class="backup-fields" hidden><label>Od datuma<input type="date" id="backup-from"></label><label>Do datuma<input type="date" id="backup-to"></label><p>Zapisi prema zadnjoj izmjeni (ili datumu kreiranja ako izmjena nije zabilježena). Oba datuma uključena su u raspon, u vremenskoj zoni Europe/Zagreb. Ova kopija ne mijenja polazište inkrementalnog backupa.</p></div><button id="backup-download" class="button primary">${icon("download")} Izradi i preuzmi backup</button><div id="backup-confirm" hidden><p>Provjerite da je datoteka spremljena. Tek potvrdom postaje polazište sljedećeg inkrementalnog backupa.</p><button id="backup-ack" class="button primary">Datoteka je spremljena — potvrdi backup</button></div><details><summary>Što se čuva u backupu?</summary><p>Svi zapisi odabranih modula, uključujući ID-eve i datume. Promjene se uspoređuju po sadržaju; obrisani zapisi imaju oznake brisanja. Evidencija zadnjeg backupa čuva se za ovaj račun u ovom pregledniku. Lozinke i Firebase Authentication računi nisu dio backupa.</p><p>Za vraćanje inkrementalnog backupa treba početni potpuni backup i zatim inkrementalni backupi redom. Čuvajte cijeli lanac.</p><p>Za provjeru promjena čitaju se svi zapisi odabranih modula; u inkrementalnu datoteku ulaze samo promjene. Kopija više modula nije jedna atomska snimka: najbolje je izraditi backup kad nema aktivnih izmjena.</p></details><div id="backup-history"></div></section><section class="panel backup-section"><h2>${icon("upload")} Import i vraćanje</h2><p>Učitajte PAR backup u JSON, CSV ili ZIP formatu. Prije vraćanja možete odabrati sve ili samo neke module sadržane u datoteci.</p><label class="file-label">Backup datoteka<input id="restore-file" type="file" accept=".json,.csv,.zip"></label><p>Najveća veličina: 25 MB. Običan CSV iz pojedinog modula služi za pregled; vraćanje koristi CSV iz ovog panela.</p><div id="restore-preview"></div><p>Vraćanje profila ne stvara Authentication račune niti njihove lozinke. Uvoz može zamijeniti podatke i korisničke uloge odabranih zapisa.</p></section></div>`;
  const $ = (id) => root.querySelector("#" + id);
  $("backup-from").value = zagrebDate();
  $("backup-to").value = zagrebDate();
  $("backup-mode").addEventListener("change", () => {
    $("backup-range").hidden = $("backup-mode").value !== "range";
  });
  function message(text, error = false) {
    if (!isCurrent()) return;
    $("backup-message").className = "notice " + (error ? "error" : "");
    $("backup-message").textContent = text;
  }
  function history() {
    const state = getBackupState(backupScope(context));
    $("backup-history").innerHTML =
      "<h3>Zadnji potvrđeni backup po modulu</h3>" +
      Object.entries(state.checkpoints)
        .map(
          ([name, point]) =>
            `<p><strong>${e(modules[name]?.title || name)}</strong> · ${e(new Date(point.createdAt).toLocaleString("hr-HR", { timeZone: "Europe/Zagreb" }))}</p>`,
        )
        .join("");
  }
  try {
    history();
  } catch (error) {
    message(errorMessage(error), true);
  }
  function lock(value) {
    busy = value;
    root
      .querySelectorAll("button,input,select")
      .forEach((el) => (el.disabled = value));
  }
  $("backup-all").addEventListener("click", () =>
    root
      .querySelectorAll(".backup-module")
      .forEach((el) => (el.checked = true)),
  );
  $("backup-none").addEventListener("click", () =>
    root
      .querySelectorAll(".backup-module")
      .forEach((el) => (el.checked = false)),
  );
  $("backup-download").addEventListener("click", async () => {
    if (busy || !isCurrent()) return;
    lock(true);
    pending = null;
    $("backup-confirm").hidden = true;
    message("Čitanje svih odabranih modula i izrada backupa…");
    try {
      const result = await createBackup(
        operationContext,
        checked(".backup-module"),
        $("backup-mode").value,
        { from: $("backup-from").value, to: $("backup-to").value },
      );
      if (!isCurrent()) return;
      const format = $("backup-format").value,
        file = backupFile(result.backup, format);
      const size =
        typeof file.content === "string"
          ? new TextEncoder().encode(file.content).length
          : file.content.length;
      if (size > MAX_BACKUP_BYTES)
        throw new Error("Backup prelazi 25 MB. Odaberite manje modula.");
      downloadFile(
        "par-" +
          result.backup.mode +
          "-" +
          result.backup.createdAt.replace(/[:.]/g, "-") +
          "." +
          format,
        file.content,
        file.type,
      );
      pending = result;
      $("backup-confirm").hidden = false;
      $("backup-confirm").querySelector("p").textContent =
        result.backup.mode === "range"
          ? "Provjerite spremanje datoteke. Ovaj backup ne mijenja polazište inkrementalnog backupa."
          : "Provjerite da je datoteka spremljena. Tek potvrdom postaje polazište sljedećeg inkrementalnog backupa.";
      const changed = Object.values(result.backup.modules).reduce(
          (n, p) => n + p.upserts.length,
          0,
        ),
        deleted = Object.values(result.backup.modules).reduce(
          (n, p) => n + p.deleted.length,
          0,
        );
      message(
        "Backup je pripremljen: " +
          changed +
          " zapisa, " +
          deleted +
          " oznaka brisanja. Potvrdite spremanje datoteke." +
          (result.backup.mode === "range"
            ? " Bez ispravnog datuma preskočeno je " +
              Object.values(result.backup.omittedWithoutTimestamp).reduce(
                (n, v) => n + v,
                0,
              ) +
              " zapisa."
            : ""),
      );
    } catch (error) {
      message(errorMessage(error), true);
    } finally {
      if (isCurrent()) lock(false);
    }
  });
  $("backup-ack").addEventListener("click", () => {
    if (!pending || !isCurrent()) return;
    try {
      const ranged = pending.backup.mode === "range";
      confirmBackup(context, pending);
      pending = null;
      $("backup-confirm").hidden = true;
      history();
      message(
        ranged
          ? "Backup razdoblja je potvrđen. Polazište inkrementalnog backupa ostaje nepromijenjeno."
          : "Backup je potvrđen. Sljedeći inkrementalni backup kreće od ovog stanja.",
      );
    } catch (error) {
      message(errorMessage(error), true);
    }
  });
  $("restore-file").addEventListener("change", async (event) => {
    if (busy || !event.target.files[0]) return;
    loaded = null;
    $("restore-preview").replaceChildren();
    lock(true);
    try {
      const backup = await readBackupFile(event.target.files[0]);
      if (!isCurrent()) return;
      loaded = backup;
      $("restore-preview").innerHTML =
        `<div class="notice"><strong>${backup.mode === "full" ? "Potpuni" : backup.mode === "range" ? "Vremenski" : "Inkrementalni"} backup</strong><p>${e(new Date(backup.createdAt).toLocaleString("hr-HR", { timeZone: "Europe/Zagreb" }))} · projekt ${e(backup.source.projectId)}</p></div><div class="module-options">${choices(Object.keys(backup.modules), "restore-module")}</div><ul>${Object.entries(
          backup.modules,
        )
          .map(
            ([name, part]) =>
              `<li>${e(modules[name].title)}: ${part.upserts.length} zapisa, ${part.deleted.length} oznaka brisanja</li>`,
          )
          .join(
            "",
          )}</ul><label class="module-option"><input id="restore-deletions" type="checkbox">Primijeni i brisanja (potpuni backup zamjenjuje odabrane kolekcije; korisnički profili se ne brišu)</label><label class="module-option"><input id="restore-confirmation" type="checkbox">Pregledao/la sam backup i potvrđujem zamjenu podataka odabranih modula.</label><button class="button primary" id="restore-apply">Vrati odabrane module</button>`;
      $("restore-preview")
        .querySelector(".module-options")
        .insertAdjacentHTML(
          "beforebegin",
          '<div class="backup-selection"><button class="button" id="restore-all">Odaberi sve module iz backupa</button><button class="button" id="restore-none">Poništi odabir modula iz backupa</button></div>',
        );
      if (backup.mode === "range") {
        $("restore-deletions").closest("label").hidden = true;
        $("restore-preview")
          .querySelector(".notice")
          .insertAdjacentHTML(
            "beforeend",
            `<p>Razdoblje: ${e(backup.dateRange.from)} – ${e(backup.dateRange.to)}. Vraćaju se samo uključeni zapisi; ostali se ne brišu.</p>`,
          );
      }
      $("restore-all").addEventListener("click", () =>
        root
          .querySelectorAll(".restore-module")
          .forEach((el) => (el.checked = true)),
      );
      $("restore-none").addEventListener("click", () =>
        root
          .querySelectorAll(".restore-module")
          .forEach((el) => (el.checked = false)),
      );
      $("restore-apply").addEventListener("click", async () => {
        if (busy || !loaded || !isCurrent()) return;
        if (!$("restore-confirmation").checked) {
          message("Prije vraćanja potvrdite da ste pregledali backup.", true);
          return;
        }
        lock(true);
        message("Vraćanje odabranih modula…");
        try {
          const count = await restoreBackup(
            operationContext,
            loaded,
            checked(".restore-module"),
            $("restore-deletions").checked,
          );
          message(
            "Vraćanje završeno: " +
              count +
              " operacija. Otvorite module za pregled podataka.",
          );
        } catch (error) {
          message(errorMessage(error), true);
        } finally {
          if (isCurrent()) lock(false);
        }
      });
      message("Backup je provjeren. Odaberite module koje želite vratiti.");
    } catch (error) {
      message("Backup nije učitan: " + errorMessage(error), true);
    } finally {
      if (isCurrent()) lock(false);
    }
  });
}
