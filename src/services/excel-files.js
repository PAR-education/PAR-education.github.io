import { modules } from "../modules/catalog.js";
import { importFields } from "./excel-format.js";
import { unzipSync } from "../../assets/vendor/fflate/index.js";
let loader;
export function excelLibrary() {
  return (loader ||= new Promise((resolve, reject) => {
    if (globalThis.ExcelJS) return resolve(globalThis.ExcelJS);
    const script = document.createElement("script");
    script.src = new URL(
      "../../assets/vendor/exceljs/exceljs.min.js",
      import.meta.url,
    ).href;
    script.onload = () => resolve(globalThis.ExcelJS);
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error("Excel biblioteka nije dostupna."));
    };
    document.head.append(script);
  }));
}
export function downloadFile(
  content,
  name,
  type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function makeWorkbook(Excel, name, role, lookups = {}) {
  const book = new Excel.Workbook();
  book.creator = "PAR Education";
  const fields = importFields(name, role),
    data = book.addWorksheet("Podaci");
  data.columns = fields.map((f) => ({
    header: f.key,
    key: f.key,
    width: Math.max(18, Math.min(34, f.label.length + 2)),
  }));
  data.views = [{ state: "frozen", ySplit: 1 }];
  data.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: fields.length },
  };
  data.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  data.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF233E8F" },
  };
  data.getRow(1).height = 28;
  const lists = book.addWorksheet("Izbori");
  let col = 1;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i],
      options = field.options || lookups[field.key];
    if (options?.length) {
      lists.getCell(1, col).value = field.label;
      options
        .slice(0, 2000)
        .forEach((v, j) => (lists.getCell(j + 2, col).value = String(v)));
      const letter = lists.getColumn(col).letter;
      for (let r = 2; r <= 501; r++)
        data.getCell(r, i + 1).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [
            `'Izbori'!$${letter}$2:$${letter}$${Math.min(options.length, 2000) + 1}`,
          ],
        };
      lists.getColumn(col).width = 35;
      col++;
    }
    for (let r = 2; r <= 501; r++) data.getCell(r, i + 1).numFmt = "@";
  }
  const info = book.addWorksheet("Upute");
  if (lookups._courses?.length) {
    const refs = book.addWorksheet("Kolegiji");
    refs.columns = [
      { header: "courseId", key: "id", width: 24 },
      { header: "Kolegij", key: "title", width: 45 },
      { header: "Nastavnik", key: "instructorName", width: 40 },
      { header: "instructorUid", key: "instructorUid", width: 32 },
    ];
    lookups._courses.forEach((c) =>
      refs.addRow({
        id: c.id,
        title: c.title,
        instructorName: c.instructorName,
        instructorUid: c.instructorUid,
      }),
    );
    refs.getRow(1).font = { bold: true };
  }
  info.columns = [{ width: 35 }, { width: 100 }];
  info.addRows([
    ["PAR Education", modules[name].title],
    [
      "Kako ispuniti",
      "Popunite Podaci od retka 2. Ne mijenjajte zaglavlja. Datumi YYYY-MM-DD ili DD.MM.YYYY.; vrijeme HH:mm. ID/JMBAG/UID pišite kao tekst.",
    ],
    [
      "Primjeri",
      "date: 2026-10-19; time: 10:00; endTime: 11:30; jmbag: 0012345678; repeat: Tjedno; repeatUntil: 2027-01-25; exceptions: 2026-12-28,2027-01-04",
    ],
    [
      "ID",
      "Prazno za novi zapis. Za ažuriranje kopirajte ID iz detalja postojećeg zapisa. Studenti se povezuju po JMBAG-u, oprema po oznaci, zaposlenici po e-mailu.",
    ],
    [
      "Računi",
      "Uvoz studenata ne stvara račune za prijavu. ownerUid je opcionalna veza na postojeći račun. Uvoz users zahtijeva postojeći Authentication UID.",
    ],
    [
      "Ponavljanje",
      "Samo raspored: Jednom / Tjedno / Svaka dva tjedna. Obavezan završni datum, najviše 370 dana. Iznimke su datumi odvojeni zarezom.",
    ],
    [
      "Ovlasti",
      role === "admin"
        ? "Administratorski uvoz. Pregledajte posebno uloge, financije i UID veze."
        : "Možete uvoziti samo vlastite/dodijeljene zapise; identitet se dodjeljuje iz prijave.",
    ],
    [
      "Sigurnost",
      "Formule, makronaredbe i spojene ćelije nisu podržane. Uvoz ide tek nakon pregleda i potvrde; nikad ne briše druge zapise.",
    ],
    [],
    ["Stupac", "Opis / obavezno / dopuštene vrijednosti"],
    ...fields.map((f) => [
      f.key,
      `${f.label}${f.required ? " · OBAVEZNO" : " · opcionalno"}${f.options ? " · " + f.options.join(" / ") : ""}`,
    ]),
  ]);
  info.getRow(1).font = { bold: true, color: { argb: "FF233E8F" } };
  info.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = 44;
  });
  return book;
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV ima nezatvorene navodnike.");
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}
export function rowsToObjects(rows) {
  if (rows.length > 2001) throw new Error("Najviše 2000 redaka po datoteci.");
  const headers = rows[0]?.map((v) => String(v || "").trim());
  if (
    !headers?.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Zaglavlja nedostaju ili se ponavljaju.");
  return rows.slice(1).map((row) => {
    if (row.length > headers.length)
      throw new Error("Redak ima više ćelija od zaglavlja.");
    return Object.fromEntries(
      headers
        .filter(
          (h, i) => row[i] !== undefined && row[i] !== null && row[i] !== "",
        )
        .map((h) => [h, row[headers.indexOf(h)]]),
    );
  });
}
export async function readExcelFile(file) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Datoteka smije imati najviše 10 MB.");
  if (/\.json$/i.test(file.name)) return parseImportJSON(await file.text());
  if (/\.csv$/i.test(file.name))
    return rowsToObjects(parseCSV(await file.text()));
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Podržani su .xlsx, .json i .csv, bez makronaredbi.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let size = 0;
  unzipSync(bytes, {
    filter: (entry) => {
      size += entry.originalSize;
      if (size > 40 * 1024 * 1024)
        throw new Error("Raspakirani Excel prelazi 40 MB.");
      return false;
    },
  });
  const Excel = await excelLibrary(),
    book = new Excel.Workbook();
  await book.xlsx.load(bytes, {
    ignoreNodes: ["drawing", "picture", "extLst"],
  });
  const sheet = book.getWorksheet("Podaci") || book.worksheets[0];
  if (!sheet) throw new Error("Nema lista Podaci.");
  if (sheet.rowCount > 2001 || sheet.columnCount > 80)
    throw new Error("Najviše 2000 redaka i 80 stupaca.");
  const rows = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (cell.isMerged) throw new Error("Spojene ćelije nisu podržane.");
      const v = cell.value;
      if (v && typeof v === "object" && !(v instanceof Date))
        throw new Error(
          `Ćelija ${cell.address}: koristite običan tekst/broj, bez formula i poveznica.`,
        );
      values[col - 1] = v;
    });
    rows.push(values);
  });
  while (
    rows.length > 1 &&
    !rows.at(-1).some((v) => v !== null && v !== undefined && v !== "")
  )
    rows.pop();
  return rowsToObjects(rows);
}
export function parseImportJSON(text) {
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "JSON nije ispravan. Koristite popis zapisa u uglatim zagradama [...].",
    );
  }
  if (!Array.isArray(value))
    throw new Error(
      "Uvoz modula očekuje JSON popis zapisa [...]. PAR backup učitajte u Control panelu.",
    );
  if (!value.length || value.length > 2000)
    throw new Error("JSON mora sadržavati 1 do 2000 zapisa.");
  return value.map((row, i) => {
    if (!row || Array.isArray(row) || typeof row !== "object")
      throw new Error(`JSON zapis ${i + 1} mora biti objekt.`);
    if (Object.keys(row).length > 80)
      throw new Error(`JSON zapis ${i + 1}: najviše 80 polja.`);
    for (const [key, v] of Object.entries(row)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Nedopušten naziv JSON polja.");
      if (
        key === "instructorUids" &&
        Array.isArray(v) &&
        v.length <= 10 &&
        v.every((id) => typeof id === "string" && id.length <= 200)
      )
        continue;
      if (v !== null && !["string", "number", "boolean"].includes(typeof v))
        throw new Error(
          `JSON zapis ${i + 1}, ${key}: koristite običnu vrijednost, bez ugniježđenih objekata ili popisa.`,
        );
    }
    return row;
  });
}
export function flatTemplate(name, role, format) {
  const fields = importFields(name, role),
    row = Object.fromEntries(
      fields.map((f) => [f.key, f.type === "checkbox" ? false : ""]),
    );
  if (format === "json") return JSON.stringify([row], null, 2);
  return "\uFEFF" + fields.map((f) => f.key).join(";") + "\r\n";
}
