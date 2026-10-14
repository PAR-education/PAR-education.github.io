import { getFirebase, firebaseConfig } from "../config/firebase.js";
import { assertModules, buildBackup, validateBackup } from "./backup-format.js";
import { rangeBounds } from "../utils/backup-range.js";
export function backupScope(context) {
  const local =
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("emulator") === "1";
  return (
    (context.demo
      ? "demo"
      : local
        ? "demo-par-education"
        : firebaseConfig.projectId) +
    ":" +
    context.user.uid
  );
}
function admin(context) {
  if (context.profile.role !== "admin" || context.profile.active !== true)
    throw new Error("Control panel je dostupan samo aktivnom administratoru.");
}
export function getBackupState(scope) {
  try {
    const value = JSON.parse(
      localStorage.getItem("par-backup-v1:" + scope) || "{}",
    );
    return {
      checkpoints: value.checkpoints || {},
      restored: value.restored || {},
    };
  } catch {
    throw new Error(
      "Lokalna evidencija backupa nije čitljiva. Upotrijebite potpuni backup u drugom pregledniku.",
    );
  }
}
export function setBackupState(scope, state) {
  localStorage.setItem("par-backup-v1:" + scope, JSON.stringify(state));
}
export async function scanModules(context, names) {
  assertModules(names);
  const records = {};
  for (const name of names) {
    if (context.isCurrent && !context.isCurrent())
      throw new Error(
        "Sesija ili prikaz su promijenjeni; operacija je zaustavljena.",
      );
    records[name] = await (context.repository.listAll?.(name) ||
      context.repository.list(name));
  }
  return records;
}
export async function createBackup(context, names, mode, dateRange) {
  admin(context);
  if (mode === "range") rangeBounds(dateRange);
  const scope = backupScope(context),
    state = mode === "range" ? { checkpoints: {} } : getBackupState(scope);
  const records = await scanModules(context, names);
  return buildBackup(
    records,
    names,
    mode,
    state.checkpoints,
    {
      projectId: scope.split(":")[0],
      uid: context.user.uid,
    },
    dateRange,
  );
}
export function confirmBackup(context, pending) {
  admin(context);
  if (pending.backup.mode === "range") return;
  const scope = backupScope(context),
    state = getBackupState(scope);
  Object.assign(state.checkpoints, pending.next);
  setBackupState(scope, state);
}
export function assertRestoreChain(backup, names, state) {
  if (backup.mode !== "incremental") return;
  for (const name of names) {
    if (state.restored[name] === backup.id) continue;
    if (
      state.restored[name] !== backup.baseBackupIds[name] &&
      state.checkpoints[name]?.id !== backup.baseBackupIds[name]
    )
      throw new Error(
        "Za " +
          name +
          " prvo vratite početni/prethodni backup " +
          backup.baseBackupIds[name] +
          ".",
      );
  }
}
function decode(value, sdk) {
  if (value && typeof value === "object" && value.$timestamp)
    return new sdk.Timestamp(
      value.$timestamp.seconds,
      value.$timestamp.nanoseconds,
    );
  if (Array.isArray(value)) return value.map((v) => decode(v, sdk));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v, sdk)]),
    );
  return value;
}
export async function restoreBackup(
  context,
  backup,
  names,
  applyDeletes = false,
) {
  admin(context);
  assertModules(names);
  await validateBackup(backup);
  if (backup.mode === "range" && applyDeletes)
    throw new Error(
      "Backup vremenskog raspona vraća samo uključene zapise; brisanje drugih zapisa nije dopušteno.",
    );
  if (names.some((n) => !Object.hasOwn(backup.modules, n)))
    throw new Error("Odabrani modul nije u backupu.");
  const scope = backupScope(context),
    state = getBackupState(scope);
  if (backup.source.projectId !== scope.split(":")[0])
    throw new Error("Backup pripada drugom Firebase projektu.");
  assertRestoreChain(backup, names, state);
  const self = backup.modules.users?.upserts.find(
    (r) => r.id === context.user.uid,
  );
  if (
    names.includes("users") &&
    self &&
    (self.data.active !== true || self.data.role !== "admin")
  )
    throw new Error(
      "Backup ne smije deaktivirati ili promijeniti administratorsku ulogu vašeg računa.",
    );
  if (
    applyDeletes &&
    names.includes("users") &&
    backup.modules.users.deleted.length
  )
    throw new Error("Korisnički profili se ne brišu preko backupa.");
  // Read and prepare every module before the first write.
  const existing = await scanModules(context, names);
  const plan = [];
  for (const name of names) {
    const part = backup.modules[name],
      old = new Map(existing[name].map((r) => [r.id, r]));
    for (const row of part.upserts)
      plan.push({ name, id: row.id, data: row.data, old: old.get(row.id) });
    if (applyDeletes && name !== "users") {
      const deletions =
        backup.mode === "full"
          ? existing[name]
              .filter((r) => !part.upserts.some((b) => b.id === r.id))
              .map((r) => r.id)
          : part.deleted;
      for (const id of deletions) plan.push({ name, id, delete: true });
    }
  }
  let count = 0;
  const sdkContext = context.demo ? null : await getFirebase();
  for (let offset = 0; offset < plan.length; offset += 200) {
    if (context.isCurrent && !context.isCurrent())
      throw new Error(
        "Operacija je zaustavljena nakon " +
          count +
          " zapisa zbog promjene sesije ili prikaza.",
      );
    const chunk = plan.slice(offset, offset + 200);
    if (context.demo) {
      for (const op of chunk) {
        if (op.delete) await context.repository.remove(op.name, op.id);
        else {
          const list = context.repository.data[op.name],
            index = list.findIndex((r) => r.id === op.id);
          const row = { id: op.id, ...structuredClone(op.data) };
          if (index < 0) list.push(row);
          else list[index] = row;
        }
      }
    } else {
      const { db, firestore: sdk } = sdkContext,
        batch = sdk.writeBatch(db);
      for (const op of chunk) {
        const ref = sdk.doc(db, op.name, op.id);
        if (op.delete) batch.delete(ref);
        else {
          const data = decode(op.data, sdk);
          data.createdAt =
            op.old?.createdAt ||
            (data.createdAt instanceof sdk.Timestamp
              ? data.createdAt
              : sdk.serverTimestamp());
          data.createdBy =
            op.old?.createdBy || data.createdBy || context.user.uid;
          data.updatedAt = sdk.serverTimestamp();
          batch.set(ref, data);
        }
      }
      try {
        await batch.commit();
      } catch (error) {
        throw new Error(
          "Vraćanje zaustavljeno nakon " +
            count +
            " zapisa. Raniji blokovi ostaju spremljeni; ponovite uvoz. " +
            (error.code === "permission-denied"
              ? "Objavite aktualna Firestore pravila."
              : error.message),
        );
      }
    }
    count += chunk.length;
  }
  for (const name of names) state.restored[name] = backup.id;
  setBackupState(scope, state);
  return count;
}
