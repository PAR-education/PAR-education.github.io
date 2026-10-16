import { modules } from "../modules/catalog.js";
import { validateFields } from "../utils/validation.js";
import {
  zipSync,
  unzipSync,
  strToU8,
  strFromU8,
} from "../../assets/vendor/fflate/index.js";
import { csvContent } from "../components/export.js";
import { rangeBounds, recordTimestamp } from "../utils/backup-range.js";
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const backupModules = Object.keys(modules);
const own = (o, k) => Object.hasOwn(o, k);
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
export function encodeValue(value) {
  if (
    value &&
    typeof value.toDate === "function" &&
    Number.isInteger(value.seconds)
  )
    return {
      $timestamp: { seconds: value.seconds, nanoseconds: value.nanoseconds },
    };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (object(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encodeValue(v)]),
    );
  return value;
}
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value))
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function assertModules(names) {
  if (
    !Array.isArray(names) ||
    !names.length ||
    new Set(names).size !== names.length ||
    names.some((n) => !backupModules.includes(n))
  )
    throw new Error("Odaberite barem jedan poznati modul.");
}
export async function buildBackup(
  records,
  names,
  mode,
  checkpoint,
  source,
  dateRange,
) {
  assertModules(names);
  if (!["full", "incremental", "range"].includes(mode))
    throw new Error("Nepoznata vrsta backupa.");
  if (
    mode === "incremental" &&
    names.some(
      (n) =>
        !checkpoint[n] ||
        typeof checkpoint[n].id !== "string" ||
        !object(checkpoint[n].hashes),
    )
  )
    throw new Error(
      "Za svaki odabrani modul prvo napravite i potvrdite potpuni backup.",
    );
  const backup = {
    format: "par-erp-backup",
    version: 1,
    id: crypto.randomUUID(),
    mode,
    createdAt: new Date().toISOString(),
    source,
    baseBackupIds: {},
    modules: {},
  };
  const next = {};
  const bounds = mode === "range" ? rangeBounds(dateRange) : null;
  if (bounds) {
    backup.dateRange = {
      from: bounds.from,
      to: bounds.to,
      timeZone: "Europe/Zagreb",
      field: "updatedAt-or-createdAt",
    };
    backup.omittedWithoutTimestamp = {};
  }
  for (const name of names) {
    const hashes = {},
      upserts = [],
      previous = checkpoint[name]?.hashes || {};
    for (const row of records[name]) {
      if (bounds) {
        const stamp = recordTimestamp(row);
        if (stamp === null) {
          backup.omittedWithoutTimestamp[name] =
            (backup.omittedWithoutTimestamp[name] || 0) + 1;
          continue;
        }
        if (stamp < bounds.start || stamp >= bounds.end) continue;
      }
      const id = row.id;
      if (!safeId(id) || own(hashes, id))
        throw new Error(
          "Neispravan ili dupliciran ID zapisa u modulu " + name + ".",
        );
      const allowed = new Set([
        ...modules[name].fields.map((f) => f.key),
        "createdAt",
        "updatedAt",
        "createdBy",
      ]);
      const values = Object.fromEntries(
        Object.entries(row).filter(
          ([key, value]) => allowed.has(key) && value !== undefined,
        ),
      );
      const data = encodeValue(values);
      hashes[id] = await digest(data);
      if (mode !== "incremental" || previous[id] !== hashes[id])
        upserts.push({ id, data });
    }
    const deleted =
      mode === "incremental"
        ? Object.keys(previous).filter((id) => !own(hashes, id))
        : [];
    if (mode === "incremental")
      backup.baseBackupIds[name] = checkpoint[name].id;
    backup.modules[name] = { upserts, deleted };
    if (mode !== "range")
      next[name] = { id: backup.id, createdAt: backup.createdAt, hashes };
  }
  backup.checksum = await digest(backup);
  return { backup, next };
}
function safeId(id) {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    new TextEncoder().encode(id).length <= 1500 &&
    !id.includes("/") &&
    ![".", "..", "__proto__", "constructor", "prototype"].includes(id)
  );
}
export function validateRecord(name, id, data) {
  if (!safeId(id) || !object(data))
    throw new Error("Neispravan zapis u modulu " + name + ".");
  const allowed = new Set([
    ...modules[name].fields.map((f) => f.key),
    "createdAt",
    "updatedAt",
    "createdBy",
  ]);
  if (Object.keys(data).some((k) => !allowed.has(k)))
    throw new Error("Nepoznato polje u modulu " + name + ".");
  for (const field of modules[name].fields) {
    const value = data[field.key];
    if (typeof value === "string" && value.length > (field.maxLength || 2000))
      throw new Error("Predugačko polje " + field.label + ".");
    if (
      field.options &&
      value !== undefined &&
      !(value === "" && !field.required) &&
      !field.options.includes(value)
    )
      throw new Error("Neispravna opcija " + field.label + ".");
    if (
      ["date", "time", "email"].includes(field.type) &&
      typeof value === "string" &&
      value !== value.trim()
    )
      throw new Error("Neispravan format polja " + field.label + ".");
    if (
      field.type === "number" &&
      data[field.key] !== undefined &&
      typeof data[field.key] !== "number"
    )
      throw new Error("Neispravan broj u polju " + field.label + ".");
    if (
      field.type === "checkbox" &&
      data[field.key] !== undefined &&
      typeof data[field.key] !== "boolean"
    )
      throw new Error("Neispravna logička vrijednost.");
    if (
      !["checkbox"].includes(field.type) &&
      data[field.key] !== undefined &&
      !["string", "number"].includes(typeof data[field.key])
    )
      throw new Error("Neispravan tip polja " + field.label + ".");
  }
  if (name === "users" && typeof data.active !== "boolean")
    throw new Error("Profil mora sadržavati logičko polje active.");
  validateFields(
    modules[name].fields.filter((f) => f.type !== "checkbox"),
    data,
  );
  for (const key of ["createdAt", "updatedAt"]) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value === "string" && value.length <= 200) continue; // Public sample sessions have textual metadata.
    if (
      !object(value) ||
      Object.keys(value).length !== 1 ||
      !object(value.$timestamp) ||
      !Number.isInteger(value.$timestamp.seconds) ||
      value.$timestamp.seconds < -62135596800 ||
      value.$timestamp.seconds > 253402300799 ||
      !Number.isInteger(value.$timestamp.nanoseconds) ||
      value.$timestamp.nanoseconds < 0 ||
      value.$timestamp.nanoseconds >= 1e9
    )
      throw new Error("Neispravan datum zapisa.");
  }
  if (
    data.createdBy !== undefined &&
    (typeof data.createdBy !== "string" || data.createdBy.length > 1500)
  )
    throw new Error("Neispravan autor zapisa.");
}
export async function validateBackup(backup) {
  if (
    !object(backup) ||
    backup.format !== "par-erp-backup" ||
    backup.version !== 1 ||
    !["full", "incremental", "range"].includes(backup.mode) ||
    typeof backup.id !== "string" ||
    !backup.id ||
    backup.id.length > 100 ||
    !object(backup.modules) ||
    !object(backup.baseBackupIds)
  )
    throw new Error("Datoteka nije podržani PAR backup verzije 1.");
  assertModules(Object.keys(backup.modules));
  if (backup.mode === "range") rangeBounds(backup.dateRange);
  if (
    !object(backup.source) ||
    typeof backup.source.projectId !== "string" ||
    typeof backup.createdAt !== "string" ||
    !Number.isFinite(Date.parse(backup.createdAt))
  )
    throw new Error("Nedostaju informacije o backupu.");
  const { checksum, ...body } = backup;
  if (checksum !== (await digest(body)))
    throw new Error("Backup je oštećen ili izmijenjen (SHA-256 provjera).");
  let count = 0;
  for (const [name, part] of Object.entries(backup.modules)) {
    if (
      !object(part) ||
      !Array.isArray(part.upserts) ||
      !Array.isArray(part.deleted)
    )
      throw new Error("Neispravan sadržaj modula " + name + ".");
    const ids = new Set();
    for (const row of part.upserts) {
      if (!object(row) || ids.has(row.id))
        throw new Error("Dupliciran ili neispravan zapis.");
      validateRecord(name, row.id, row.data);
      ids.add(row.id);
    }
    for (const id of part.deleted) {
      if (!safeId(id) || ids.has(id))
        throw new Error("Neispravna ili duplicirana oznaka brisanja.");
      ids.add(id);
    }
    if (backup.mode !== "incremental" && part.deleted.length)
      throw new Error("Potpuni backup ne smije imati oznake brisanja.");
    if (
      backup.mode === "incremental" &&
      (typeof backup.baseBackupIds[name] !== "string" ||
        !backup.baseBackupIds[name])
    )
      throw new Error("Nedostaje početni backup za " + name + ".");
    count += ids.size;
  }
  if (count > 50000)
    throw new Error("Backup prelazi ograničenje od 50.000 zapisa.");
  return backup;
}
function csvCell(value) {
  return '"' + JSON.stringify(value).replaceAll('"', '""') + '"';
}
export function backupCSV(backup) {
  const { modules: parts, ...manifest } = backup;
  const rows = [
    ["module", "id", "operation", "data"],
    ["__manifest__", "", "manifest", manifest],
  ];
  for (const [name, part] of Object.entries(parts)) {
    for (const row of part.upserts)
      rows.push([name, row.id, "upsert", row.data]);
    for (const id of part.deleted) rows.push([name, id, "delete", null]);
    if (!part.upserts.length && !part.deleted.length)
      rows.push([name, "", "empty", null]);
  }
  return (
    "\uFEFF" +
    rows
      .map((r, i) =>
        r.map((v) => (i === 0 ? '"' + v + '"' : csvCell(v))).join(";"),
      )
      .join("\r\n")
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ";" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV sadrži nezatvorene navodnike.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export function backupFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.shift()?.join(";") !== "module;id;operation;data")
    throw new Error("Odaberite CSV izrađen u PAR control panelu.");
  const first = rows.shift()?.map((v) => JSON.parse(v));
  if (!first || first[0] !== "__manifest__" || first[2] !== "manifest")
    throw new Error("CSV nema backup manifest.");
  const backup = { ...first[3], modules: {} };
  for (const r of rows) {
    if (r.length !== 4) throw new Error("Neispravan CSV redak.");
    const [name, id, operation, data] = r.map((v) => JSON.parse(v));
    if (!backupModules.includes(name))
      throw new Error("Nepoznat modul u CSV-u.");
    if (!own(backup.modules, name))
      backup.modules[name] = { upserts: [], deleted: [] };
    if (operation === "upsert") backup.modules[name].upserts.push({ id, data });
    else if (operation === "delete") backup.modules[name].deleted.push(id);
    else if (operation !== "empty") throw new Error("Nepoznata CSV operacija.");
  }
  return backup;
}
export function backupFile(backup, format) {
  if (format === "json")
    return {
      content: JSON.stringify(backup, null, 2),
      type: "application/json",
    };
  if (format === "csv")
    return { content: backupCSV(backup), type: "text/csv;charset=utf-8" };
  if (format !== "zip") throw new Error("Nepoznati format backupa.");
  const files = { "backup.json": strToU8(JSON.stringify(backup, null, 2)) };
  for (const [name, part] of Object.entries(backup.modules)) {
    const columns = [
      { key: "id", label: "ID" },
      ...modules[name].fields.map((f) => ({ key: f.key, label: f.label })),
    ];
    files[name + ".csv"] = strToU8(
      csvContent(
        columns,
        part.upserts.map((r) => ({ id: r.id, ...r.data })),
      ),
    );
  }
  return { content: zipSync(files, { level: 6 }), type: "application/zip" };
}
export async function readBackupFile(file) {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Najveća veličina backupa je 25 MB.");
  let text;
  if (file.name.toLowerCase().endsWith(".zip")) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        if (f.originalSize > MAX_BACKUP_BYTES)
          throw new Error("Raspakirani backup prelazi 25 MB.");
        return f.name === "backup.json";
      },
    });
    if (!files["backup.json"]) throw new Error("ZIP nema backup.json.");
    text = strFromU8(files["backup.json"]);
  } else text = await file.text();
  const backup = file.name.toLowerCase().endsWith(".csv")
    ? backupFromCSV(text)
    : JSON.parse(text.replace(/^\uFEFF/, ""));
  return validateBackup(backup);
}
