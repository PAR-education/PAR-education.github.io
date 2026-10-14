import { observeSession, logout } from "./auth/auth.js";
import { roles, canRead, canManage, staffRoles } from "./auth/permissions.js";
import { Records } from "./services/records.js";
import { modules, labelFor } from "./modules/catalog.js";
import {
  escapeHTML as e,
  display,
  errorMessage,
  theme,
  toggleTheme,
  pageURL,
} from "./utils/helpers.js";
import { validateFields } from "./utils/validation.js";
import {
  openDialog,
  closeDialog,
  setupDialog,
  renderField,
  detailsHTML,
} from "./components/dialog.js";
import { printReport, exportCSV } from "./components/export.js";
import { loadEvaluationTemplates } from "./data/evaluations.js";
import { tuitionInstallments } from "./utils/tuition.js";
import { icon, visualRecords } from "./modules/visuals.js";
import { importTemplate } from "./services/import-template.js";
import { mountControlPanel } from "./components/control-panel.js";
import { mountCalendarIntegration } from "./components/calendar-integration.js";
const $ = (id) => document.getElementById(id);
let context = null;
let version = 0;
let rows = [];
let shownRows = [];
let active = "dashboard";
let search = "";
let statusFilter = "";
let month = "";
let toastTimer;
theme();
document.addEventListener("click", async (event) => {
  if (event.target.id !== "confirm-import") return;
  const current = context;
  event.target.disabled = true;
  try {
    const count = await importTemplate(current.profile, current.user.uid);
    closeDialog();
    notify(count + " oglednih zapisa uvezeno.");
    if (current === context) await loadView("dashboard");
  } catch (error) {
    event.target.disabled = false;
    notify(errorMessage(error));
  }
});
$("global-search")?.addEventListener("input", (event) => {
  const value = event.target.value.trim().toLocaleLowerCase("hr");
  const results = $("global-results");
  results.hidden = !value;
  results.innerHTML =
    context && value
      ? Object.entries(modules)
          .filter(
            ([name, m]) =>
              canRead(context.profile.role, name) &&
              m.title.toLocaleLowerCase("hr").includes(value),
          )
          .map(
            ([name, m]) => `<a href="#${name}">${icon(name)} ${e(m.title)}</a>`,
          )
          .join("") || "<p>Nema rezultata</p>"
      : "";
});
$("global-results")?.addEventListener("click", () => {
  $("global-results").hidden = true;
  $("global-search").value = "";
});
setupDialog();
$("theme").addEventListener("click", toggleTheme);
function notify(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4500);
}
function mobileMenu(open) {
  $("sidebar").classList.toggle("open", open);
  const closedOnMobile = matchMedia("(max-width: 760px)").matches && !open;
  $("sidebar").inert = closedOnMobile;
  if (closedOnMobile) $("sidebar").setAttribute("aria-hidden", "true");
  else $("sidebar").removeAttribute("aria-hidden");
  $("sidebar-overlay").hidden = !open;
  $("menu").setAttribute("aria-expanded", String(open));
}
matchMedia("(max-width: 760px)").addEventListener("change", () =>
  mobileMenu(false),
);
mobileMenu(false);
$("menu").addEventListener("click", () =>
  mobileMenu(!$("sidebar").classList.contains("open")),
);
$("sidebar-overlay").addEventListener("click", () => mobileMenu(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") mobileMenu(false);
});
function heading(title, description, actions = "") {
  return `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function clearPrivateContent() {
  version++;
  context = null;
  rows = [];
  shownRows = [];
  $("app").hidden = true;
  $("content").replaceChildren();
  $("navigation").replaceChildren();
  $("account-name").textContent = "";
  $("account-role").textContent = "";
  closeDialog();
  $("toast").hidden = true;
  mobileMenu(false);
}
function route() {
  const key = location.hash.slice(1);
  return key === "help" ||
    key === "calendar-integration" ||
    (key === "control-panel" && context?.profile.role === "admin") ||
    key === "dashboard" ||
    (Object.hasOwn(modules, key) && canRead(context?.profile.role, key))
    ? key
    : "dashboard";
}
export async function startApplication(
  user,
  profile,
  repository = new Records(user, profile),
  demo = false,
) {
  version++;
  closeDialog();
  context = { user, profile, repository, demo };
  $("account-name").textContent = profile.name || user.email;
  $("account-role").textContent = roles[profile.role];
  $("account-avatar").textContent = (profile.name || user.email || "P")
    .charAt(0)
    .toUpperCase();
  $("mode-label").textContent = demo
    ? "Ogledni podaci"
    : ["localhost", "127.0.0.1"].includes(location.hostname) &&
        new URLSearchParams(location.search).get("emulator") === "1"
      ? "Lokalni emulator"
      : "Firestore";
  $("app").hidden = false;
  $("session-gate").hidden = true;
  drawNavigation();
  await loadView(route());
}
function drawNavigation() {
  const groups = [
    "Akademija",
    "Istraživanje i resursi",
    "Administracija",
    "Račun",
  ];
  let html = `<a class="nav-item ${active === "dashboard" ? "active" : ""}" href="#dashboard" ${active === "dashboard" ? 'aria-current="page"' : ""}><span class="nav-symbol">${icon("dashboard")}</span>Nadzorna ploča</a>`;
  for (const group of groups) {
    const allowed = Object.entries(modules).filter(
      ([name, module]) =>
        module.group === group && canRead(context.profile.role, name),
    );
    if (!allowed.length) continue;
    html +=
      `<p class="nav-group">${e(group)}</p>` +
      allowed
        .map(
          ([name, module]) =>
            `<a class="nav-item ${active === name ? "active" : ""}" href="#${name}" ${active === name ? 'aria-current="page"' : ""}><span class="nav-symbol">${icon(name)}</span>${e(module.title)}</a>`,
        )
        .join("");
  }
  html += `<a class="nav-item ${active === "calendar-integration" ? "active" : ""}" href="#calendar-integration"><span class="nav-symbol">${icon("calendar-days")}</span>Integracija kalendara</a>`;
  if (context.profile.role === "admin")
    html += `<a class="nav-item ${active === "control-panel" ? "active" : ""}" href="#control-panel"><span class="nav-symbol">${icon("sliders")}</span>Control panel i backup</a>`;
  html += `<a class="nav-item ${active === "help" ? "active" : ""}" href="#help"><span class="nav-symbol">${icon("help")}</span>Pomoć i integracije</a>`;
  $("navigation").innerHTML = html;
}
window.addEventListener("hashchange", () => {
  if (context) {
    mobileMenu(false);
    loadView(route());
  }
});
async function loadView(name) {
  if (!context) return;
  const current = context;
  const ticket = ++version;
  active = name;
  search = "";
  statusFilter = "";
  month = "";
  rows = [];
  shownRows = [];
  closeDialog();
  window.scrollTo(0, 0);
  drawNavigation();
  $("header-title").textContent =
    name === "dashboard"
      ? "Nadzorna ploča"
      : name === "help"
        ? "Pomoć"
        : name === "control-panel"
          ? "Control panel"
          : name === "calendar-integration"
            ? "Integracija kalendara"
            : modules[name].title;
  $("content").innerHTML =
    '<div class="loading" role="status">Učitavanje podataka…</div>';
  if (name === "help") {
    drawHelp();
    return;
  }
  if (name === "control-panel" || name === "calendar-integration") {
    const render =
      name === "control-panel" ? mountControlPanel : mountCalendarIntegration;
    render(
      $("content"),
      current,
      () => context === current && version === ticket,
    );
    return;
  }
  try {
    if (name === "dashboard") {
      await drawDashboard(ticket, current);
      return;
    }
    const result = await current.repository.list(name);
    if (
      name === "exams" &&
      ["admin", "profesor"].includes(current.profile.role)
    ) {
      const bookings = await current.repository.list("examBookings");
      for (const exam of result)
        if (!exam.enrolledStudents)
          exam.enrolledStudents = bookings
            .filter((b) => b.examId === exam.id && b.status === "Odobreno")
            .map((b) => ({ name: b.ownerName }));
    }
    if (ticket !== version || current !== context) return;
    rows = result;
    drawModule();
  } catch (error) {
    if (ticket !== version || current !== context) return;
    $("content").innerHTML =
      heading($("header-title").textContent, "Podaci nisu učitani.") +
      `<div class="notice error" role="alert">${e(errorMessage(error))}</div><button class="button" id="retry">Pokušaj ponovno</button>`;
    $("retry").addEventListener("click", () => loadView(active));
  }
}
async function drawDashboard(ticket, current) {
  const choices =
    current.profile.role === "student"
      ? ["enrollments", "grades", "requests", "finances"]
      : current.profile.role === "alumni"
        ? ["alumniEvents", "requests", "documents", "notifications"]
        : ["students", "employees", "projects", "vacations", "requests"].filter(
            (name) => canRead(current.profile.role, name),
          );
  const result = await Promise.allSettled(
    choices.map((name) => current.repository.list(name)),
  );
  const scheduleResult = await Promise.allSettled([
    current.repository.list("calendarEvents"),
    current.repository.list("notifications"),
  ]);
  if (ticket !== version || current !== context) return;
  const failures = result.filter((item) => item.status === "rejected");
  const stats = choices
    .map(
      (name, i) =>
        `<a href="#${name}" class="stat stat-${name}"><span class="stat-icon">${icon(name)}</span><p>${e(modules[name].title)}</p><strong>${result[i].status === "fulfilled" ? (["vacations", "requests"].includes(name) ? result[i].value.filter((r) => r.status === "Na čekanju").length : result[i].value.length) : "—"}</strong><small>${["vacations", "requests"].includes(name) ? "Zahtjeva na čekanju" : "U vašem opsegu pristupa"}</small></a>`,
    )
    .join("");
  const today = new Date().toLocaleDateString("sv-SE");
  const upcoming =
    scheduleResult[0].status === "fulfilled"
      ? scheduleResult[0].value
          .filter((row) => row.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5)
      : [];
  const notices =
    scheduleResult[1].status === "fulfilled"
      ? scheduleResult[1].value.slice(0, 3)
      : [];
  $("content").innerHTML =
    heading(
      "Nadzorna ploča",
      `Dobrodošli, ${current.profile.name || current.user.email}. ${new Date().toLocaleDateString("hr-HR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      `${current.profile.role === "admin" ? '<a class="button" href="#control-panel">Control panel i backup</a>' : ""}${current.profile.role === "admin" && !current.demo ? '<button id="import-template" class="button primary">Uvezi podatke predloška</button>' : ""}<button id="refresh" class="button">Osvježi podatke</button>`,
    ) +
    (failures.length
      ? `<div class="notice error">Neki podaci nisu dostupni. ${e(errorMessage(failures[0].reason))}</div>`
      : "") +
    `<section class="stats stats-${choices.length}" aria-label="Pregled podataka"><article class="security-card"><span>${icon("shield-halved")}</span><h2>Sigurnosni kontekst</h2><p>Pristup sustavu prema dodijeljenoj ulozi.</p><div><strong>${e(roles[current.profile.role])}</strong><small>Prijavljeni korisnik · Zaštićeni podaci</small></div></article>${stats}</section><div class="dashboard-grid"><section class="panel"><div class="panel-title"><h2>Radni prostor</h2><span class="pill">${e(roles[current.profile.role])}</span></div><div class="link-list">${Object.entries(
      modules,
    )
      .filter(
        ([name]) =>
          canRead(current.profile.role, name) && name !== "notifications",
      )
      .slice(0, 7)
      .map(
        ([name, module]) =>
          `<button data-nav="${name}">${e(module.title)}<span aria-hidden="true">→</span></button>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><div class="panel-title"><h2>Sljedeći događaji</h2><a href="#calendarEvents">Kalendar</a></div>${scheduleResult[0].status === "rejected" ? '<p class="panel-note">Kalendar nije dostupan.</p>' : upcoming.length ? `<div class="calendar-list">${upcoming.map((row) => `<div class="calendar-row"><div class="date-box">${e(row.date)}</div><div><h3>${e(row.title)}</h3><p>${e(row.time)} · ${e(row.room)}</p></div></div>`).join("")}</div>` : '<p class="panel-note">Nema nadolazećih događaja.</p>'}</section></div><section class="panel"><div class="panel-title"><h2>Obavijesti</h2><a href="#notifications">Sve obavijesti</a></div>${scheduleResult[1].status === "rejected" ? '<p class="panel-note">Obavijesti nisu dostupne.</p>' : notices.length ? `<div class="calendar-list">${notices.map((row) => `<div class="calendar-row"><div><h3>${e(row.title)}</h3><p>${e(row.message)}</p></div></div>`).join("")}</div>` : '<p class="panel-note">Trenutno nema novih obavijesti.</p>'}</section>`;
  $("import-template")?.addEventListener("click", () =>
    openDialog(
      "Uvoz izvornog predloška",
      '<p>Uvoz oglednih zapisa iz profesorova koda u prazne kolekcije. Postojeći zapisi i korisnički računi ostaju sačuvani. Ogledne financijske obveze nisu stvarni nalozi za uplatu.</p><p>Uvoze se studenti, zaposlenici, kolegiji, ispiti, projekti, ocjene, rasporedi i ostale evidencije. Zapisi imaju oznaku template- u ID-u.</p><button id="confirm-import" class="button primary">Uvezi ogledne podatke</button>',
    ),
  );
  $("refresh").addEventListener("click", () => loadView("dashboard"));
  $("content")
    .querySelectorAll("[data-nav]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        location.hash = button.dataset.nav;
      }),
    );
}
function canCreate(name) {
  const role = context.profile.role;
  if (["enrollments", "examBookings", "labBookings"].includes(name))
    return false;
  return (
    canManage(role, name) ||
    ["requests", "evaluations"].includes(name) ||
    (staffRoles.includes(role) &&
      ["workEntries", "vacations", "research"].includes(name))
  );
}
function canEdit(name, record) {
  if (["enrollments", "examBookings", "labBookings"].includes(name))
    return false;
  if (["evaluations"].includes(name)) return false;
  return (
    canManage(context.profile.role, name) ||
    (["workEntries", "research"].includes(name) &&
      record.ownerUid === context.user.uid)
  );
}
function drawModule() {
  const config = modules[active];
  const statusField = config.fields.find((field) => field.key === "status");
  const filters =
    active === "users"
      ? '<label>Pristup <select id="status-filter"><option value="">Svi računi</option><option value="pending">Neaktivni / čeka odobrenje</option><option value="active">Aktivni</option></select></label>'
      : statusField
        ? `<label>Status <select id="status-filter"><option value="">Svi statusi</option>${statusField.options.map((option) => `<option value="${e(option)}">${e(option)}</option>`).join("")}</select></label>`
        : "";
  const monthly =
    active === "workEntries"
      ? '<label class="month-filter">Mjesec <input type="month" id="month-filter"></label>'
      : "";
  $("content").innerHTML =
    heading(
      config.title,
      config.description,
      `${canCreate(active) ? '<button id="create" class="button primary">+ Novi zapis</button>' : ""}<button id="refresh" class="button">Osvježi</button><button id="print" class="button">Ispis / PDF</button><button id="csv" class="button">CSV</button>`,
    ) +
    `<section class="panel"><div class="toolbar"><label for="search">Pretraživanje <input class="search" id="search" type="search" placeholder="Pretraži zapise…" autocomplete="off"></label>${filters}${monthly}</div><div id="table-area"></div><div class="table-footer" id="record-count"></div></section>`;
  $("create")?.addEventListener("click", () => showForm(active));
  $("refresh").addEventListener("click", () => loadView(active));
  $("search").addEventListener("input", (event) => {
    search = event.target.value.toLocaleLowerCase("hr");
    drawTable();
  });
  $("status-filter")?.addEventListener("change", (event) => {
    statusFilter = event.target.value;
    drawTable();
  });
  $("month-filter")?.addEventListener("change", (event) => {
    month = event.target.value;
    drawTable();
  });
  $("print").addEventListener("click", () => {
    try {
      const total =
        active === "workEntries"
          ? `Ukupno ${shownRows.reduce((sum, row) => sum + Number(row.hours || 0), 0)} sati · ${month || "Svi mjeseci"}`
          : `${shownRows.length} zapisa`;
      printReport(
        config.title,
        config.columns.map((key) => ({ key, label: labelFor(active, key) })),
        shownRows,
        total,
      );
    } catch (error) {
      notify(errorMessage(error));
    }
  });
  $("csv").addEventListener("click", () =>
    exportCSV(
      active,
      config.columns.map((key) => ({ key, label: labelFor(active, key) })),
      shownRows,
    ),
  );
  drawTable();
}
function badge(value) {
  const type = [
    "Odobreno",
    "Riješeno",
    "Plaćeno",
    "Dostupno",
    "Objavljeno",
  ].includes(value)
    ? "good"
    : ["Odbijeno", "Dugovanje", "Servis", "Bolovanje"].includes(value)
      ? "bad"
      : ["Na čekanju", "U obradi", "Godišnji odmor"].includes(value)
        ? "pending"
        : value === "Ured"
          ? "office"
          : value === "Nastava"
            ? "teaching"
            : "";
  return `<span class="badge ${type}">${e(value)}</span>`;
}
function drawTable() {
  const config = modules[active];
  shownRows = rows.filter(
    (row) =>
      (!statusFilter ||
        (active === "users"
          ? statusFilter === "active"
            ? row.active === true
            : row.active !== true
          : row.status === statusFilter)) &&
      (!month || row.date?.startsWith(month)) &&
      (!search ||
        config.fields.some((field) =>
          display(row[field.key]).toLocaleLowerCase("hr").includes(search),
        )),
  );
  if (!context.demo)
    shownRows.sort((a, b) =>
      String(a.date || a.name || a.title || "").localeCompare(
        String(b.date || b.name || b.title || ""),
        "hr",
      ),
    );
  const visual = shownRows.length
    ? visualRecords(active, shownRows, badge)
    : null;
  if (!shownRows.length)
    $("table-area").innerHTML =
      `<div class="empty"><h2>${rows.length ? "Nema rezultata" : "Još nema zapisa"}</h2><p>${rows.length ? "Pokušajte s drugim pojmom ili filtrom." : canCreate(active) ? "Dodajte prvi zapis. Podaci se spremaju tek nakon potvrde baze." : "Zapisi će se prikazati kada ih administrator ili nadležna služba doda."}</p></div>`;
  else if (visual) $("table-area").innerHTML = visual;
  else
    $("table-area").innerHTML =
      `<div class="table-scroll"><table><caption class="sr-only">${e(config.title)}</caption><thead><tr>${config.columns.map((key) => `<th scope="col">${e(labelFor(active, key))}</th>`).join("")}<th scope="col">Detalji</th></tr></thead><tbody>${shownRows.map((row, i) => `<tr>${config.columns.map((key) => `<td>${key === "status" ? badge(row[key]) : e(display(row[key]))}</td>`).join("")}<td><button class="button table-action" data-row="${i}" aria-label="Detalji: ${e(row.name || row.title || row.ownerName || config.title)}">Otvori →</button></td></tr>`).join("")}</tbody></table></div>`;
  $("record-count").textContent =
    `${shownRows.length} od ${rows.length} učitanih zapisa${rows.length === 250 ? " · Dosegnut limit 250. Za veće baze potrebna je paginacija." : ""}${active === "workEntries" ? ` · Ukupno ${shownRows.reduce((sum, row) => sum + Number(row.hours || 0), 0)} sati` : ""}`;
  $("table-area")
    .querySelectorAll("[data-row]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showDetails(active, shownRows[Number(button.dataset.row)]),
      ),
    );
}
function showDetails(name, record) {
  const role = context.profile.role;
  const canDecide =
    role === "admin" ||
    (role === "profesor" && ["enrollments", "examBookings"].includes(name)) ||
    (role === "lab_assistant" && name === "labBookings");
  const bookingTarget =
    name === "courses"
      ? "enrollments"
      : name === "exams"
        ? "examBookings"
        : name === "labs"
          ? "labBookings"
          : null;
  openDialog(
    record.name || record.title || modules[name].title,
    detailsHTML(modules[name].fields, record) +
      `<p class="muted">ID: ${e(record.id)}</p><div class="detail-actions">${canEdit(name, record) ? '<button id="edit-record" class="button primary">Uredi</button>' : ""}<button id="print-record" class="button">Ispis / PDF</button>${record.url && /^https:\/\//i.test(record.url) ? `<a class="button" href="${e(record.url)}" target="_blank" rel="noopener noreferrer">Otvori dokument ↗</a>` : ""}${role === "student" && bookingTarget ? '<button id="book-record" class="button primary">Pošalji prijavu</button>' : ""}${canDecide && record.status === "Na čekanju" && ["vacations", "enrollments", "examBookings", "labBookings"].includes(name) ? '<button id="approve" class="button primary">Odobri</button><button id="reject" class="button">Odbij</button>' : ""}${canManage(role, name) && !["users", "evaluations"].includes(name) ? '<button id="delete-record" class="button danger">Izbriši</button>' : ""}</div><div id="detail-error" role="alert"></div>`,
  );
  $("edit-record")?.addEventListener("click", () => {
    closeDialog();
    showForm(name, record);
  });
  if (role === "admin" && name === "students") {
    const button = document.createElement("button");
    button.className = "button";
    button.textContent = "Školarina";
    button.addEventListener("click", () => showTuition(record));
    $("dialog-body").querySelector(".detail-actions").append(button);
  }
  if (role === "admin" && name === "users" && record.active !== true) {
    const button = document.createElement("button");
    button.className = "button primary";
    button.textContent = "Odaberi ulogu i odobri";
    button.addEventListener("click", () => {
      closeDialog();
      showForm(name, { ...record, active: true });
    });
    $("dialog-body").querySelector(".detail-actions").append(button);
  }
  $("print-record").addEventListener("click", () => {
    try {
      printReport(
        modules[name].title,
        modules[name].fields.map((field) => ({
          key: field.key,
          label: field.label,
        })),
        [record],
        `ID: ${record.id}`,
      );
    } catch (error) {
      $("detail-error").textContent = errorMessage(error);
    }
  });
  $("book-record")?.addEventListener("click", (event) =>
    mutate(
      event.currentTarget,
      () => context.repository.requestBooking(bookingTarget, record),
      "Prijava spremljena. Čeka potvrdu nadležne osobe.",
    ),
  );
  $("approve")?.addEventListener("click", (event) =>
    mutate(
      event.currentTarget,
      () => context.repository.decide(name, record.id, "Odobreno"),
      "Odluka spremljena.",
    ),
  );
  $("reject")?.addEventListener("click", (event) =>
    mutate(
      event.currentTarget,
      () => context.repository.decide(name, record.id, "Odbijeno"),
      "Odluka spremljena.",
    ),
  );
  $("delete-record")?.addEventListener("click", () => {
    openDialog(
      "Izbrisati zapis?",
      `<p>Ovaj zapis bit će trajno izbrisan iz baze. ID: ${e(record.id)}</p><div class="form-actions"><button id="cancel-delete" class="button">Odustani</button><button id="confirm-delete" class="button danger">Izbriši zapis</button></div><div id="detail-error" role="alert"></div>`,
    );
    $("cancel-delete").addEventListener("click", closeDialog);
    $("confirm-delete").addEventListener("click", (event) =>
      mutate(
        event.currentTarget,
        () => context.repository.remove(name, record.id),
        "Zapis izbrisan.",
      ),
    );
  });
}
function showTuition(student) {
  const current = context;
  openDialog(
    `Školarina · ${student.name}`,
    `<p class="muted">Izračunajte obveze za jednu akademsku godinu. Postojeće obveze ne prepisuju se. Ovo ne izvršava naplatu.</p><form id="tuition-form"><div class="form-grid">${renderField({ key: "base", label: "Osnovica (€)", type: "number", required: true, min: 0, max: 1000000 }, 3500)}${renderField({ key: "discount", label: "Popust (%)", type: "number", required: true, min: 0, max: 100 }, 0)}${renderField({ key: "count", label: "Broj rata", required: true, options: ["1", "2", "10"] }, "2")}${renderField({ key: "dueDate", label: "Dospijeće prve rate", type: "date", required: true }, new Date().toLocaleDateString("sv-SE"))}${renderField({ key: "year", label: "Početna akademska godina", required: true }, String(new Date().getFullYear()))}</div><div id="tuition-preview" class="notice"></div><div id="form-error" role="alert"></div><div class="form-actions"><button type="button" id="cancel-tuition" class="button">Odustani</button><button type="submit" class="button primary">Izradi obveze</button></div></form>`,
  );
  const form = $("tuition-form");
  const plan = () =>
    tuitionInstallments(
      Number(form.elements.base.value),
      Number(form.elements.discount.value),
      Number(form.elements.count.value),
      form.elements.dueDate.value,
    );
  const preview = () => {
    try {
      const entries = plan();
      $("tuition-preview").textContent =
        `Ukupno: ${entries.reduce((sum, row) => sum + row.amount, 0).toFixed(2)} € · ${entries.map((row, i) => `${i + 1}. rata ${row.amount.toFixed(2)} € (${row.dueDate})`).join(" · ")}`;
    } catch (error) {
      $("tuition-preview").textContent = errorMessage(error);
    }
  };
  form.addEventListener("input", preview);
  preview();
  $("cancel-tuition").addEventListener("click", closeDialog);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    try {
      plan();
      await current.repository.createTuition(
        student.id,
        Number(form.elements.base.value),
        Number(form.elements.discount.value),
        Number(form.elements.count.value),
        form.elements.dueDate.value,
        form.elements.year.value,
      );
      if (context !== current) return;
      closeDialog();
      notify(
        current.demo
          ? "Ogledne obveze izrađene. Firebase nije promijenjen."
          : "Obveze školarine spremljene u Financije.",
      );
    } catch (error) {
      if (context === current && $("form-error")) {
        $("form-error").textContent = errorMessage(error);
        $("form-error").className = "notice error";
      }
    } finally {
      button.disabled = false;
    }
  });
}
async function mutate(button, operation, message) {
  const original = context;
  button.disabled = true;
  try {
    await operation();
    if (context !== original) return;
    closeDialog();
    notify(message);
    await loadView(active);
  } catch (error) {
    if (context === original && $("detail-error")) {
      $("detail-error").textContent = errorMessage(error);
      $("detail-error").className = "notice error";
    }
  } finally {
    button.disabled = false;
  }
}
function showForm(name, record = {}) {
  const role = context.profile.role;
  const mine =
    !canManage(role, name) ||
    (name === "research" && role !== "admin") ||
    name === "evaluations";
  const defaults = { ...record };
  if (mine)
    Object.assign(defaults, {
      ownerUid: context.user.uid,
      ownerName: context.profile.name,
      status: record.status || "Na čekanju",
    });
  if (
    (name === "grades" && role === "profesor") ||
    (name === "exams" && role === "profesor")
  )
    defaults.instructorUid = context.user.uid;
  if (name === "users" && !record.id) defaults.active = true;
  const readonly = (field) =>
    (mine &&
      ["ownerUid", "ownerName", "status", "response"].includes(field.key)) ||
    (role === "profesor" && field.key === "instructorUid");
  const questions =
    name === "evaluations"
      ? '<div class="evaluation-questions"><div class="field"><label for="eval-template">Predložak upitnika</label><select id="eval-template"><option value="">Opći osvrt</option></select></div><strong>Pitanja za osvrt</strong><ol id="eval-questions"><li>Jesu li upute i materijali jasni?</li><li>Koliko je jednostavno obaviti zadatak?</li><li>Je li podrška pravodobna i korisna?</li><li>Što biste poboljšali?</li></ol><p class="muted">Pitanja iz izvornog prototipa uključuju procjenu budućih integracija.</p></div>'
      : "";
  openDialog(
    `${record.id ? "Uredi" : "Novi zapis"} · ${modules[name].title}`,
    `${questions}<form id="record-form"><div class="form-grid">${name === "users" && !record.id ? renderField({ key: "uid", label: "Firebase Authentication UID", required: true }, "") : ""}${modules[
      name
    ].fields
      .filter(
        (field) =>
          !(mine && ["ownerUid", "ownerName", "response"].includes(field.key)),
      )
      .map((field) => renderField(field, defaults[field.key], readonly(field)))
      .join(
        "",
      )}</div><div id="form-error" role="alert"></div><div class="form-actions"><button id="cancel-form" type="button" class="button">Odustani</button><button type="submit" class="button primary">Spremi zapis</button></div></form>`,
  );
  $("cancel-form").addEventListener("click", closeDialog);
  const current = context;
  const form = $("record-form");
  if (name === "evaluations")
    loadEvaluationTemplates()
      .then((templates) => {
        if (context !== current || $("record-form") !== form) return;
        const selector = $("eval-template");
        templates.forEach((template) => {
          const option = document.createElement("option");
          option.value = template.id;
          option.textContent = template.department;
          selector.append(option);
        });
        selector.addEventListener("change", () => {
          const template = templates.find((item) => item.id === selector.value);
          if (!template) return;
          $("eval-questions").innerHTML = template.questions
            .map((question) => `<li>${e(question)}</li>`)
            .join("");
          form.elements.subject.value = template.department;
          // Do not overwrite answers once the user has started typing.
          if (!form.elements.answers.value.trim())
            form.elements.answers.value = template.questions
              .map((question, i) => `${i + 1}. ${question}\nOdgovor: \n`)
              .join("\n");
        });
      })
      .catch((error) => {
        if ($("record-form") === form) {
          $("form-error").textContent = errorMessage(error);
        }
      });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[type=submit]");
    if (submit.disabled || !form.reportValidity()) return;
    submit.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      for (const field of modules[name].fields) {
        if (readonly(field)) values[field.key] = defaults[field.key];
        if (field.type === "checkbox")
          values[field.key] = form.elements[field.key].checked;
      }
      const id =
        name === "users"
          ? record.id || String(values.uid || "").trim()
          : record.id;
      if (name === "users" && (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)))
        throw new Error("Unesite ispravan Firebase UID.");
      if (
        name === "users" &&
        id === current.user.uid &&
        (values.role !== "admin" || !values.active)
      )
        throw new Error(
          "Vlastiti administratorski račun ne možete deaktivirati ili promijeniti mu ulogu.",
        );
      const data = validateFields(modules[name].fields, values);
      await current.repository.save(name, data, id);
      if (context !== current) return;
      closeDialog();
      notify(
        current.demo
          ? "Spremljeno u oglednoj sesiji. Baza nije promijenjena."
          : "Zapis je spremljen u bazu.",
      );
      await loadView(active);
    } catch (error) {
      if (context === current && $("form-error")) {
        $("form-error").textContent = errorMessage(error);
        $("form-error").className = "notice error";
      }
    } finally {
      submit.disabled = false;
    }
  });
}
function drawHelp() {
  $("content").innerHTML =
    heading(
      "Pomoć i integracije",
      "Informacije o pristupu, evidencijama i dostupnim uslugama.",
    ) +
    '<section class="panel"><div class="panel-title"><h2>Pristup sustavu</h2></div><div class="panel-note"><p>Ulogu dodjeljuje administrator. Ako ne vidite potreban modul, obratite se nadležnoj službi. Odjavite se nakon rada na zajedničkom računalu.</p><p>Zapisi se spremaju u Cloud Firestore. Pogreška baze prikazuje se na zaslonu; ogledni podaci ne zamjenjuju produkcijske zapise.</p></div></section>' +
    '<section class="panel"><div class="panel-title"><h2>Status integracija</h2></div><div class="panel-note"><p><strong>ISVU:</strong> ocjene su lokalna evidencija. Slanje Ministarstvu zahtijeva službeni API i zaštićenu poslužiteljsku integraciju.</p><p><strong>AI asistent:</strong> nije povezan. Za AI odgovore potreban je poslužitelj i ugovorena API usluga. U ovoj verziji nema simuliranih odgovora.</p><p><strong>PDF:</strong> otvorite ispis i odaberite „Spremi kao PDF”. Studentske potvrde trebaju odobrenje referade; ispis iz aplikacije nije službena potvrda.</p><p><strong>Plaćanja:</strong> financijski modul evidentira obveze. Ne izvršava bankovne transakcije niti generira neprovjeren barkod.</p><p><strong>Dokumenti:</strong> poveznice trebaju imati vlastitu kontrolu pristupa ako dokument nije javno objavljen. Privatna pohrana datoteka još nije povezana.</p></div></section>';
}
$("logout").addEventListener("click", async () => {
  if (context?.demo) {
    location.assign(pageURL("./index.html"));
    return;
  }
  $("logout").disabled = true;
  try {
    await logout();
    clearPrivateContent();
    location.replace(pageURL("./index.html"));
  } catch (error) {
    notify(errorMessage(error));
  } finally {
    $("logout").disabled = false;
  }
});
// The public static shell contains no records. Data is loaded only after an active profile is confirmed.
if (document.body.dataset.mode !== "demo") {
  observeSession(
    (session) => {
      if (session.loading) {
        clearPrivateContent();
        $("session-gate").hidden = false;
        $("session-gate").textContent = "Provjera dodijeljene uloge…";
        return;
      }
      if (!session.user || !session.profile) {
        clearPrivateContent();
        location.replace(pageURL("./index.html"));
        return;
      }
      // Backup restores may refresh profile metadata without changing access.
      // Keep an in-progress operation mounted when the user's permissions are unchanged.
      if (
        context &&
        !context.demo &&
        context.user.uid === session.user.uid &&
        ["role", "active", "departmentId"].every(
          (key) => context.profile[key] === session.profile[key],
        )
      ) {
        context.profile = session.profile;
        context.user = session.user;
        context.repository.profile = session.profile;
        context.repository.user = session.user;
        $("account-name").textContent =
          session.profile.name || session.user.email;
        $("account-avatar").textContent = (
          session.profile.name ||
          session.user.email ||
          "P"
        )
          .charAt(0)
          .toUpperCase();
        return;
      }
      startApplication(session.user, session.profile);
    },
    (error) => {
      clearPrivateContent();
      $("session-gate").hidden = false;
      $("session-gate").innerHTML =
        `<div class="notice error" role="alert">${e(errorMessage(error))}</div><a href="./index.html">Povratak na prijavu</a>`;
    },
  ).catch((error) => {
    clearPrivateContent();
    $("session-gate").hidden = false;
    $("session-gate").innerHTML =
      `<div class="notice error" role="alert">${e(errorMessage(error))}</div><a href="./index.html">Povratak na prijavu</a>`;
  });
}
