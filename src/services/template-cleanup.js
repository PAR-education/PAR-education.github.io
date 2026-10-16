import { modules } from "../modules/catalog.js";
import { demoData } from "../data/demoData.js";
import { templateValues } from "./import-template.js";
import { canonical, encodeValue, digest } from "./backup-format.js";
import { scanModules } from "./backup.js";
import { getFirebase } from "../config/firebase.js";
const names = Object.keys(modules).filter((name) => name !== "users");
const ignored = new Set(["id", "createdAt", "updatedAt", "createdBy"]);
const links = {
  courseId: "courses",
  examId: "exams",
  labId: "labs",
  projectId: "projects",
};
const key = (name, id) => name + "/" + id;
export function classifyTemplates(records, fixtures) {
  const confirmed = [],
    retained = [];
  for (const name of names)
    for (const row of records[name] || []) {
      if (!String(row.id).startsWith("template-")) continue;
      const source = fixtures[name]?.find((r) => "template-" + r.id === row.id);
      const expected = source ? templateValues(name, source) : null;
      const unchanged =
        expected &&
        Object.keys(row)
          .filter((k) => !ignored.has(k))
          .every(
            (k) =>
              Object.hasOwn(expected, k) &&
              canonical(encodeValue(row[k])) ===
                canonical(encodeValue(expected[k])),
          );
      const item = {
        name,
        id: row.id,
        title: row.title || row.name || row.subject || row.ownerName || row.id,
        date: row.date || "",
        record: row,
      };
      if (unchanged) confirmed.push(item);
      else
        retained.push({
          ...item,
          reason: source
            ? "Sadržaj je izmijenjen; ostaje u bazi."
            : "ID nije u poznatom predlošku; ostaje u bazi.",
        });
    }
  // Keep a template that a real/changed record still references; propagate to its parents.
  let again = true;
  while (again) {
    again = false;
    const selected = new Set(confirmed.map((r) => key(r.name, r.id)));
    for (let i = confirmed.length - 1; i >= 0; i--) {
      const candidate = confirmed[i];
      let reason = "";
      for (const [name, rows] of Object.entries(records))
        for (const row of rows) {
          if (selected.has(key(name, row.id))) continue;
          if (
            Object.entries(links).some(
              ([field, target]) =>
                target === candidate.name && row[field] === candidate.id,
            )
          )
            reason = `Na zapis se poziva ${name}/${row.id}; ostaje u bazi.`;
        }
      if (reason) {
        retained.push({ ...candidate, reason });
        confirmed.splice(i, 1);
        again = true;
      }
    }
  }
  return { confirmed, retained };
}
function assertLive(context) {
  if (
    context.demo ||
    context.profile.role !== "admin" ||
    context.profile.active !== true
  )
    throw new Error(
      "Pregled i čišćenje dostupni su samo administratoru u stvarnom načinu.",
    );
  if (context.isCurrent && !context.isCurrent())
    throw new Error("Prikaz ili sesija su promijenjeni.");
}
export async function reviewTemplates(context) {
  assertLive(context);
  const records = await scanModules(context, Object.keys(modules)),
    fixtures = await demoData();
  assertLive(context);
  const review = classifyTemplates(records, fixtures);
  for (const row of review.confirmed)
    row.fingerprint = await digest(encodeValue(row.record));
  return review;
}
export async function deleteReviewedTemplates(
  context,
  review,
  selection,
  onProgress = () => {},
  dependencies = {},
) {
  assertLive(context);
  if (!selection.length) throw new Error("Odaberite zapise za čišćenje.");
  const previous = new Map(review.confirmed.map((r) => [key(r.name, r.id), r]));
  if (
    new Set(selection).size !== selection.length ||
    selection.some((k) => !previous.has(k))
  )
    throw new Error("Odabir nije dio pregledanih oglednih zapisa.");
  const fresh = await (dependencies.review || reviewTemplates)(context),
    allowed = new Map(fresh.confirmed.map((r) => [key(r.name, r.id), r]));
  for (const k of selection)
    if (
      !allowed.has(k) ||
      allowed.get(k).fingerprint !== previous.get(k).fingerprint
    )
      throw new Error(
        "Baza se promijenila. Ponovno pregledajte podatke i izradite backup.",
      );
  // A subset must also preserve templates referenced by unselected records.
  const selected = new Set(selection);
  for (const row of fresh.confirmed)
    if (!selected.has(key(row.name, row.id)))
      for (const [field, target] of Object.entries(links))
        if (selected.has(key(target, row.record[field])))
          throw new Error(
            `Odabrani zapis koristi ${row.name}/${row.id}. Promijenite odabir ili zadržite povezani zapis.`,
          );
  const order = [
    "grades",
    "enrollments",
    "examBookings",
    "labBookings",
    "calendarEvents",
    "research",
    "finances",
    "requests",
    "workEntries",
    "vacations",
    "employeeSchedules",
    "evaluations",
    "notifications",
    "documents",
    "alumniEvents",
    "students",
    "employees",
    "exams",
    "courses",
    "labs",
    "projects",
  ];
  const rows = selection
    .map((k) => previous.get(k))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const { db, firestore: sdk } = await (dependencies.connect || getFirebase)();
  let count = 0;
  try {
    for (const row of rows) {
      assertLive(context);
      if (row.name === "users" || !row.id.startsWith("template-"))
        throw new Error("Zaštićen zapis.");
      await sdk.runTransaction(db, async (tx) => {
        const ref = sdk.doc(db, row.name, row.id),
          snapshot = await tx.get(ref);
        if (!snapshot.exists())
          throw new Error(
            "Zapis je u međuvremenu uklonjen. Ponovno pregledajte bazu.",
          );
        if (
          (await digest(
            encodeValue({ ...snapshot.data(), id: snapshot.id }),
          )) !== row.fingerprint
        )
          throw new Error(
            "Zapis je u međuvremenu izmijenjen i nije obrisan: " + row.id,
          );
        assertLive(context);
        tx.delete(ref);
      });
      count++;
      onProgress(count, rows.length);
    }
  } catch (error) {
    throw new Error(
      `Obrisano ${count} od ${rows.length} zapisa. ${error.message}`,
    );
  }
  return count;
}
