import { mountMiniCalendar } from "./components/mini-calendar.js";
import { mountCourseCalendar } from "./components/course-calendar.js";
import { showAnnouncement } from "./components/announcement.js";
import { canSendAnnouncement } from "./utils/notices.js";
import {
  actionMenu,
  setupActionMenus,
  groupRecordFields,
} from "./components/ui-controls.js";
import { revisionOf } from "./utils/schedule.js";
import { planSeries } from "./services/calendar-series.js";
import { setupLanguage } from "./utils/language.js";
import { mountHistory } from "./components/history.js";
import { mountAttendance } from "./components/attendance.js";
import { setupTimeInputs } from "./components/time-input.js";
import { mountDataQuality } from "./components/data-quality.js";
import { dashboardModel } from "./services/dashboard.js";
import { mountRecordSelectors } from "./components/record-selectors.js";
import { isInstructor } from "./utils/instructors.js";
import { roleNavigation, navigationLabel } from "./auth/navigation.js";
import { linkStudentAccount } from "./services/student-link.js";
import { observeSession, logout } from "./auth/auth.js";
import {
  roles,
  canRead,
  canManage,
  canAdd,
  canDelete,
  staffRoles,
  canEditCalendar,
  canImport,
} from "./auth/permissions.js";
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
import { showExcelImport } from "./components/excel-import.js";
import { mountCalendarView } from "./components/calendar-view.js";
import { mountControlPanel } from "./components/control-panel.js";
import { mountCalendarIntegration } from "./components/calendar-integration.js";
import { mountSlotFinder } from "./components/slot-finder.js";
import {
  canUseDemo,
  createAdminDemo,
  createRolePreview,
} from "./services/admin-demo.js";
import { mountTemplateCleanup } from "./components/template-cleanup.js";
const $ = (id) => document.getElementById(id);
let calendarAnchor = "";
let context = null;
let authenticatedSession = null;
let version = 0;
let rows = [];
let shownRows = [];
let attendanceEvent = "";
let exportRows = [];
let page = 1;
let active = "dashboard";
let search = "";
let statusFilter = "";
let month = "";
let toastTimer;
theme();
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
  return `<div class="page-heading"><div><h1>${e(title)}</h1>${description ? `<p>${e(description)}</p>` : ""}</div><div class="page-actions">${actions}</div></div>`;
}
function clearPrivateContent() {
  calendarAnchor = "";
  version++;
  context = null;
  authenticatedSession = null;
  document.getElementById("demo-role-tools")?.remove();
  document.getElementById("private-demo-banner")?.remove();
  document.getElementById("demo-toggle")?.remove();
  document.body.classList.remove("is-private-demo");
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
    (["control-panel", "template-cleanup", "data-quality", "history"].includes(
      key,
    ) &&
      context?.profile.role === "admin") ||
    key === "dashboard" ||
    (Object.hasOwn(modules, key) && canRead(context?.profile.role, key))
    ? key
    : "dashboard";
}
async function startApplication(
  user,
  profile,
  repository = new Records(user, profile),
  demo = false,
) {
  if (
    demo &&
    (!canUseDemo(authenticatedSession?.user, authenticatedSession?.profile) ||
      repository.previewOwnerUid !== authenticatedSession.user.uid)
  )
    throw new Error("Demo je dostupan samo administratoru.");
  version++;
  closeDialog();
  context = {
    user,
    profile,
    repository,
    demo,
    realAdminUid: demo ? authenticatedSession.user.uid : null,
  };
  document.getElementById("demo-role-tools")?.remove();
  document.getElementById("private-demo-banner")?.remove();
  document.body.classList.toggle("is-private-demo", demo);
  let toggle = document.getElementById("demo-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.id = "demo-toggle";
    toggle.className = "button";
    toggle.addEventListener("click", toggleDemo);
    document.querySelector(".header-actions").prepend(toggle);
  }
  toggle.hidden = !canUseDemo(
    authenticatedSession?.user,
    authenticatedSession?.profile,
  );
  toggle.textContent = demo ? "Izađi iz demo načina" : "Uključi demo";
  toggle.setAttribute("aria-pressed", String(demo));
  if (demo) {
    const banner = document.createElement("div");
    banner.id = "private-demo-banner";
    banner.className = "private-demo-banner";
    banner.setAttribute("role", "status");
    banner.textContent =
      "DEMO — samo vaša sesija. Promjene se ne spremaju u bazu. Osvježavanje ili izlazak odbacuje ogledne promjene.";
    banner.textContent = "PRIVATNI DEMO · Promjene su lokalne.";
    const tools = document.createElement("div");
    tools.id = "demo-role-tools";
    tools.className = "demo-role-tools";
    tools.innerHTML = `<label>Pregled kao uloga<select id="demo-role">${Object.entries(
      roles,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${profile.role === key ? "selected" : ""}>${e(label)}</option>`,
      )
      .join(
        "",
      )}</select></label><button class="button" id="demo-reset">Resetiraj demo</button>`;
    banner.append(tools);
    tools
      .querySelector("#demo-role")
      .addEventListener("change", async (event) => {
        const real = authenticatedSession,
          before = context;
        try {
          const state = createRolePreview(
            real.user,
            real.profile,
            before,
            event.target.value,
          );
          await startApplication(
            state.user,
            state.profile,
            state.repository,
            true,
          );
        } catch (error) {
          notify(errorMessage(error));
        }
      });
    tools.querySelector("#demo-reset").addEventListener("click", async () => {
      const real = authenticatedSession,
        role = context.profile.role,
        before = context;
      try {
        const initial = await createAdminDemo(real.user, real.profile);
        if (context !== before) return;
        const state = createRolePreview(real.user, real.profile, initial, role);
        await startApplication(
          state.user,
          state.profile,
          state.repository,
          true,
        );
      } catch (error) {
        notify(errorMessage(error));
      }
    });
    document.querySelector(".workspace").prepend(banner);
  }
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
async function toggleDemo() {
  const before = context,
    real = authenticatedSession,
    button = $("demo-toggle");
  if (!before || !canUseDemo(real?.user, real?.profile)) return;
  button.disabled = true;
  try {
    if (before.demo) await startApplication(real.user, real.profile);
    else {
      const state = await createAdminDemo(real.user, real.profile);
      if (
        context !== before ||
        !canUseDemo(
          authenticatedSession?.user,
          authenticatedSession?.profile,
        ) ||
        authenticatedSession.user.uid !== real.user.uid
      )
        return;
      await startApplication(state.user, state.profile, state.repository, true);
    }
  } catch (error) {
    notify(errorMessage(error));
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}
function drawNavigation() {
  const moreOpen = $("navigation").querySelector("#navigation-more")?.open;
  const role = context.profile.role;
  const navigation = roleNavigation(role);
  const link = (name) =>
    `<a class="nav-item ${active === name ? "active" : ""}" href="#${name}" ${active === name ? 'aria-current="page"' : ""}><span class="nav-symbol">${icon(name)}</span>${e(navigationLabel(role, name))}</a>`;
  const groups = [
    "Akademija",
    "Istraživanje i resursi",
    "Administracija",
    "Račun",
  ];
  let html = `<a class="nav-item ${active === "dashboard" ? "active" : ""}" href="#dashboard" ${active === "dashboard" ? 'aria-current="page"' : ""}><span class="nav-symbol">${icon("dashboard")}</span>${e(navigationLabel(role, "dashboard"))}</a>`;
  if (role !== "admin") {
    html += navigation.primary.map(link).join("");
    html += `<details id="navigation-more" ${moreOpen || navigation.more.includes(active) || ["help", "calendar-integration"].includes(active) ? "open" : ""}><summary class="nav-item">Više</summary>${navigation.more.map(link).join("")}`;
  }
  if (role === "admin")
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
  if (context.profile.role === "admin")
    html += `<a class="nav-item ${active === "history" ? "active" : ""}" href="#history"><span class="nav-symbol">${icon("clock-rotate-left")}</span>Povijest i arhiva</a>`;
  if (context.profile.role === "admin")
    html += `<a class="nav-item ${active === "data-quality" ? "active" : ""}" href="#data-quality"><span class="nav-symbol">${icon("list-check")}</span>Kvaliteta podataka</a>`;
  if (context.profile.role === "admin" && !context.demo)
    html +=
      '<a class="nav-item" href="#template-cleanup"><span class="nav-symbol">' +
      icon("database") +
      "</span>Priprema baze / ogledni podaci</a>";
  html += `<a class="nav-item ${active === "help" ? "active" : ""}" href="#help"><span class="nav-symbol">${icon("help")}</span>Pomoć i integracije</a>`;
  if (role !== "admin") html += "</details>";
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
  page = 1;
  search = "";
  statusFilter = "";
  month = "";
  rows = [];
  shownRows = [];
  closeDialog();
  window.scrollTo(0, 0);
  drawNavigation();
  $("header-title").textContent =
    {
      help: "Pomoć",
      "template-cleanup": "Priprema baze",
      "control-panel": "Control panel",
      "calendar-integration": "Integracija kalendara",
      history: "Povijest i arhiva",
      "data-quality": "Kvaliteta podataka",
    }[name] || navigationLabel(current.profile.role, name);
  $("content").innerHTML =
    '<div class="loading" role="status">Učitavanje podataka…</div>';
  if (name === "help") {
    drawHelp();
    return;
  }
  if (
    ["control-panel", "calendar-integration", "template-cleanup"].includes(name)
  ) {
    const render =
      name === "template-cleanup"
        ? mountTemplateCleanup
        : name === "control-panel"
          ? mountControlPanel
          : mountCalendarIntegration;
    render(
      $("content"),
      current,
      () => context === current && version === ticket,
    );
    return;
  }
  try {
    if (name === "history") {
      await mountHistory(
        $("content"),
        current,
        () => context === current && version === ticket,
      );
      return;
    }
    if (name === "attendance") {
      const eventId = attendanceEvent;
      attendanceEvent = "";
      await mountAttendance(
        $("content"),
        current,
        () => context === current && version === ticket,
        eventId,
      );
      return;
    }
    if (name === "data-quality") {
      await mountDataQuality(
        $("content"),
        current,
        () => context === current && version === ticket,
        async (issue) => {
          await loadView(issue.module);
          if (context === current) showDetails(issue.module, issue.row);
        },
      );
      return;
    }
    if (name === "dashboard") {
      await drawDashboard(ticket, current);
      return;
    }
    const result =
      ["calendarEvents", "enrollments"].includes(name) &&
      current.repository.listAll
        ? await current.repository.listAll(name)
        : await current.repository.list(name);
    if (name === "courses" && current.profile.role === "profesor") {
      result.splice(
        0,
        result.length,
        ...result.filter((c) => isInstructor(c, current.user.uid)),
      );
    }
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
  const model = await dashboardModel(current);
  if (ticket !== version || current !== context) return;
  const { notices } = model,
    choices = model.stats,
    failures = model.failures.map((reason) => ({ reason }));
  const stats = model.stats
    .map(
      (stat) =>
        `<a href="#${stat.name}" class="stat stat-${stat.name}"><span class="stat-icon">${icon(stat.name)}</span><p>${e(modules[stat.name]?.title === stat.label ? stat.label : modules[stat.label]?.title || stat.label)}</p><strong>${e(stat.value)}</strong><small>${e(stat.detail)}</small></a>`,
    )
    .join("");
  $("content").innerHTML =
    heading(
      navigationLabel(current.profile.role, "dashboard"),
      `Dobrodošli, ${current.profile.name || current.user.email}. ${new Date().toLocaleDateString("hr-HR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      `${current.profile.role === "admin" ? '<a class="button" href="#control-panel">Control panel i backup</a>' : ""}<button id="refresh" class="button">Osvježi podatke</button>`,
    ) +
    (failures.length
      ? `<div class="notice error">Neki podaci nisu dostupni. ${e(errorMessage(failures[0].reason))}</div>`
      : "") +
    `<section class="stats stats-${choices.length}" aria-label="Pregled podataka">${stats}</section><div class="dashboard-grid"><section class="panel"><div class="panel-title"><h2>${current.profile.role === "administracija_par" ? "Studentski ured" : "Radni prostor"}</h2><span class="pill">${e(roles[current.profile.role])}</span></div>${current.profile.role === "administracija_par" ? '<div class="detail-actions office-actions"><button class="button primary" data-office-add="calendarEvents">Dodaj termin</button><button class="button" data-office-add="students">Dodaj studenta</button><button class="button" data-office-add="employees">Dodaj profesora</button></div>' : ""}<div class="link-list">${Object.entries(
      modules,
    )
      .filter(
        ([name]) =>
          canRead(current.profile.role, name) &&
          name !== "notifications" &&
          (current.profile.role === "admin" ||
            roleNavigation(current.profile.role).primary.includes(name)),
      )
      .sort(([a], [b]) =>
        current.profile.role === "administracija_par"
          ? roleNavigation(current.profile.role).primary.indexOf(a) -
            roleNavigation(current.profile.role).primary.indexOf(b)
          : 0,
      )
      .slice(0, 7)
      .map(
        ([name, module]) =>
          `<button data-nav="${name}">${e(navigationLabel(current.profile.role, name))}<span aria-hidden="true">→</span></button>`,
      )
      .join(
        "",
      )}</div></section><aside class="panel dashboard-agenda"><div id="dashboard-mini-calendar"></div><div class="panel-title"><h2>Obavijesti</h2><a href="#notifications">Sve obavijesti</a></div>${canSendAnnouncement(current.profile.role) ? '<div class="announcement-action"><button class="button" id="dashboard-announce">Pošalji obavijest</button></div>' : ""}${model.unavailable?.includes("notifications") ? '<p class="panel-note">Obavijesti nisu dostupne.</p>' : notices.length ? `<div class="calendar-list">${notices.map((row, i) => `<button class="notice-preview" data-notice="${i}"><strong>${e(row.title)}</strong><span>${e(row.message)}</span></button>`).join("")}</div>` : '<p class="panel-note">Trenutno nema novih obavijesti.</p>'}</aside></div>`;
  mountMiniCalendar($("dashboard-mini-calendar"), model.events, {
    onEvent: (record) => {
      if (context === current) showDetails("calendarEvents", record);
    },
    onOpen: (date) => {
      calendarAnchor = date;
      location.hash = "calendarEvents";
    },
  });
  $("dashboard-announce")?.addEventListener("click", () =>
    showAnnouncement(current, async () => {
      if (context !== current) return;
      notify(
        current.demo
          ? "Obavijest spremljena u oglednoj sesiji."
          : "Obavijest je objavljena odabranoj grupi.",
      );
      await loadView("dashboard");
    }),
  );
  document
    .querySelectorAll("[data-notice]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showDetails("notifications", notices[Number(button.dataset.notice)]),
      ),
    );
  $("refresh").addEventListener("click", () => loadView("dashboard"));
  document.querySelectorAll("[data-office-add]").forEach((button) =>
    button.addEventListener("click", async () => {
      const name = button.dataset.officeAdd;
      history.replaceState(null, "", "#" + name);
      await loadView(name);
      if (current === context && canCreate(name)) showForm(name);
    }),
  );
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
  if (role === "administracija_par" && name === "notifications") return false;
  if (["enrollments", "examBookings", "labBookings"].includes(name))
    return false;
  return (
    canAdd(role, name) ||
    ["requests", "evaluations"].includes(name) ||
    (staffRoles.includes(role) &&
      ["workEntries", "vacations", "research"].includes(name))
  );
}
function canEdit(name, record) {
  if (name === "calendarEvents")
    return canEditCalendar(context.profile.role, context.user.uid, record);
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
  const batchAllowed =
    (context.profile.role === "admin" &&
      ["enrollments", "examBookings", "labBookings", "vacations"].includes(
        active,
      )) ||
    (context.profile.role === "profesor" &&
      ["enrollments", "examBookings"].includes(active)) ||
    (context.profile.role === "lab_assistant" && active === "labBookings");
  const monthly =
    active === "workEntries"
      ? '<label class="month-filter">Mjesec <input type="month" id="month-filter"></label>'
      : "";
  $("content").innerHTML =
    heading(
      navigationLabel(context.profile.role, active),
      "",
      `${active === "notifications" && canSendAnnouncement(context.profile.role) ? '<button class="button primary" id="send-announcement">Pošalji obavijest</button>' : ""}${active !== "notifications" && (canCreate(active) || canImport(context.profile.role, active)) ? actionMenu("Dodaj", `${canCreate(active) ? '<button id="create" type="button">Ručni unos</button>' : ""}${canImport(context.profile.role, active) ? '<button id="excel-open" type="button">Uvoz iz datoteke</button>' : ""}`, true) : ""}${actionMenu("Izvoz", '<button id="print" type="button">Ispis / PDF</button><button id="csv" type="button">CSV tablica</button>')}<button id="refresh" class="button icon-button" title="Osvježi" aria-label="Osvježi">${icon("arrows-rotate")}</button>`,
    ) +
    `<section class="panel module-panel"><div class="toolbar module-toolbar"><label class="module-search" for="search"><span class="sr-only">Pretraživanje</span>${icon("magnifying-glass")}<input class="search" id="search" type="search" placeholder="Pretraži…" autocomplete="off"></label><div class="toolbar-actions">${filters || monthly ? `<details class="module-filters" id="module-filters"><summary class="button">${icon("filter")} <span id="filter-label">Filtri</span></summary><div class="filter-fields">${filters}${monthly}<button class="button" id="clear-filters">Očisti filtre</button></div></details>` : ""}${batchAllowed ? '<button class="button" id="batch-approve">Odobri više…</button>' : ""}</div></div><div id="table-area"></div><div class="table-footer" id="record-count"></div></section>`;
  if ($("status-filter")) $("status-filter").value = statusFilter;
  if ($("month-filter")) $("month-filter").value = month;
  $("clear-filters")?.addEventListener("click", () => {
    statusFilter = "";
    month = "";
    page = 1;
    if ($("status-filter")) $("status-filter").value = "";
    if ($("month-filter")) $("month-filter").value = "";
    drawTable();
  });
  $("send-announcement")?.addEventListener("click", () => {
    const current = context;
    showAnnouncement(current, async () => {
      if (context === current) {
        notify("Obavijest je objavljena odabranoj grupi.");
        await loadView(active);
      }
    });
  });
  $("excel-open")?.addEventListener("click", () =>
    showExcelImport(context, active, () => loadView(active)),
  );
  $("batch-approve")?.addEventListener("click", () => {
    const current = context,
      name = active,
      targets = exportRows
        .filter((r) => r.status === "Na čekanju")
        .slice(0, 50);
    openDialog(
      "Provjerite skupno odobravanje",
      `<p>Odobrit će se najviše 50 prijava koje odgovaraju trenutnim filtrima. Svaka prijava ponovno se provjerava prije odluke.</p><ul>${targets.map((r) => `<li>${e(r.ownerName)} · ${e(r.courseTitle || r.title || r.startDate)}</li>`).join("")}</ul><button class="button primary" id="batch-confirm" ${targets.length ? "" : "disabled"}>Odobri ${targets.length} prijava</button><p id="batch-result" role="status"></p>`,
    );
    $("batch-confirm").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      let success = 0;
      const errors = [];
      for (const row of targets) {
        if (context !== current) break;
        try {
          await current.repository.decide(name, row.id, "Odobreno");
          success++;
        } catch (error) {
          errors.push(`${row.ownerName}: ${errorMessage(error)}`);
        }
      }
      if (context === current && $("batch-result"))
        $("batch-result").textContent =
          `Odobreno ${success}/${targets.length}. ${errors.join("; ")}`;
      const latest = await current.repository.listAll(name);
      if (context === current) {
        rows = latest;
        drawTable();
      }
    });
  });
  $("create")?.addEventListener("click", () => showForm(active));
  $("refresh").addEventListener("click", () => loadView(active));
  $("search").addEventListener("input", (event) => {
    page = 1;
    search = event.target.value.toLocaleLowerCase("hr");
    drawTable();
  });
  $("status-filter")?.addEventListener("change", (event) => {
    page = 1;
    statusFilter = event.target.value;
    drawTable();
  });
  $("month-filter")?.addEventListener("change", (event) => {
    page = 1;
    month = event.target.value;
    drawTable();
  });
  $("print").addEventListener("click", () => {
    try {
      const total =
        active === "workEntries"
          ? `Ukupno ${exportRows.reduce((sum, row) => sum + Number(row.hours || 0), 0)} sati · ${month || "Svi mjeseci"}`
          : `${exportRows.length} zapisa`;
      printReport(
        config.title,
        config.columns.map((key) => ({ key, label: labelFor(active, key) })),
        exportRows,
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
      exportRows,
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
  exportRows = shownRows.slice();
  const groups =
    active === "enrollments"
      ? [
          ...new Set(
            shownRows.map((r) => r.studentId || r.ownerUid || r.ownerName),
          ),
        ]
      : null;
  const pageCount =
    active === "calendarEvents"
      ? 1
      : Math.max(
          1,
          Math.ceil(
            (groups ? groups.length : shownRows.length) / (groups ? 20 : 50),
          ),
        );
  page = Math.max(1, Math.min(page, pageCount));
  if (active !== "calendarEvents") {
    if (groups) {
      const selected = new Set(groups.slice((page - 1) * 20, page * 20));
      shownRows = shownRows.filter((r) =>
        selected.has(r.studentId || r.ownerUid || r.ownerName),
      );
    } else shownRows = shownRows.slice((page - 1) * 50, page * 50);
  }
  const visual = shownRows.length
    ? visualRecords(active, shownRows, badge)
    : null;
  if (!shownRows.length && active !== "calendarEvents")
    $("table-area").innerHTML =
      `<div class="empty"><h2>${rows.length ? "Nema rezultata" : "Još nema zapisa"}</h2><p>${rows.length ? "Pokušajte s drugim pojmom ili filtrom." : canCreate(active) ? "Dodajte prvi zapis. Podaci se spremaju tek nakon potvrde baze." : "Zapisi će se prikazati kada ih administrator ili nadležna služba doda."}</p></div>`;
  else if (active === "calendarEvents") {
    const current = context;
    mountCalendarView($("table-area"), shownRows, {
      context: current,
      initialDate: calendarAnchor,
      allEvents: rows,
      onVisible: (visible) => {
        exportRows = visible.slice();
        shownRows = visible.slice();
        if ($("record-count"))
          $("record-count").textContent = visible.length + " zapisa";
      },
      canEdit: canManage(current.profile.role, "calendarEvents"),
      canEditRecord: (record) =>
        canEditCalendar(current.profile.role, current.user.uid, record),
      onDetails: (record) => showDetails("calendarEvents", record),
      onMove: async (record, target) => {
        if (context !== current || active !== "calendarEvents")
          throw new Error("Prikaz ili sesija su promijenjeni.");
        const moved = await current.repository.moveCalendar(record, target);
        if (moved?.warning && context === current) notify(moved.warning);
        if (context !== current || active !== "calendarEvents") return;
        rows = await (current.repository.listAll?.("calendarEvents") ||
          current.repository.list("calendarEvents"));
        if (context === current && active === "calendarEvents") {
          drawTable();
          Array.from($("table-area").querySelectorAll("[data-event]"))
            .find((el) => el.dataset.event === record.id)
            ?.focus({ preventScroll: true });
        }
      },
    });
    calendarAnchor = "";
  } else if (visual) $("table-area").innerHTML = visual;
  else
    $("table-area").innerHTML =
      `<div class="table-scroll"><table><caption class="sr-only">${e(config.title)}</caption><thead><tr>${config.columns.map((key) => `<th scope="col">${e(labelFor(active, key))}</th>`).join("")}<th scope="col">Detalji</th></tr></thead><tbody>${shownRows.map((row, i) => `<tr>${config.columns.map((key) => `<td>${key === "status" ? badge(row[key]) : e(display(row[key]))}</td>`).join("")}<td><button class="button table-action" data-row="${i}" aria-label="Detalji: ${e(row.name || row.title || row.ownerName || config.title)}">Otvori →</button></td></tr>`).join("")}</tbody></table></div>`;
  if ($("filter-label"))
    $("filter-label").textContent =
      `Filtri${[statusFilter, month].filter(Boolean).length ? ` (${[statusFilter, month].filter(Boolean).length})` : ""}`;
  $("record-count").innerHTML =
    `<span>${shownRows.length === exportRows.length ? `${exportRows.length} zapisa` : `${shownRows.length} od ${exportRows.length} zapisa`}</span>${pageCount > 1 ? `<div class="page-controls"><button class="button" id="records-prev" ${page === 1 ? "disabled" : ""}>Prethodna</button><span>Stranica ${page} / ${pageCount}</span><button class="button" id="records-next" ${page === pageCount ? "disabled" : ""}>Sljedeća</button></div>` : ""}`;
  $("records-prev")?.addEventListener("click", () => {
    page--;
    drawTable();
  });
  $("records-next")?.addEventListener("click", () => {
    page++;
    drawTable();
  });
  $("table-area")
    .querySelectorAll("[data-row]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showDetails(active, shownRows[Number(button.dataset.row)]),
      ),
    );
}
function showDetails(name, record) {
  const current = context;
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
      `${role === "admin" ? `<details class="context-help"><summary>Podaci o zapisu</summary><p>ID: ${e(record.id)}</p></details>` : ""}<div class="detail-actions">${canEdit(name, record) ? '<button id="edit-record" class="button primary">Uredi</button>' : ""}<button id="print-record" class="button">Ispis / PDF</button>${record.url && /^https:\/\//i.test(record.url) ? `<a class="button" href="${e(record.url)}" target="_blank" rel="noopener noreferrer">Otvori dokument ↗</a>` : ""}${role === "student" && bookingTarget ? '<button id="book-record" class="button primary">Pošalji prijavu</button>' : ""}${canDecide && record.status === "Na čekanju" && ["vacations", "enrollments", "examBookings", "labBookings"].includes(name) ? '<button id="approve" class="button primary">Odobri</button><button id="reject" class="button">Odbij</button>' : ""}${canDelete(role, name) && (name !== "calendarEvents" || canEdit(name, record)) && !["users", "evaluations"].includes(name) ? '<button id="delete-record" class="button danger">Arhiviraj</button>' : ""}</div><div id="detail-error" role="alert"></div>`,
  );
  if (["courses", "calendarEvents", "exams"].includes(name)) {
    const root = document.createElement("section");
    root.className = "course-calendar-actions";
    $("dialog-body").append(root);
    mountCourseCalendar(
      root,
      name,
      record,
      current,
      () => context === current && root.isConnected,
    );
  }
  $("edit-record")?.addEventListener("click", () => {
    closeDialog();
    showForm(name, record);
  });
  if (
    name === "calendarEvents" &&
    canRead(role, "attendance") &&
    canEdit(name, record)
  ) {
    const button = document.createElement("button");
    button.className = "button primary";
    button.textContent = "Evidencija prisutnosti";
    button.addEventListener("click", () => {
      attendanceEvent = record.id;
      closeDialog();
      location.hash = "attendance";
    });
    document.querySelector(".detail-actions").append(button);
  }
  if (name === "calendarEvents" && record.seriesId && canEdit(name, record)) {
    const seriesButton = document.createElement("button");
    seriesButton.className = "button";
    seriesButton.textContent = "Satnica cijele serije…";
    seriesButton.addEventListener("click", () => {
      openDialog(
        "Promjena satnice serije",
        `<p>Datumi, kolegij i nastavnici ostaju isti. Prije spremanja provjerava se cijeli raspored, a svaki termin ponovno pri spremanju. Ako se u međuvremenu pojavi sukob, obrada staje i prikazuje koliko je termina spremljeno.</p><form id="series-form"><div class="form-grid">${renderField({ key: "time", label: "Početak", type: "time", required: true }, record.time)}${renderField({ key: "endTime", label: "Završetak", type: "time", required: true }, record.endTime)}${renderField({ key: "room", label: "Dvorana", required: false }, record.room)}</div><button class="button" type="submit">Prikaži promjene</button></form><div id="series-preview"></div>`,
      );
      $("series-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget,
          button = form.querySelector("button");
        button.disabled = true;
        try {
          const events = await current.repository.listAll("calendarEvents");
          if (context !== current) return;
          const plan = planSeries(
            events,
            record,
            Object.fromEntries(new FormData(form)),
            role,
            current.user.uid,
          );
          $("series-preview").innerHTML =
            `<p>${plan.length} termina. Datumi se ne mijenjaju.</p><ul>${plan.map((r) => `<li>${e(r.date)} · ${e(r.time)} – ${e(r.endTime)} · ${e(r.room)}</li>`).join("")}</ul><button class="button primary" id="series-confirm">Potvrdi promjenu serije</button><p id="series-result" role="status"></p>`;
          $("series-confirm").addEventListener("click", async (event) => {
            event.currentTarget.disabled = true;
            button.disabled = true;
            let count = 0;
            try {
              for (const row of plan) {
                if (context !== current)
                  throw new Error("Sesija je promijenjena.");
                await current.repository.save(
                  "calendarEvents",
                  validateFields(modules.calendarEvents.fields, row),
                  row.id,
                  { expected: row.expectedRevision },
                );
                count++;
              }
              if ($("series-result"))
                $("series-result").textContent =
                  `Spremljeno ${count}/${plan.length} termina.`;
            } catch (error) {
              if ($("series-result"))
                $("series-result").textContent =
                  `Spremljeno ${count}/${plan.length}. ${errorMessage(error)} Preostali termini nisu promijenjeni. Ponovno otvorite seriju za novi pregled.`;
            }
          });
        } catch (error) {
          if ($("series-preview"))
            $("series-preview").textContent = errorMessage(error);
        } finally {
          button.disabled = false;
        }
      });
    });
    $("dialog-body").querySelector(".detail-actions").append(seriesButton);
  }
  if (role === "admin" && name === "students") {
    const overview = document.createElement("button");
    overview.className = "button";
    overview.textContent = "Objedinjeni pregled studenta";
    overview.addEventListener("click", async () => {
      overview.disabled = true;
      try {
        const names = ["enrollments", "grades", "requests", "finances"];
        const data = await Promise.all(
          names.map(async (module) => [
            module,
            (await current.repository.listAll(module)).filter(
              (r) =>
                (record.ownerUid && r.ownerUid === record.ownerUid) ||
                r.studentId === record.id,
            ),
          ]),
        );
        if (context !== current) return;
        openDialog(
          `Pregled · ${record.name}`,
          `<p>${e(record.email || "Dosje još nema e-adresu")}${!record.ownerUid ? " · Račun nije povezan; osobne ocjene i financije možda nisu povezane s dosjeom." : ""}</p>${data.map(([module, list]) => `<section><h3>${e(modules[module].title)} (${list.length})</h3>${list.length ? `<ul>${list.map((r) => `<li>${e(r.courseTitle || r.title || r.studentName || "Zapis")} · ${e(r.status || r.grade || "")}${r.amount != null ? ` · ${e(r.amount)} €` : ""}</li>`).join("")}</ul>` : "<p>Nema povezanih zapisa.</p>"}</section>`).join("")}`,
        );
      } catch (error) {
        if ($("detail-error"))
          $("detail-error").textContent = errorMessage(error);
      } finally {
        overview.disabled = false;
      }
    });
    $("dialog-body").querySelector(".detail-actions").append(overview);
    if (!current.demo) {
      const linkButton = document.createElement("button");
      linkButton.className = "button";
      linkButton.textContent = "Poveži studentski račun i upise";
      linkButton.addEventListener("click", async () => {
        const context = current;
        try {
          const users = (await context.repository.listAll("users")).filter(
            (u) =>
              u.role === "student" &&
              u.active &&
              record.email &&
              u.email?.trim().toLowerCase() ===
                record.email.trim().toLowerCase(),
          );
          if (context !== current) return;
          if (!users.length)
            throw new Error(
              "Nema aktivnog studentskog računa s e-adresom iz dosjea. Student se treba registrirati tom adresom, a administrator odobriti račun. Ako adresa nedostaje, prvo uredite dosje.",
            );
          openDialog(
            "Poveži studentski račun",
            `<p>Dosje: <strong>${e(record.name)}</strong> · ${e(record.email)}. Povezuju se i postojeći upisi ovog dosjea. Uloge i aktivacija računa se ne mijenjaju.</p><label>Provjerite račun<select id="student-link-user">${users.map((u) => `<option value="${e(u.id)}">${e(u.name)} · ${e(u.email)} · ${e(u.id)}</option>`).join("")}</select></label><button id="student-link-save" class="button primary">Poveži dosje i upise</button><p id="student-link-message" role="status"></p>`,
          );
          $("student-link-save").addEventListener("click", async () => {
            const button = $("student-link-save"),
              message = $("student-link-message"),
              uid = $("student-link-user").value;
            button.disabled = true;
            try {
              if (context !== current)
                throw new Error("Sesija je promijenjena.");
              const count = await linkStudentAccount(context, record.id, uid);
              if (message.isConnected)
                message.textContent = `Povezan dosje i ${count} upisa. Student sada vidi odobrene predmete u svom rasporedu.`;
            } catch (error) {
              if (message.isConnected)
                message.textContent = errorMessage(error);
            } finally {
              if (button.isConnected) button.disabled = false;
            }
          });
        } catch (error) {
          if (context === current && $("detail-error"))
            $("detail-error").textContent = errorMessage(error);
        }
      });
      $("dialog-body").querySelector(".detail-actions").append(linkButton);
    }
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
      "Arhivirati zapis?",
      `<p>Zapis će biti premješten u arhivu. Administrator ga može vratiti bez prepisivanja postojećih podataka. ID: ${e(record.id)}</p><div class="form-actions"><button id="cancel-delete" class="button">Odustani</button><button id="confirm-delete" class="button danger">Premjesti u arhivu</button></div><div id="detail-error" role="alert"></div>`,
    );
    $("cancel-delete").addEventListener("click", closeDialog);
    $("confirm-delete").addEventListener("click", (event) =>
      mutate(
        event.currentTarget,
        () => context.repository.remove(name, record.id),
        "Zapis je premješten u arhivu.",
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
    const result = await operation();
    if (context !== original) return;
    closeDialog();
    notify(result?.warning || message);
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
    !canAdd(role, name) ||
    (name === "research" && role !== "admin") ||
    name === "evaluations";
  const defaults = { ...record };
  if (role === "administracija_par" && name === "employees" && !record.id)
    defaults.position = "Nastavnik";
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
  if (name === "calendarEvents" && role === "profesor") {
    defaults.instructorUid = context.user.uid;
    defaults.instructorName = context.profile.name;
  }
  if (name === "users" && !record.id) defaults.active = true;
  const readonly = (field) =>
    (mine &&
      ["ownerUid", "ownerName", "status", "response"].includes(field.key)) ||
    (role === "profesor" &&
      [
        "instructorUid",
        "instructorUids",
        ...(name === "calendarEvents" ? ["instructorName"] : []),
      ].includes(field.key));
  const groups = groupRecordFields(
    name,
    modules[name].fields.filter(
      (field) =>
        !(mine && ["ownerUid", "ownerName", "response"].includes(field.key)) &&
        !(
          role === "administracija_par" &&
          ["ownerUid", "instructorUid", "instructorUids"].includes(field.key)
        ),
    ),
  );
  const fieldHTML = (fields) =>
    fields
      .map((field) => renderField(field, defaults[field.key], readonly(field)))
      .join("");
  const questions =
    name === "evaluations"
      ? '<div class="evaluation-questions"><p class="notice">Odgovori su povezani s vašim računom i nisu anonimni.</p><div class="field"><label for="eval-template">Predložak upitnika</label><select id="eval-template"><option value="">Opći osvrt</option></select></div><strong>Pitanja za osvrt</strong><ol id="eval-questions"><li>Jesu li upute i materijali jasni?</li><li>Koliko je jednostavno obaviti zadatak?</li><li>Je li podrška pravodobna i korisna?</li><li>Što biste poboljšali?</li></ol><p class="muted">Pitanja iz izvornog prototipa uključuju procjenu budućih integracija.</p></div>'
      : "";
  openDialog(
    `${record.id ? "Uredi" : "Novi zapis"} · ${modules[name].title}`,
    `${questions}<form id="record-form">${name === "calendarEvents" ? '<div id="slot-finder"></div>' : ""}<div class="form-grid">${name === "users" && !record.id ? renderField({ key: "uid", label: "Firebase Authentication UID", required: true }, "") : ""}${fieldHTML(groups.primary)}</div>${groups.secondary.length ? `<details class="form-additional"><summary>${name === "courses" ? "Silabus i dodatni podaci" : "Dodatni podaci"}</summary><div class="form-grid">${fieldHTML(groups.secondary)}</div></details>` : ""}<div id="form-error" role="alert"></div><div class="form-actions"><button id="cancel-form" type="button" class="button">Odustani</button><button type="submit" class="button primary">Spremi zapis</button></div></form>`,
  );
  $("cancel-form").addEventListener("click", closeDialog);
  const current = context;
  const form = $("record-form");
  const formSubmit = form.querySelector("[type=submit]");
  formSubmit.disabled = true;
  mountRecordSelectors(
    form,
    name,
    current,
    record,
    () => context === current && $("record-form") === form,
  )
    .then(() => {
      formSubmit.disabled = false;
    })
    .catch((error) => {
      if ($("record-form") === form)
        $("form-error").textContent = errorMessage(error);
    });
  const checkSlot =
    name === "calendarEvents"
      ? mountSlotFinder($("slot-finder"), form, current.repository, record)
      : null;
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
        if (field.type === "uids")
          values[field.key] = [
            ...(form.elements[field.key]?.selectedOptions || []),
          ].map((o) => o.value);
        if (field.type === "checkbox")
          values[field.key] = form.elements[field.key].checked;
      }
      if (role === "administracija_par") {
        // Account links are assigned by an admin; preserve them when moving existing teaching.
        for (const key of ["ownerUid", "instructorUid", "instructorUids"])
          if (record[key] !== undefined) values[key] = record[key];
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
      if (checkSlot) await checkSlot(data);
      if (context !== current || $("record-form") !== form) return;
      const saved = await current.repository.save(
        name,
        data,
        id,
        name === "calendarEvents" && record.id
          ? { expected: revisionOf(record) }
          : {},
      );
      if (context !== current) return;
      closeDialog();
      notify(
        current.demo
          ? "Spremljeno u oglednoj sesiji. Baza nije promijenjena."
          : name === "courses" && saved?.syncedEvents != null
            ? `Kolegij je spremljen. Nastavnik je usklađen u ${saved.syncedEvents} termina rasporeda i ${(saved.syncedRecords || saved.syncedEvents) - saved.syncedEvents} ostalih evidencija.`
            : saved?.warning || "Zapis je spremljen u bazu.",
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
    heading("Pomoć i integracije", "") +
    '<section class="panel"><div class="panel-title"><h2>Pristup sustavu</h2></div><div class="panel-note"><p>Ulogu dodjeljuje administrator. Ako ne vidite potreban modul, obratite se nadležnoj službi. Odjavite se nakon rada na zajedničkom računalu.</p><p>Zapisi se spremaju u Cloud Firestore. Pogreška baze prikazuje se na zaslonu; ogledni podaci ne zamjenjuju produkcijske zapise.</p></div></section>' +
    '<section class="panel"><div class="panel-title"><h2>Kalendar</h2></div><div class="panel-note"><p>Pod Filtri odaberite studij, grupu, semestar i akademsku godinu. Moj raspored prikazuje dodijeljenu nastavu ili odobrene upise.</p><p>Vlastitu nastavu možete povući na drugi dan ili vrijeme, u koracima od 15 minuta, ili koristiti Alt + strelice. Trajanje ostaje isto. Dvoranu mijenjate kroz Uredi ili Dvorane i dostupnost.</p></div></section>' +
    '<section class="panel"><div class="panel-title"><h2>Status integracija</h2></div><div class="panel-note"><p><strong>ISVU:</strong> ocjene su lokalna evidencija. Slanje Ministarstvu zahtijeva službeni API i zaštićenu poslužiteljsku integraciju.</p><p><strong>AI asistent:</strong> nije povezan. Za AI odgovore potreban je poslužitelj i ugovorena API usluga. U ovoj verziji nema simuliranih odgovora.</p><p><strong>PDF:</strong> otvorite ispis i odaberite „Spremi kao PDF”. Studentske potvrde trebaju odobrenje referade; ispis iz aplikacije nije službena potvrda.</p><p><strong>Plaćanja:</strong> financijski modul evidentira obveze. Ne izvršava bankovne transakcije niti generira neprovjeren barkod.</p><p><strong>Dokumenti:</strong> poveznice trebaju imati vlastitu kontrolu pristupa ako dokument nije javno objavljen. Privatna pohrana datoteka još nije povezana.</p></div></section>';
}
$("logout").addEventListener("click", async () => {
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
{
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
      authenticatedSession = { user: session.user, profile: session.profile };
      if (
        context?.demo &&
        context.realAdminUid === session.user.uid &&
        canUseDemo(session.user, session.profile)
      )
        return;
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

setupLanguage();

setupActionMenus();
setupTimeInputs();
