import { actionMenu } from "./ui-controls.js";
import { openDialog, closeDialog } from "./dialog.js";
import { modules } from "../modules/catalog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { canImport } from "../auth/permissions.js";
import { importFields, prepareImport } from "../services/excel-format.js";
import {
  excelLibrary,
  makeWorkbook,
  readExcelFile,
  downloadFile,
  flatTemplate,
} from "../services/excel-files.js";
import { teachingConflicts } from "../utils/schedule.js";
import { csvContent } from "./export.js";

export function showExcelImport(context, name, onDone, preset = {}) {
  if (!canImport(context.profile.role, name))
    throw new Error("Nemate ovlasti za uvoz.");
  openDialog(
    "Uvoz podataka · " + modules[name].title,
    `<section id="excel-import"><div class="import-actions">${actionMenu("Preuzmi predložak", '<button type="button" id="excel-template">Excel (.xlsx)</button><button type="button" id="json-template">JSON (.json)</button><button type="button" id="csv-template">CSV (.csv)</button>')}</div><details class="context-help"><summary>Kako pripremiti datoteku?</summary><p>Preuzmite predložak i ispunite list <strong>Podaci</strong>. Upute i dopušteni izbori nalaze se u datoteci. Prihvaćamo .xlsx, .json i .csv, do 2000 redaka / 10 MB.</p><p>${name === "calendarEvents" ? "Jedan redak = termin ili serija. Ponavljanje: Jednom, Tjedno ili Svaka dva tjedna; navedite Do datuma i iznimke. Provjeravaju se unesena dvorana, nastavnik i grupa, na svim datumima. Bez dvorane/nastavnika dostupnost tih resursa nije potvrđena." : name === "students" ? "Povezivanje dosjea: JMBAG, zatim e-adresa, zatim ime ako oboje nedostaje. Bez JMBAG-a preporučuje se e-adresa; ne izmišljajte brojeve. Uvoz ne stvara račune." : "ID povezuje ažuriranje s postojećim zapisom. Prazno za novi zapis."}</p><p>Excel: ispunite list Podaci od retka 2. CSV: prvi red su nazivi stupaca iz predloška; jedan red = jedan zapis, razdjelnik zarez ili točka-zarez, kodiranje UTF-8. JSON: popis objekata u uglatim zagradama, jedan objekt = jedan zapis. Datumi YYYY-MM-DD, vrijeme HH:mm, JMBAG i ID kao tekst. Sva tri formata prolaze iste provjere ovlasti, duplikata i rasporeda. Za JSON koristite stvarne brojeve i true/false. Backup JSON nije ovaj format.</p><p>${context.profile.role === "admin" ? "Administrator može uvoziti ovaj modul." : "Uvoz je ograničen na vaše ovlasti. Nastava mora pripadati vašim kolegijima, identitet se dodjeljuje automatski."}</p><ul>${importFields(
      name,
      context.profile.role,
    )
      .map(
        (f) =>
          `<li><strong>${e(f.key)}</strong> — ${e(f.label)}${f.required ? " (obavezno)" : ""}${f.options ? ": " + e(f.options.join(" / ")) : ""}</li>`,
      )
      .join(
        "",
      )}</ul></details>${name === "calendarEvents" ? '<div class="availability-fields"><label>Akademska godina<input id="excel-year" placeholder="2026/2027"></label><label>Semestar<select id="excel-semester"><option value="">Iz datoteke</option><option>Zimski</option><option>Ljetni</option></select></label><label>Studij<input id="excel-study"></label></div>' : ""}<label>Postojeći zapisi<select id="excel-mode"><option value="skip">Preskoči postojeće</option><option value="update">Ažuriraj postojeće</option></select></label><label class="file-label">Odaberi Excel, JSON ili CSV<input id="excel-file" type="file" accept=".xlsx,.json,.csv"></label><button class="button" id="excel-preview">Provjeri datoteku</button><div id="excel-message" role="status" aria-live="polite"></div><div id="excel-results"></div></section>`,
  );
  const root = document.getElementById("excel-import"),
    $ = (id) => root.querySelector("#" + id);
  const inputRow = (value) =>
    /\.json$/i.test($("excel-file").files[0]?.name || "") ? value - 1 : value;
  for (const format of ["json", "csv"])
    $(format + "-template").addEventListener("click", () =>
      downloadFile(
        flatTemplate(name, context.profile.role, format),
        `PAR-${name}-predlozak.${format}`,
        format === "json" ? "application/json" : "text/csv;charset=utf-8",
      ),
    );
  let parsed,
    plan,
    busy = false;
  const current = () => root.isConnected && context.profile.active === true;
  const list = (name) =>
    context.repository.listAll?.(name) || context.repository.list(name);
  async function sources() {
    const existing = await list(name),
      courses = ["calendarEvents", "enrollments"].includes(name)
        ? await list("courses")
        : [],
      students =
        name === "enrollments" && context.profile.role === "admin"
          ? await list("students")
          : [];
    return { existing, courses, students };
  }
  const message = (text) => {
    $("excel-message").textContent = text;
  };
  function invalidate() {
    plan = null;
    $("excel-results").replaceChildren();
  }
  root
    .querySelectorAll("input,select")
    .forEach((el) => el.addEventListener("change", invalidate));
  $("excel-template").addEventListener("click", async () => {
    try {
      const Excel = await excelLibrary(),
        lookups = {};
      if (name === "calendarEvents" || name === "exams" || name === "grades") {
        const courses = await list("courses");
        lookups.courseId = courses
          .filter(
            (c) =>
              context.profile.role !== "profesor" ||
              c.instructorUid === context.user.uid,
          )
          .map((c) => c.id);
        lookups._courses = courses.filter(
          (c) =>
            context.profile.role !== "profesor" ||
            c.instructorUid === context.user.uid,
        );
      }
      if (name === "calendarEvents")
        lookups.room = [
          ...new Set([
            "Dvorana PAR",
            "Dvorana 1",
            "Dvorana 2",
            "Inkubator",
            "IT Lab 1",
            ...(await list("calendarEvents")).map((r) => r.room),
          ]),
        ];
      const book = makeWorkbook(Excel, name, context.profile.role, lookups);
      if (current())
        downloadFile(
          await book.xlsx.writeBuffer(),
          `PAR-${name}-predlozak.xlsx`,
        );
    } catch (error) {
      message(errorMessage(error));
    }
  });
  const options = () => ({
    name,
    role: context.profile.role,
    uid: context.user.uid,
    profile: context.profile,
    rows: Object.keys(preset).length
      ? parsed.map((row) => ({ ...row, ...preset }))
      : parsed,
    mode: $("excel-mode").value,
    defaults:
      name === "calendarEvents"
        ? Object.fromEntries(
            [
              ["academicYear", $("excel-year").value],
              ["semester", $("excel-semester").value],
              ["study", $("excel-study").value],
            ].filter(([, v]) => v),
          )
        : preset,
  });
  $("excel-preview").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    invalidate();
    message("Čitanje i provjera…");
    try {
      const file = $("excel-file").files[0];
      if (!file) throw new Error("Odaberite datoteku.");
      parsed = await readExcelFile(file);
      const loaded = await sources();
      if (!current()) return;
      plan = await prepareImport({ ...options(), ...loaded });
      if (!current()) return;
      const errors = plan.filter((p) => p.error),
        good = plan.filter((p) => !p.error && p.action !== "skip"),
        skipped = plan.filter((p) => p.action === "skip");
      message(
        `Spremno ${good.length} · preskočeno ${skipped.length} · neispravnih redaka ${errors.length}. Još ništa nije spremljeno.`,
      );
      $("excel-results").innerHTML =
        `<div class="import-preview"><table><thead><tr><th>Redak / zapis</th><th>Rezultat</th><th>Podaci / razlog</th></tr></thead><tbody>${plan
          .slice(0, 500)
          .map(
            (p) =>
              `<tr><td>${inputRow(p.row)}</td><td>${p.error ? "Greška" : p.action === "skip" ? "Preskoči" : p.action === "update" ? "Ažuriraj" : "Dodaj"}</td><td>${e(p.error || [p.data.name || p.data.title || p.id, p.data.date, p.data.time, p.data.room].filter(Boolean).join(" · "))}</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table></div>${plan.length > 500 ? "<p>Prikaz prvih 500 rezultata; brojevi iznad uključuju sve.</p>" : ""}${errors.length ? '<label><input id="excel-ignore" type="checkbox"> Izostavi neispravne retke (cijele serije) i uvezi samo ispravne</label>' : ""}<label><input id="excel-confirm" type="checkbox"> Pregledao/la sam podatke i potvrđujem upis${$("excel-mode").value === "update" ? " i zamjenu postojećih vrijednosti" : ""}.</label><button id="excel-apply" class="button primary" ${!good.length ? "disabled" : ""}>Uvezi ${good.length} zapisa</button>`;
      $("excel-apply").addEventListener("click", apply);
      const report = document.createElement("button");
      report.className = "button";
      report.type = "button";
      report.textContent = "Preuzmi cijeli izvještaj provjere (CSV)";
      report.addEventListener("click", () =>
        downloadFile(
          "\uFEFF" +
            csvContent(
              [
                { key: "row", label: "Redak / zapis" },
                { key: "action", label: "Radnja" },
                { key: "id", label: "ID" },
                { key: "error", label: "Greška" },
              ],
              plan.map((p) => ({ ...p, row: inputRow(p.row) })),
            ),
          `PAR-${name}-provjera.csv`,
          "text/csv;charset=utf-8",
        ),
      );
      $("excel-results").prepend(report);
    } catch (error) {
      message(errorMessage(error));
    } finally {
      busy = false;
    }
  });
  async function apply() {
    if (busy || !plan) return;
    if (
      !$("excel-confirm").checked ||
      ($("excel-ignore") && !$("excel-ignore").checked)
    ) {
      message(
        "Potvrdite pregled i izostavljanje neispravnih redaka ako ih ima.",
      );
      return;
    }
    busy = true;
    let count = 0;
    root
      .querySelectorAll("input,select,button")
      .forEach((el) => (el.disabled = true));
    try {
      const refreshed = await prepareImport({
        ...options(),
        ...(await sources()),
      });
      const initial = new Map(
        plan
          .filter((p) => !p.error && p.action !== "skip")
          .map((p) => [p.id, p]),
      );
      for (const p of refreshed) {
        if (p.error && initial.size) {
          if (
            plan.some(
              (old) => old.row === p.row && !old.error && old.action !== "skip",
            )
          )
            throw new Error(
              `Raspored/podaci su izmijenjeni: redak ${inputRow(p.row)}: ${p.error}. Ponovno provjerite datoteku.`,
            );
          continue;
        }
        if (!initial.has(p.id) || p.action === "skip") continue;
        if (!current())
          throw new Error(
            "Prikaz ili ovlasti su promijenjeni. Uvoz zaustavljen.",
          );
        if (name === "calendarEvents") {
          const conflicts = teachingConflicts(
            await list("calendarEvents"),
            p.data,
            p.id,
          );
          if (conflicts.length)
            throw new Error(
              "Termin je u međuvremenu zauzet: " +
                p.data.date +
                " " +
                p.data.time,
            );
        }
        await context.repository.save(name, p.data, p.id, { import: true });
        count++;
        message(`Spremljeno ${count} zapisa…`);
      }
      plan = null;
      message(
        `Uvoz dovršen. Spremljeno ${count} zapisa. Drugi zapisi nisu brisani.`,
      );
      $("excel-results").replaceChildren();
      const done = document.createElement("button");
      done.className = "button primary";
      done.textContent = "Zatvori i osvježi prikaz";
      done.addEventListener("click", () => {
        closeDialog();
        onDone?.();
      });
      $("excel-results").append(done);
    } catch (error) {
      message(
        `Spremljeno ${count} zapisa prije zaustavljanja. ${errorMessage(error)} Ponovni uvoz prepoznaje iste ID-eve.`,
      );
      plan = null;
      $("excel-results").replaceChildren();
    } finally {
      busy = false;
      if (current())
        root
          .querySelectorAll("input,select,button")
          .forEach((el) => (el.disabled = false));
    }
  }
}
