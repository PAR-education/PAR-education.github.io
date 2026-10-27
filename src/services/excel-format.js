import { isInstructor } from "../utils/instructors.js";
import { modules } from "../modules/catalog.js";
import { validateFields } from "../utils/validation.js";
import { workValues, workConflicts } from "../utils/work-time.js";
import { canImport } from "../auth/permissions.js";
import {
  teachingConflicts,
  durationOf,
  minutes,
  timeAt,
} from "../utils/schedule.js";
import { digest } from "./backup-format.js";

export const repeatFields = [
  {
    key: "repeat",
    label: "Ponavljanje",
    options: ["Jednom", "Tjedno", "Svaka dva tjedna"],
  },
  { key: "repeatUntil", label: "Do datuma", type: "date" },
  { key: "exceptions", label: "Iznimke (datumi odvojeni zarezom)" },
];
export function importFields(name, role) {
  return [
    { key: "id", label: "ID (prazno za novi zapis)" },
    ...modules[name].fields.filter(
      (f) =>
        !(
          role !== "admin" &&
          !(
            role === "administracija_par" &&
            ["workEntries", "workPlans"].includes(name)
          ) &&
          [
            "ownerUid",
            "ownerName",
            "instructorUid",
            "instructorUids",
            "instructorName",
            "seriesId",
          ].includes(f.key)
        ),
    ),
    ...(name === "calendarEvents" ? repeatFields : []),
  ];
}
export function importHeaders(name, role) {
  return importFields(name, role).map((f) => f.key);
}
function dateValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim(),
    match = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  return match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : s;
}
function timeValue(value) {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  if (typeof value === "number" && value >= 0 && value < 1)
    return timeAt(Math.round(value * 1440));
  return String(value)
    .trim()
    .replace(/^(\d):/, "0$1:");
}
export function normalizeRow(name, row, role, uid, profile, defaults = {}) {
  const values = { ...defaults, ...row };
  for (const field of modules[name].fields) {
    const v = values[field.key];
    if (v === undefined || v === null || v === "") {
      if (field.type === "checkbox") values[field.key] = false;
      continue;
    }
    if (field.type === "date") values[field.key] = dateValue(v);
    else if (field.type === "time") values[field.key] = timeValue(v);
    else if (field.type === "checkbox") {
      if (![true, false, 1, 0, "true", "false", "Da", "Ne"].includes(v))
        throw new Error(field.label + ": koristite Da/Ne.");
      values[field.key] = [true, 1, "true", "Da"].includes(v);
    } else if (field.type === "number")
      values[field.key] = typeof v === "string" ? v.replace(",", ".") : v;
    else if (field.type !== "uids") values[field.key] = String(v).trim();
  }
  if (role !== "admin") {
    if (
      ["workEntries", "research"].includes(name) &&
      !(role === "administracija_par" && name === "workEntries")
    ) {
      values.ownerUid = uid;
      if (modules[name].fields.some((f) => f.key === "ownerName"))
        values.ownerName = profile.name;
    }
    if (name === "calendarEvents") {
      values.instructorUid = uid;
      values.instructorName = profile.name;
    }
  }
  if (name === "calendarEvents" && !values.endTime && values.time)
    values.endTime = timeAt(minutes(values.time) + 120);
  if (name === "enrollments" && !values.ownerUid && !values.studentId)
    throw new Error("Upis zahtijeva Firebase UID ili ID studentskog dosjea.");
  return validateFields(
    modules[name].fields,
    name === "workEntries" ? workValues(values) : values,
  );
}
export function expandTeaching(values, raw) {
  const repeat = raw.repeat || "Jednom",
    until = dateValue(raw.repeatUntil || values.date);
  if (!repeatFields[0].options.includes(repeat))
    throw new Error("Ponavljanje: Jednom, Tjedno ili Svaka dva tjedna.");
  if (repeat !== "Jednom" && !raw.repeatUntil)
    throw new Error("Ponavljanje zahtijeva Do datuma.");
  validateFields(
    [{ key: "date", label: "Do datuma", type: "date", required: true }],
    { date: until },
  );
  if (
    until < values.date ||
    (new Date(until) - new Date(values.date)) / 86400000 > 370
  )
    throw new Error("Ponavljanje mora završiti unutar 370 dana nakon početka.");
  const exceptions = String(raw.exceptions || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(dateValue);
  for (const date of exceptions)
    validateFields(
      [{ key: "date", label: "Iznimka", type: "date", required: true }],
      { date },
    );
  const result = [],
    step = repeat === "Svaka dva tjedna" ? 14 : 7;
  let date = values.date;
  do {
    if (!exceptions.includes(date))
      result.push({
        ...values,
        date,
        day: ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"][
          new Date(date + "T12:00:00Z").getUTCDay()
        ],
      });
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + step);
    date = d.toISOString().slice(0, 10);
  } while (repeat !== "Jednom" && date <= until);
  if (!result.length) throw new Error("Sve termine izostavljaju iznimke.");
  return result;
}
const natural = {
  workEntries: [
    "ownerUid",
    "date",
    "category",
    "activity",
    "startTime",
    "endTime",
    "description",
  ],
  workPlans: ["ownerUid", "month", "category", "activity", "projectId"],
  students: ["jmbag"],
  enrollments: ["studentId", "ownerUid", "courseId", "academicYear"],
  employees: ["email"],
  users: ["id"],
  labs: ["tag"],
  courses: ["title", "semester"],
  calendarEvents: ["courseId", "title", "date", "time", "group", "study"],
};
export async function prepareImport({
  name,
  role,
  uid,
  profile,
  rows,
  existing = [],
  courses = [],
  students = [],
  defaults = {},
  mode = "skip",
}) {
  if (!canImport(role, name))
    throw new Error("Nemate ovlasti za uvoz ovog modula.");
  if (!rows.length || rows.length > 2000)
    throw new Error("Datoteka mora sadržavati 1 do 2000 redaka.");
  const allowed = new Set(importHeaders(name, role)),
    results = [],
    proposed = [];
  const identity = (r) =>
    name === "enrollments"
      ? JSON.stringify([r.studentId || r.ownerUid || "", r.courseId || ""])
      : name === "students"
        ? JSON.stringify(
            r.jmbag
              ? ["jmbag", String(r.jmbag).trim()]
              : r.email
                ? ["email", r.email.trim().toLowerCase()]
                : ["name", r.name.trim().toLowerCase()],
          )
        : JSON.stringify(
            (natural[name] || []).map((k) =>
              String(r[k] || "")
                .trim()
                .toLocaleLowerCase("hr"),
            ),
          );
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    try {
      if (raw.id && !/^[^/\u0000-\u001f]{1,128}$/.test(String(raw.id)))
        throw new Error("ID mora biti tekst bez kose crte, do 128 znakova.");
      if (name === "students" && typeof raw.jmbag === "number")
        throw new Error(
          "JMBAG upišite kao tekst, radi očuvanja početnih nula.",
        );
      const extra = Object.keys(raw).filter((k) => !allowed.has(k));
      if (extra.length)
        throw new Error(
          "Nepoznati stupci: " +
            extra.join(", ") +
            ". Preuzmite predložak za ovu ulogu.",
        );
      let values = normalizeRow(name, raw, role, uid, profile, defaults);
      if (name === "users" && !raw.id)
        throw new Error(
          "Za korisnika je obavezan postojeći Authentication UID u stupcu id.",
        );
      if (
        name === "users" &&
        String(raw.id) === uid &&
        (values.role !== "admin" || values.active !== true)
      )
        throw new Error(
          "Vlastiti administratorski račun ne možete deaktivirati ili promijeniti mu ulogu.",
        );
      if (name === "enrollments") {
        if (!courses.some((c) => c.id === values.courseId))
          throw new Error(
            "Kolegij nije pronađen. Prvo uvezite kolegije; provjerite ID.",
          );
        if (
          values.studentId &&
          !students.some((s) => s.id === values.studentId)
        )
          throw new Error(
            "Studentski dosje nije pronađen. Prvo uvezite studente; provjerite ID.",
          );
      }
      if (name === "calendarEvents") {
        let course = courses.find((c) => c.id === values.courseId);
        if (!course && !values.courseId) {
          const matches = courses.filter((c) => c.title === values.title);
          if (matches.length === 1) course = matches[0];
        }
        if (values.courseId && !course)
          throw new Error("Kolegij nije pronađen.");
        if (role === "profesor" && (!course || !isInstructor(course, uid)))
          throw new Error("Kolegij nije dodijeljen prijavljenom nastavniku.");
        if (course) {
          values.courseId = course.id;
          values.title = course.title;
          values.instructorUid = course.instructorUid || "";
          values.instructorUids = [
            ...new Set(
              [course.instructorUid, ...(course.instructorUids || [])].filter(
                Boolean,
              ),
            ),
          ];
          values.instructorName =
            course.instructorName || values.instructorName || "";
        }
        if (!values.endTime)
          throw new Error("Završetak je obavezan za raspored.");
      }
      const expanded =
        name === "calendarEvents" ? expandTeaching(values, raw) : [values];
      if (name === "calendarEvents" && expanded.length > 1) {
        const seriesId =
          "series-" +
          (
            await digest({
              courseId: values.courseId,
              title: values.title,
              date: values.date,
              time: values.time,
              group: values.group,
              room: values.room,
            })
          ).slice(0, 32);
        expanded.forEach((data) => (data.seriesId = seriesId));
      }
      if (raw.id && expanded.length > 1)
        throw new Error(
          "Za ponavljajuću nastavu ostavite ID prazan. ID služi za jednu postojeću stavku.",
        );
      for (const data of expanded) {
        const sameKey = natural[name]
          ? existing.filter((r) => identity(r) === identity(data))
          : [];
        if (!raw.id && sameKey.length > 1)
          throw new Error(
            "Više postojećih zapisa ima isti ključ. Navedite ID.",
          );
        const old = raw.id
          ? existing.find((r) => r.id === String(raw.id))
          : sameKey[0];
        if (old)
          for (const field of modules[name].fields) {
            if (
              !field.required &&
              !Object.hasOwn(raw, field.key) &&
              !Object.hasOwn(defaults, field.key) &&
              Object.hasOwn(old, field.key) &&
              !(
                role !== "admin" &&
                [
                  "ownerUid",
                  "ownerName",
                  "instructorUid",
                  "instructorUids",
                  "instructorName",
                ].includes(field.key)
              ) &&
              !(
                name === "calendarEvents" &&
                [
                  "courseId",
                  "instructorUid",
                  "instructorUids",
                  "instructorName",
                  "seriesId",
                  "endTime",
                ].includes(field.key)
              )
            )
              data[field.key] = old[field.key];
          }
        if (raw.id && !old && name !== "users")
          throw new Error(
            "ID nije pronađen; za novi zapis ostavite ID prazan.",
          );
        if (
          role !== "admin" &&
          old &&
          ((name === "calendarEvents" && !isInstructor(old, uid)) ||
            (["research", "workEntries"].includes(name) &&
              !(role === "administracija_par" && name === "workEntries") &&
              old.ownerUid !== uid))
        )
          throw new Error("Ne smijete mijenjati tuđi zapis.");
        const id =
          old?.id ||
          (raw.id
            ? String(raw.id)
            : "excel-" +
              (
                await digest({
                  name,
                  key: natural[name] ? identity(data) : data,
                })
              ).slice(0, 40));
        if (proposed.some((p) => p.id === id))
          throw new Error("Dupli zapis u datoteci.");
        const action =
          old || existing.some((r) => r.id === id)
            ? mode === "update"
              ? "update"
              : "skip"
            : "create";
        if (name === "workEntries" && action !== "skip") {
          const all = [
            ...existing.filter(
              (r) =>
                !proposed.some((p) => p.id === r.id && p.action !== "skip"),
            ),
            ...proposed
              .filter((p) => p.action !== "skip")
              .map((p) => ({ ...p.data, id: p.id })),
          ];
          if (workConflicts(all, data, id).length)
            throw new Error("Termin rada preklapa se s postojećom aktivnošću.");
          if (
            all
              .filter(
                (r) =>
                  r.id !== id &&
                  r.ownerUid === data.ownerUid &&
                  r.date === data.date,
              )
              .reduce((s, r) => s + Number(r.hours || 0), Number(data.hours)) >
            24.0001
          )
            throw new Error("Zbroj dnevnih sati ne smije biti veći od 24.");
        }
        if (name === "calendarEvents" && action !== "skip") {
          const conflicts = teachingConflicts(
            [
              ...existing.filter(
                (r) =>
                  !proposed.some((p) => p.id === r.id && p.action !== "skip"),
              ),
              ...proposed
                .filter((p) => p.action !== "skip")
                .map((p) => ({ ...p.data, id: p.id })),
            ],
            data,
            id,
          );
          if (conflicts.length)
            throw new Error(
              `Zauzeto ${data.date} ${data.time}–${data.endTime}: ${conflicts.map((c) => `${c.title} · ${c.room} · ${c.instructorName || "nastavnik nije naveden"}`).join("; ")}`,
            );
        }
        const item = { row: i + 2, id, data, action };
        proposed.push(item);
        results.push(item);
      }
    } catch (error) {
      for (let p = proposed.length - 1; p >= 0; p--)
        if (proposed[p].row === i + 2) proposed.splice(p, 1);
      results.push({ row: i + 2, error: error.message });
    }
    if (results.length > 5000)
      throw new Error("Najviše 5000 termina po uvozu. Podijelite datoteku.");
  }
  // A recurring row is one unit: never silently import only some of its dates.
  const badRows = new Set(results.filter((r) => r.error).map((r) => r.row));
  return results.filter((r) => r.error || !badRows.has(r.row));
}
