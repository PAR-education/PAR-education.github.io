import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { zagrebDate } from "../utils/calendar.js";
import {
  workValues,
  workPeriod,
  workMatrix,
  workGroup,
} from "../utils/work-time.js";
import { modules } from "../modules/catalog.js";
import { validateFields } from "../utils/validation.js";
import { actionMenu } from "./ui-controls.js";
import { openDialog, closeDialog } from "./dialog.js";
import { exportCSV, printReport } from "./export.js";
import { showExcelImport } from "./excel-import.js";
import { excelLibrary, downloadFile } from "../services/excel-files.js";
import {
  buildWorkWorkbook,
  parseWorkWorkbook,
  prepareWorkTableImport,
} from "../services/work-excel.js";
import { digest } from "../services/backup-format.js";

const categories = [
  "Studij",
  "Cjeloživotno obrazovanje",
  "Projekti",
  "Administracija",
  "Ostalo",
];
const number = (v) =>
  v == null ? "—" : Number(v.toFixed(2)).toLocaleString("hr-HR");
const dateLabel = (d) =>
  new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Zagreb",
  }).format(new Date(d + "T12:00:00Z"));
export async function mountWorkTime(root, context, isCurrent) {
  if (!["admin", "administracija_par"].includes(context.profile.role))
    throw new Error("Nemate ovlasti za evidenciju rada.");
  const { repository } = context;
  let entries = [],
    plans = [],
    people = new Map(),
    ownerUid = "",
    anchor = zagrebDate(),
    view = "month",
    busy = false;
  const $ = (id) =>
    root.querySelector("#" + id) ||
    document.getElementById("calendar-topbar")?.querySelector("#" + id);
  async function load() {
    const data = await Promise.all([
      repository.listAll("workEntries"),
      repository.listAll("workPlans"),
      repository.listAll("employees"),
    ]);
    if (!isCurrent()) return;
    [entries, plans] = data;
    const next = new Map();
    for (const p of data[2])
      next.set(p.ownerUid || `employee:${p.id}`, p.name || "Zaposlenik");
    for (const r of [...entries, ...plans]) next.set(r.ownerUid, r.ownerName);
    next.set(
      context.user.uid,
      context.profile.name || context.user.email || "Administrator",
    );
    people = next;
    if (!people.has(ownerUid)) ownerUid = people.keys().next().value;
    render();
  }
  const person = () => ({
    ownerUid,
    ownerName: people.get(ownerUid) || "Zaposlenik",
  });
  const periodRows = () => {
    const p = workPeriod(anchor, view);
    return entries
      .filter(
        (r) => r.ownerUid === ownerUid && r.date >= p.start && r.date <= p.end,
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startTime || "99").localeCompare(b.startTime || "99"),
      );
  };
  const monthRows = () =>
    workMatrix(entries, plans, workPeriod(anchor, "month").days, ownerUid);
  async function operation(action) {
    if (busy) return;
    busy = true;
    document
      .querySelectorAll("#work-form button,#work-import button")
      .forEach((b) => (b.disabled = true));
    try {
      await action();
      if (isCurrent()) {
        closeDialog();
        await load();
      }
    } catch (error) {
      const output = document.getElementById("work-error") || $("work-message");
      if (output && isCurrent()) output.textContent = errorMessage(error);
    } finally {
      busy = false;
      document
        .querySelectorAll("#work-form button,#work-import button")
        .forEach((b) => (b.disabled = false));
    }
  }
  function form(kind, record = null) {
    const plan = kind === "workPlans",
      value = record || {};
    const rowPerson = record
      ? { ownerUid: record.ownerUid, ownerName: record.ownerName }
      : person();
    openDialog(
      plan
        ? "Mjesečni plan rada"
        : record
          ? "Uredi aktivnost"
          : "Nova aktivnost",
      `<form id="work-form"><div class="work-form-grid"><label>Zaposlenik<input value="${e(rowPerson.ownerName)}" readonly></label><label>${plan ? "Mjesec" : "Datum"}<input name="${plan ? "month" : "date"}" type="${plan ? "month" : "date"}" value="${e(plan ? value.month || anchor.slice(0, 7) : value.date || anchor)}" required></label><label>Skupina<select name="category">${categories.map((c) => `<option ${workGroup(value.category) === c ? "selected" : ""}>${e(c)}</option>`).join("")}</select></label><label>Aktivnost / zadatak<input name="activity" value="${e(value.activity || value.description || "")}" maxlength="200" required list="work-activities"><datalist id="work-activities">${[
        ...new Set(
          [...entries, ...plans]
            .filter((r) => r.ownerUid === rowPerson.ownerUid)
            .map((r) => r.activity)
            .filter(Boolean),
        ),
      ]
        .map((a) => `<option value="${e(a)}"></option>`)
        .join(
          "",
        )}</datalist></label><label>Projekt / oznaka<input name="projectId" value="${e(value.projectId || "")}" maxlength="200"></label>${plan ? `<label>Planirano sati<input name="plannedHours" type="number" min="0" max="744" step="0.01" value="${value.plannedHours ?? ""}" required></label>` : `<label>Od (24 h)<input name="startTime" placeholder="08:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value="${e(value.startTime || "")}"></label><label>Do (24 h)<input name="endTime" placeholder="16:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value="${e(value.endTime || "")}"></label><label>Sati<input name="hours" type="number" min="0.0001" max="24" step="any" value="${value.hours ?? ""}"></label><label class="work-wide">Opis rada<textarea name="description" maxlength="2000" rows="3">${e(value.description || "")}</textarea></label><small class="work-wide">Unesite vrijeme od–do ili samo sate. Kad unesete vrijeme, sati se izračunaju automatski.</small>`}</div><p id="work-error" role="alert"></p><div class="detail-actions"><button class="button primary" type="submit">Spremi</button>${record?.id ? '<button class="button danger" id="work-delete" type="button">Arhiviraj</button>' : ""}</div></form>`,
    );
    const form = document.getElementById("work-form");
    const calc = () => {
      const v = Object.fromEntries(new FormData(form));
      if (v.startTime && v.endTime)
        try {
          form.elements.hours.value = workValues(v).hours;
        } catch {
          /* Form validation displays the error on save. */
        }
    };
    for (const field of ["startTime", "endTime"])
      form.elements[field]?.addEventListener("change", calc);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      operation(async () => {
        let data = { ...Object.fromEntries(new FormData(form)), ...rowPerson };
        if (!plan) {
          data.description ||= data.activity;
          data = workValues(data);
        }
        data = validateFields(modules[kind].fields, data);
        if (plan) {
          const old = plans.find(
            (r) =>
              r.ownerUid === data.ownerUid &&
              r.month === data.month &&
              workGroup(r.category) === data.category &&
              r.activity === data.activity &&
              (r.projectId || "") === data.projectId &&
              r.id !== record?.id,
          );
          if (old)
            throw new Error(
              "Plan za ovu aktivnost već postoji. Uredite postojeći plan.",
            );
        }
        await repository.save(kind, data, record?.id);
      });
    });
    document.getElementById("work-delete")?.addEventListener("click", () => {
      if (confirm("Arhivirati ovaj zapis?"))
        operation(() => repository.remove(kind, record.id));
    });
  }
  function importOriginal() {
    openDialog(
      "Uvoz mjesečne evidencije",
      `<section id="work-import"><p>Zaposlenik: <strong>${e(people.get(ownerUid))}</strong></p><label>Godina<input id="work-import-year" type="number" value="${anchor.slice(0, 4)}" min="2000" max="2100"></label><p>Listovi Siječanj–Prosinac, skupine u stupcu A, plan u B i dani od C nadalje. Uvoze se pojedinačne aktivnosti; zbrojevi, formule zbrojeva i oznake / se preskaču. Uvoz ne dodaje odmore u modul godišnjih odmora.</p><input id="work-import-file" type="file" accept=".xlsx"><p id="work-error" role="alert"></p><div id="work-import-preview"></div><button id="work-import-save" class="button primary" disabled>Uvezi potvrđene podatke</button></section>`,
    );
    const employee = person();
    let parsed;
    const save = document.getElementById("work-import-save");
    document
      .getElementById("work-import-file")
      .addEventListener("change", async (event) => {
        save.disabled = true;
        parsed = null;
        const rootImport = document.getElementById("work-import"),
          file = event.target.files[0];
        if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024)
            throw new Error("Datoteka smije imati najviše 10 MB.");
          const Excel = await excelLibrary(),
            book = new Excel.Workbook();
          await book.xlsx.load(await file.arrayBuffer());
          if (!isCurrent() || !rootImport.isConnected) return;
          parsed = parseWorkWorkbook(
            book,
            Number(document.getElementById("work-import-year").value),
            employee,
          );
          if (parsed.entries.length + parsed.plans.length > 2000)
            throw new Error("Najviše 2000 zapisa po uvozu.");
          parsed.errors = prepareWorkTableImport(parsed, entries, plans).errors;
          document.getElementById("work-import-preview").innerHTML =
            `<p>${parsed.entries.length} aktivnosti · ${parsed.plans.length} planova</p>${
              parsed.errors.length
                ? `<ul>${parsed.errors
                    .slice(0, 30)
                    .map((s) => `<li>${e(s)}</li>`)
                    .join("")}</ul>`
                : `<p>Postojeći zapisi istog uvoza ažuriraju se. Provjerite zaposlenika i godinu prije potvrde.</p><div class="table-scroll"><table><thead><tr><th>Datum / mjesec</th><th>Aktivnost</th><th>Sati</th></tr></thead><tbody>${[
                    ...parsed.entries,
                    ...parsed.plans,
                  ]
                    .slice(0, 15)
                    .map(
                      (r) =>
                        `<tr><td>${e(r.date || r.month)}</td><td>${e(r.activity)}</td><td>${r.hours ?? r.plannedHours}</td></tr>`,
                    )
                    .join("")}</tbody></table></div>`
            }`;
          save.disabled =
            parsed.errors.length > 0 ||
            (!parsed.entries.length && !parsed.plans.length);
        } catch (error) {
          if (rootImport.isConnected)
            document.getElementById("work-error").textContent =
              errorMessage(error);
        }
      });
    document
      .getElementById("work-import-year")
      .addEventListener("input", () => {
        parsed = null;
        save.disabled = true;
        document.getElementById("work-import-preview").textContent =
          "Ponovno odaberite datoteku za novu godinu.";
        document.getElementById("work-import-file").value = "";
      });
    save.addEventListener("click", () =>
      operation(async () => {
        if (!parsed || parsed.errors.length)
          throw new Error("Prvo provjerite datoteku.");
        const [freshEntries, freshPlans] = await Promise.all([
          repository.listAll("workEntries"),
          repository.listAll("workPlans"),
        ]);
        const checked = prepareWorkTableImport(
          parsed,
          freshEntries,
          freshPlans,
        );
        if (checked.errors.length) throw new Error(checked.errors.join(" "));
        const all = checked.actions;
        let completed = 0;
        for (const action of all) {
          const { kind, data: r } = action;
          if (!isCurrent()) return;
          const id =
            "work-import-" +
            (
              await digest(
                JSON.stringify([
                  kind,
                  r.ownerUid,
                  r.date || r.month,
                  r.category,
                  r.activity,
                  r.projectId || "",
                ]),
              )
            ).slice(0, 40);
          if (!action.skip)
            await repository.save(kind, r, action.id || id, { import: true });
          completed++;
          document.getElementById("work-import-preview").textContent =
            `Spremljeno ${completed} / ${all.length}. Ako prekinete, ponovni uvoz iste datoteke nastavlja bez dupliciranja.`;
        }
      }),
    );
  }
  function render() {
    if (!isCurrent()) return;
    const period = workPeriod(anchor, view),
      selected = periodRows(),
      total = selected.reduce((s, r) => s + Number(r.hours), 0);
    root.innerHTML = `<div class="page-heading"><h1>Evidencija rada</h1><div class="page-actions">${actionMenu("Dodaj", '<button id="work-add">Aktivnost</button><button id="work-plan">Mjesečni plan</button><button id="work-person">Zaposlenik u evidenciji</button><button id="work-original">Uvoz mjesečne tablice (.xlsx)</button><button id="work-standard">Standardni uvoz (.xlsx, .json, .csv)</button>', true)}${actionMenu("Izvoz", '<button id="work-xlsx">Godišnja tablica (.xlsx)</button><button id="work-csv">CSV tablica</button><button id="work-print">Ispis / PDF</button>')}<button class="button" id="work-refresh">Osvježi</button><details class="module-filters"><summary class="button">Filtri</summary><div class="filter-fields"><label>Zaposlenik<select id="work-owner">${[
      ...people,
    ]
      .sort((a, b) => a[1].localeCompare(b[1], "hr"))
      .map(
        ([id, name]) =>
          `<option value="${e(id)}" ${id === ownerUid ? "selected" : ""}>${e(name)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Pogled<select id="work-view"><option value="day" ${view === "day" ? "selected" : ""}>Dan</option><option value="week" ${view === "week" ? "selected" : ""}>Tjedan</option><option value="month" ${view === "month" ? "selected" : ""}>Mjesec</option></select></label><label>Datum<input id="work-date" type="date" value="${anchor}"></label></div></details></div></div><p id="work-message" role="alert"></p><section class="panel work-panel"><div class="work-period"><strong>${e(people.get(ownerUid))}</strong><span>${dateLabel(period.start)}${period.end !== period.start ? " – " + dateLabel(period.end) : ""}</span><div class="work-navigation"><button class="button" id="work-prev">← Prethodno</button><button class="button" id="work-today">Danas</button><button class="button" id="work-next">Sljedeće →</button></div></div><div class="work-summary"><span>Evidentirano <strong>${number(total)} h</strong></span><span>Aktivnosti <strong>${selected.length}</strong></span>${view === "month" ? `<span>Planirano <strong>${plans.some((r) => r.ownerUid === ownerUid && r.month === anchor.slice(0, 7)) ? number(monthRows().reduce((s, r) => s + (r.planned || 0), 0)) + " h" : "—"}</strong></span>` : ""}</div><div id="work-body"></div></section>`;
    if (view === "month") {
      const matrix = monthRows(),
        hasPlan = matrix.some((r) => r.planned !== null);
      $("work-body").innerHTML =
        `<div class="work-matrix-scroll"><table class="work-matrix"><thead><tr><th>Aktivnost / zadatak</th><th>Plan [h]</th>${period.days.map((d) => `<th class="${[0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "work-weekend" : ""}"><button data-work-day="${d}" title="${dateLabel(d)}">${Number(d.slice(-2))}</button></th>`).join("")}<th>Realizirano</th><th>Odstupanje</th></tr></thead><tbody>${categories
          .map((category) => {
            const list = matrix.filter((r) => r.category === category);
            return `<tr class="work-group"><th colspan="${period.days.length + 4}">${e(category)}</th></tr>${list.map((r) => `<tr><th><button data-work-plan="${matrix.indexOf(r)}">${e(r.activity)}${r.projectId ? `<small>${e(r.projectId)}</small>` : ""}</button></th><td>${number(r.planned)}</td>${period.days.map((d) => `<td class="${[0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "work-weekend" : ""}">${r.days[d] === undefined ? "" : number(r.days[d])}</td>`).join("")}<td>${number(r.actual)}</td><td>${r.planned === null ? "—" : number(r.planned - r.actual)}</td></tr>`).join("")}`;
          })
          .join(
            "",
          )}<tr class="work-total"><th>Ukupno</th><td>${hasPlan ? number(matrix.reduce((s, r) => s + (r.planned || 0), 0)) : "—"}</td>${period.days.map((d) => `<td>${number(matrix.reduce((s, r) => s + (r.days[d] || 0), 0))}</td>`).join("")}<td>${number(total)}</td><td>${hasPlan && matrix.every((r) => r.planned !== null) ? number(matrix.reduce((s, r) => s + r.planned - r.actual, 0)) : "—"}</td></tr></tbody></table></div><p class="muted">Odstupanje = planirano − realizirano. Crtica znači da plan nije unesen. Klik na dan otvara aktivnosti, a klik na aktivnost mjesečni plan.</p>`;
      root.querySelectorAll("[data-work-day]").forEach((b) =>
        b.addEventListener("click", () => {
          anchor = b.dataset.workDay;
          view = "day";
          render();
        }),
      );
      root.querySelectorAll("[data-work-plan]").forEach((b) =>
        b.addEventListener("click", () => {
          const r = matrix[Number(b.dataset.workPlan)],
            old = plans.find(
              (p) =>
                p.ownerUid === ownerUid &&
                p.month === anchor.slice(0, 7) &&
                workGroup(p.category) === r.category &&
                p.activity === r.activity &&
                (p.projectId || "") === r.projectId,
            );
          form(
            "workPlans",
            old || { ...person(), ...r, month: anchor.slice(0, 7) },
          );
        }),
      );
    } else {
      $("work-body").innerHTML = selected.length
        ? period.days
            .map((day) => {
              const list = selected.filter((r) => r.date === day);
              return `<section class="work-day"><h2>${dateLabel(day)} <small>${number(list.reduce((s, r) => s + Number(r.hours), 0))} h</small></h2>${list.length ? list.map((r) => `<button class="work-entry" data-work-entry="${e(r.id)}"><span class="work-entry-time">${r.startTime ? `${e(r.startTime)}–${e(r.endTime)}` : "Bez satnice"}<strong>${number(Number(r.hours))} h</strong></span><span><small>${e(workGroup(r.category))}${r.projectId ? " · " + e(r.projectId) : ""}</small><strong>${e(r.activity || r.description)}</strong>${r.activity && r.description !== r.activity ? `<span>${e(r.description)}</span>` : ""}</span></button>`).join("") : '<p class="muted">Nema evidentiranih aktivnosti.</p>'}</section>`;
            })
            .join("")
        : '<p class="panel-note">Nema evidentiranih aktivnosti za ovo razdoblje.</p>';
      root.querySelectorAll("[data-work-entry]").forEach((b) =>
        b.addEventListener("click", () =>
          form(
            "workEntries",
            entries.find((r) => r.id === b.dataset.workEntry),
          ),
        ),
      );
    }
    $("work-owner").addEventListener("change", (event) => {
      ownerUid = event.target.value;
      render();
    });
    $("work-view").addEventListener("change", (event) => {
      view = event.target.value;
      render();
    });
    $("work-date").addEventListener("change", (event) => {
      if (event.target.value) {
        anchor = event.target.value;
        render();
      }
    });
    for (const [id, delta] of [
      ["work-prev", -1],
      ["work-next", 1],
    ])
      $(id).addEventListener("click", () => {
        const date = new Date(anchor + "T12:00:00Z");
        if (view === "month") {
          date.setUTCDate(1);
          date.setUTCMonth(date.getUTCMonth() + delta);
        } else
          date.setUTCDate(
            date.getUTCDate() + delta * (view === "week" ? 7 : 1),
          );
        anchor = date.toISOString().slice(0, 10);
        render();
      });
    $("work-today").addEventListener("click", () => {
      anchor = zagrebDate();
      render();
    });
    $("work-add").addEventListener("click", () => form("workEntries"));
    $("work-plan").addEventListener("click", () => form("workPlans"));
    $("work-person").addEventListener("click", () => {
      openDialog(
        "Zaposlenik u evidenciji",
        '<form id="work-person-form"><label>Ime i prezime<input name="name" required maxlength="200"></label><p>Ovo dodaje osobu u evidenciju rada. Ne stvara korisnički račun.</p><p>Osoba ostaje na popisu nakon prvog spremljenog zapisa.</p><button class="button primary">Dodaj</button></form>',
      );
      document
        .getElementById("work-person-form")
        .addEventListener("submit", (event) => {
          event.preventDefault();
          const name = event.target.elements.name.value.trim();
          if (!name) return;
          const existing = [...people].find(
            ([, n]) =>
              n.toLocaleLowerCase("hr") === name.toLocaleLowerCase("hr"),
          );
          ownerUid = existing?.[0] || "staff:" + crypto.randomUUID();
          people.set(ownerUid, name);
          closeDialog();
          render();
        });
    });
    $("work-refresh").addEventListener("click", () =>
      load().catch((err) => {
        if (isCurrent()) $("work-message").textContent = errorMessage(err);
      }),
    );
    $("work-original").addEventListener("click", importOriginal);
    $("work-standard").addEventListener("click", () =>
      showExcelImport(context, "workEntries", load, person()),
    );
    $("work-xlsx").addEventListener("click", async () => {
      try {
        const Excel = await excelLibrary(),
          book = buildWorkWorkbook(Excel, {
            year: Number(anchor.slice(0, 4)),
            ...person(),
            entries,
            plans,
          });
        downloadFile(
          await book.xlsx.writeBuffer(),
          `Evidencija-${people.get(ownerUid).replace(/[^\p{L}\p{N}-]+/gu, "-")}-${anchor.slice(0, 4)}.xlsx`,
        );
      } catch (err) {
        if (isCurrent()) $("work-message").textContent = errorMessage(err);
      }
    });
    const columns = [
      { key: "date", label: "Datum" },
      { key: "activity", label: "Aktivnost" },
      { key: "category", label: "Skupina" },
      { key: "startTime", label: "Od" },
      { key: "endTime", label: "Do" },
      { key: "hours", label: "Sati" },
      { key: "projectId", label: "Projekt" },
      { key: "description", label: "Opis rada" },
    ];
    $("work-csv").addEventListener("click", () =>
      exportCSV("Evidencija-rada", columns, selected),
    );
    $("work-print").addEventListener("click", () => {
      try {
        printReport(
          "Evidencija rada",
          columns,
          selected,
          `${people.get(ownerUid)} · ${dateLabel(period.start)} – ${dateLabel(period.end)} · ${number(total)} h`,
        );
      } catch (err) {
        $("work-message").textContent = errorMessage(err);
      }
    });
  }
  await load();
}
