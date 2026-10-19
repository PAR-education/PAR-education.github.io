import { noticeAudiences } from "../utils/notices.js";
import { escapeHTML as e, display } from "../utils/helpers.js";
import { textWithLinks } from "../utils/links.js";
let previousFocus;
const dialog = () => document.getElementById("record-dialog");
export function openDialog(title, body) {
  previousFocus = document.activeElement;
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-body").innerHTML = body;
  dialog().showModal();
}
export function closeDialog() {
  if (dialog().open) dialog().close();
}
export function setupDialog() {
  document
    .getElementById("close-dialog")
    .addEventListener("click", closeDialog);
  dialog().addEventListener("close", () => {
    // A details dialog can reopen immediately as an edit form before the close event arrives.
    if (dialog().open) return;
    document.getElementById("dialog-body").replaceChildren();
    previousFocus?.focus();
  });
  dialog().addEventListener("click", (event) => {
    if (event.target === dialog()) closeDialog();
  });
}
export function renderField(field, value = "", readonly = false) {
  const attrs = `name="${e(field.key)}" id="field-${e(field.key)}" ${field.required ? "required" : ""} ${readonly ? "disabled" : ""}`;
  const label = `<label for="field-${e(field.key)}">${e(field.label)}${field.required ? ' <span aria-hidden="true">*</span>' : ""}</label>`;
  if (field.type === "uids")
    return `<div class="field wide">${label}<select multiple ${attrs}>${(Array.isArray(value) ? value : []).map((uid) => `<option selected value="${e(uid)}">${e(uid)}</option>`).join("")}</select><small>Ctrl/Cmd + klik za odabir više nastavnika.</small></div>`;
  if (field.type === "checkbox")
    return `<div class="field check"><label><input type="checkbox" ${attrs} ${value === true ? "checked" : ""}> ${e(field.label)}</label></div>`;
  if (field.options)
    return `<div class="field">${label}<select ${attrs}><option value="">Odaberite…</option>${field.options.map((option) => `<option ${option === value ? "selected" : ""} value="${e(option)}">${e(field.key === "audience" ? noticeAudiences[option] : option === "administracija_par" && field.key === "role" ? "AdministracijaPAR" : option)}</option>`).join("")}</select></div>`;
  if (field.type === "textarea")
    return `<div class="field wide">${label}<textarea ${attrs} maxlength="${field.maxLength}" rows="4">${e(value)}</textarea></div>`;
  return `<div class="field">${label}<input ${attrs} type="${e(field.type || "text")}" value="${e(value)}" ${field.min != null ? `min="${field.min}" max="${field.max}" step="${field.integer ? 1 : "any"}"` : ""} maxlength="${field.maxLength || 200}"></div>`;
}
export function detailsHTML(fields, record) {
  const visible = fields.filter(
    (field) =>
      record[field.key] !== undefined &&
      record[field.key] !== null &&
      record[field.key] !== "" &&
      (!Array.isArray(record[field.key]) || record[field.key].length),
  );
  const technical = new Set([
    "ownerUid",
    "instructorUid",
    "instructorUids",
    "studentId",
    "courseId",
    "examId",
    "labId",
    "departmentId",
    "seriesId",
  ]);
  const render = (items) =>
    `<dl class="details">${items.map((field) => `<div><dt>${e(field.label)}</dt><dd>${["description", "message"].includes(field.key) ? textWithLinks(record[field.key]) : e(display(field.key === "audience" ? noticeAudiences[record[field.key]] : record[field.key]))}</dd></div>`).join("")}</dl>`;
  return (
    render(visible.filter((f) => !technical.has(f.key))) +
    (visible.some((f) => technical.has(f.key))
      ? `<details class="context-help"><summary>Povezani zapisi</summary>${render(visible.filter((f) => technical.has(f.key)))}</details>`
      : "")
  );
}
