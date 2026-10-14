import { getFirebase } from "../config/firebase.js";
import { modules } from "../modules/catalog.js";
import { demoData } from "../data/demoData.js";
export function templateValues(name, row) {
  const values = Object.fromEntries(
    modules[name].fields
      .filter(
        (f) => row[f.key] !== undefined && !(f.type === "url" && !row[f.key]),
      )
      .map((f) => [f.key, row[f.key]]),
  );
  for (const key of ["courseId", "examId", "labId", "projectId"])
    if (values[key]) values[key] = "template-" + values[key];
  if (name === "employeeSchedules" && values.startTime === values.endTime)
    values.endTime = "00:01";
  return values;
}
// Existing collections are never replaced; users/Auth accounts are never imported.
export async function importTemplate(profile, uid) {
  if (profile.role !== "admin" || !profile.active)
    throw new Error("Uvoz je dostupan administratoru.");
  const data = await demoData();
  const { db, firestore: sdk } = await getFirebase();
  let imported = 0;
  for (const [name, list] of Object.entries(data)) {
    if (name === "users" || !list.length) continue;
    const existing = await sdk.getDocsFromServer(
      sdk.query(sdk.collection(db, name), sdk.limit(1)),
    );
    if (!existing.empty) continue;
    const batch = sdk.writeBatch(db);
    for (const row of list) {
      // Keep only the fields accepted by the published security rules.
      const values = templateValues(name, row);
      values.createdAt = sdk.serverTimestamp();
      values.updatedAt = sdk.serverTimestamp();
      values.createdBy = uid;
      batch.set(sdk.doc(db, name, "template-" + row.id), values);
    }
    await batch.commit();
    imported += list.length;
  }
  return imported;
}
