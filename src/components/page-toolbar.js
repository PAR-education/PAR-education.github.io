// Move the existing controls, preserving their listeners and current values.
export function setupPageToolbar(content, host, titleHost) {
  const sync = () => {
    observer.disconnect();
    const heading = content.querySelector(".page-heading");
    let actions = host.querySelector(".page-actions");
    const incoming = heading?.querySelector(".page-actions");
    if (incoming) {
      host.replaceChildren(incoming);
      actions = incoming;
    }
    const title = content.querySelector("h1");
    if (title) {
      titleHost.replaceChildren(title);
      titleHost.hidden = false;
    }
    if (heading && !heading.textContent.trim()) heading.hidden = true;
    function toolbar() {
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "page-actions";
        host.append(actions);
      }
      return actions;
    }
    content.querySelectorAll("input[type=search]").forEach((input) => {
      const label = input.closest("label");
      if (label) label.hidden = true;
      else input.hidden = true;
    });
    content
      .querySelectorAll(
        ".module-toolbar .module-filters, .module-toolbar #batch-approve, #attendance-filters",
      )
      .forEach((control) => toolbar().append(control));
    const kind = content.querySelector("#history-kind");
    if (kind) {
      const details = document.createElement("details");
      details.className = "module-filters";
      details.innerHTML =
        '<summary class="button"><i class="fa-solid fa-filter" aria-hidden="true"></i> Filtri</summary><div class="filter-fields"></div>';
      details.querySelector(".filter-fields").append(kind.closest("label"));
      toolbar().append(details);
    }
    for (const selector of [
      "#calendar-preview",
      "#calendar-ics",
      "#calendar-google-all",
      "#backup-download",
      "#cleanup-review",
    ])
      content.querySelectorAll(selector).forEach((button) => {
        if (["calendar-ics", "calendar-google-all"].includes(button.id)) {
          let menu = host.querySelector("[data-calendar-export-menu]");
          if (!menu) {
            menu = document.createElement("details");
            menu.className = "action-menu";
            menu.dataset.calendarExportMenu = "";
            menu.innerHTML =
              '<summary class="button">Izvoz <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="action-menu-items"></div>';
            toolbar().append(menu);
          }
          button.className = "";
          menu.querySelector(".action-menu-items").append(button);
        } else toolbar().append(button);
      });
    content
      .querySelectorAll(".module-toolbar,.attendance-tools")
      .forEach((node) => {
        node.hidden = true;
      });
    content.querySelectorAll(".toolbar").forEach((node) => {
      if (
        [...node.children].every(
          (child) => child.hidden || !child.childNodes.length,
        )
      )
        node.hidden = true;
    });
    host.hidden = !actions?.children.length;
    observer.observe(content, { childList: true, subtree: true });
  };
  const observer = new MutationObserver(sync);
  observer.observe(content, { childList: true, subtree: true });
  sync();
}
