import { escapeHTML as e } from "../utils/helpers.js";
export function actionMenu(label, content, primary = false) {
  return `<details class="action-menu"><summary class="button ${primary ? "primary" : ""}">${e(label)} <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="action-menu-items">${content}</div></details>`;
}
export function setupActionMenus() {
  document.addEventListener(
    "toggle",
    (event) => {
      const menu = event.target;
      if (
        !menu.matches?.(
          "details.action-menu,details.module-filters,details.calendar-filter-panel",
        ) ||
        !menu.open
      )
        return;
      document
        .querySelectorAll(
          "details.action-menu[open],details.module-filters[open],details.calendar-filter-panel[open]",
        )
        .forEach((other) => {
          if (other !== menu) other.open = false;
        });
    },
    true,
  );
  document.addEventListener("click", (event) => {
    document
      .querySelectorAll(
        "details.action-menu[open],details.module-filters[open],details.calendar-filter-panel[open]",
      )
      .forEach((menu) => {
        if (
          !menu.contains(event.target) ||
          event.target.closest(".action-menu-items button,.action-menu-items a")
        )
          menu.open = false;
      });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const menu = document.activeElement?.closest(
      "details.action-menu,details.module-filters,details.calendar-filter-panel",
    );
    if (menu?.open) {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
}
export function helpDetails(content, label = "Upute") {
  return `<details class="context-help"><summary>${e(label)}</summary><div>${content}</div></details>`;
}

export function groupRecordFields(name, fields) {
  const preferred =
    {
      calendarEvents: ["title", "courseId", "date", "time", "endTime", "room", "online", "description"],
      courses: ["title", "ects", "semester", "instructorUids"],
      students: [
        "name",
        "email",
        "jmbag",
        "year",
        "study",
        "status",
        "ownerUid",
      ],
      employees: ["name", "email", "position", "departmentId", "ownerUid"],
    }[name] || [];
  const primary = [],
    secondary = [];
  for (const field of fields)
    (field.required || preferred.includes(field.key)
      ? primary
      : secondary
    ).push(field);
  return { primary, secondary };
}
