import { modules } from "../modules/catalog.js";
import { canRead } from "../auth/permissions.js";
import { escapeHTML as e } from "../utils/helpers.js";

export const searchTerm = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("hr");
export function searchRecords(sources, term) {
  const tokens = searchTerm(term).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (text) => tokens.every((t) => searchTerm(text).includes(t));
  const courseIds = new Set(
    (sources.courses || []).filter((r) => matches(r.title)).map((r) => r.id),
  );
  const people = new Set();
  for (const name of ["students", "enrollments", "attendance", "grades"])
    for (const r of sources[name] || [])
      if (matches(r.studentName || r.ownerName || r.name))
        people.add(
          r.ownerUid || r.studentId || r.ownerName || r.studentName || r.name,
        );
  return Object.entries(sources).flatMap(([name, rows]) =>
    rows
      .filter((r) => {
        const text = modules[name].fields
          .filter((f) => !/Uid|Uids|Id$/.test(f.key))
          .map((f) =>
            typeof r[f.key] === "string" || typeof r[f.key] === "number"
              ? r[f.key]
              : "",
          )
          .join(" ");
        return (
          matches(text) ||
          (r.courseId && courseIds.has(r.courseId)) ||
          ([
            "students",
            "enrollments",
            "attendance",
            "grades",
            "examBookings",
            "finances",
            "requests",
          ].includes(name) &&
            people.has(
              r.ownerUid ||
                r.studentId ||
                r.ownerName ||
                r.studentName ||
                r.name,
            ))
        );
      })
      .map((record) => ({ name, record })),
  );
}

export async function loadSearchSources(context) {
  const sources = {},
    failures = [];
  const queue = Object.keys(modules).filter((name) =>
    canRead(context.profile.role, name),
  );
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const name = queue.shift();
        try {
          sources[name] = await context.repository.listAll(name);
        } catch {
          failures.push(name);
        }
      }
    }),
  );
  return { sources, failures };
}

export function setupGlobalSearch({ getContext, onRecord }) {
  const input = document.getElementById("global-search"),
    results = document.getElementById("global-results");
  let timer,
    revision = 0,
    loadedContext,
    loading,
    loadedAt = 0,
    matches = [],
    resultContext;
  async function load(context) {
    if (loadedContext === context && loading && Date.now() - loadedAt < 30000)
      return loading;
    loadedContext = context;
    loadedAt = Date.now();
    loading = loadSearchSources(context);
    return loading;
  }
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const ticket = ++revision,
      context = getContext(),
      term = input.value.trim();
    results.hidden = !term;
    matches = [];
    if (!term || !context) {
      results.replaceChildren();
      return;
    }
    results.innerHTML = '<p role="status">Pretraživanje…</p>';
    timer = setTimeout(async () => {
      const { sources, failures } = await load(context);
      if (ticket !== revision || context !== getContext()) return;
      resultContext = context;
      matches = searchRecords(sources, term);
      const moduleHits = Object.entries(modules).filter(
        ([name, m]) =>
          canRead(context.profile.role, name) &&
          searchTerm(m.title).includes(searchTerm(term)),
      );
      results.innerHTML =
        moduleHits
          .map(([name, m]) => `<a href="#${name}">${e(m.title)}</a>`)
          .join("") +
        Object.entries(modules)
          .map(([name, m]) => {
            const rows = matches
              .map((hit, index) => ({ ...hit, index }))
              .filter((hit) => hit.name === name);
            return rows.length
              ? `<section><h3><span>${e(m.title)}</span> (${rows.length})</h3>${rows
                  .slice(0, 10)
                  .map(hitButton)
                  .join(
                    "",
                  )}${rows.length > 10 ? `<button type="button" data-search-more="${name}">Prikaži još</button>` : ""}</section>`
              : "";
          })
          .join("") +
        (failures.length
          ? "<p>Neki izvori nisu dostupni. Pokušajte ponovno.</p>"
          : "");
      if (!matches.length && !moduleHits.length && !failures.length)
        results.innerHTML = "<p>Nema rezultata</p>";
    }, 250);
  });
  function hitButton({ name, record: r, index }) {
    return `<button type="button" data-search-result="${index}"><strong>${e(r.title || r.studentName || r.ownerName || r.name || r.courseTitle || modules[name].title)}</strong><small>${e([r.courseTitle, r.date, r.time, r.room, r.status, r.grade].filter((v) => v !== undefined && v !== "").join(" · "))}</small></button>`;
  }
  results.addEventListener("click", (event) => {
    const more = event.target.closest("[data-search-more]");
    if (more) {
      if (getContext() !== resultContext) return;
      const rows = matches
        .map((hit, index) => ({ ...hit, index }))
        .filter((hit) => hit.name === more.dataset.searchMore);
      const offset = more.parentElement.querySelectorAll(
        "[data-search-result]",
      ).length;
      more.insertAdjacentHTML(
        "beforebegin",
        rows
          .slice(offset, offset + 10)
          .map(hitButton)
          .join(""),
      );
      if (offset + 10 >= rows.length) more.remove();
      return;
    }

    const button = event.target.closest("[data-search-result]"),
      hit = button && matches[Number(button.dataset.searchResult)];
    if (!hit && !event.target.closest("a")) return;
    ++revision;
    results.hidden = true;
    input.value = "";
    if (
      hit &&
      getContext() === resultContext &&
      canRead(getContext()?.profile.role, hit.name)
    )
      onRecord(hit.name, hit.record);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ++revision;
      results.hidden = true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      results.querySelector("button,a")?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-search")) results.hidden = true;
  });
}
