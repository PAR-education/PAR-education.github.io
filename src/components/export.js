import { escapeHTML as e, display } from "../utils/helpers.js";
export function printReport(title, columns, rows, subtitle = "", options = {}) {
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) throw new Error("Dopustite skočne prozore za ispis.");
  popup.document.write(
    `<!doctype html><html lang="hr"><head><meta charset="utf-8"><title>${e(title)}</title><style>body{font:14px Arial,sans-serif;color:#17243c;padding:30px}h1{font-size:24px}dl{margin:24px 0}dl>div{margin:0 0 18px}dt{font-weight:bold;margin-bottom:5px}dd{margin:0;white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere}p{color:#586477}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ccc;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#f0f3f7}button{padding:10px 15px;margin-bottom:15px}footer{margin-top:30px;font-size:12px;color:#586477}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><button id="print">Ispis / spremi kao PDF</button><h1>PAR Education · ${e(title)}</h1><p>${e(subtitle)}</p>${
      options.detail
        ? rows
            .map(
              (row) =>
                `<dl>${columns
                  .filter(
                    (c) =>
                      row[c.key] !== undefined &&
                      row[c.key] !== "" &&
                      row[c.key] !== null,
                  )
                  .map(
                    (c) =>
                      `<div><dt>${e(c.label)}</dt><dd>${e(display(row[c.key]))}</dd></div>`,
                  )
                  .join("")}</dl>`,
            )
            .join("")
        : `<table><thead><tr>${columns.map((c) => `<th>${e(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${e(display(row[c.key]))}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    }<footer>Interna evidencija · ${e(new Date().toLocaleString("hr-HR"))} · Ovaj ispis nije službeno ovjeren dokument.</footer></body></html>`,
  );
  popup.document.close();
  popup.document
    .getElementById("print")
    .addEventListener("click", () => popup.print());
}
export function csvContent(columns, rows) {
  const cell = (value) => {
    let text = display(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      columns.map((c) => cell(c.label)).join(";"),
      ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(";")),
    ].join("\r\n")
  );
}
export function exportCSV(title, columns, rows) {
  const csv = csvContent(columns, rows);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
