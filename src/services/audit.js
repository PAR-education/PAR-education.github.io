export function appendAudit(
  tx,
  sdk,
  db,
  module,
  recordId,
  before,
  after,
  actorUid,
  action,
) {
  const ref = sdk.doc(sdk.collection(db, "auditLog"));
  tx.set(ref, {
    module,
    recordId,
    action: action || (before ? "update" : "create"),
    before: before || null,
    after: after || null,
    actorUid,
    createdAt: sdk.serverTimestamp(),
  });
}
export async function archiveRecord(sdk, db, module, id, actorUid) {
  if (module === "users")
    throw new Error("Korisnički računi ne mogu se arhivirati ovim alatom.");
  const ref = sdk.doc(db, module, id),
    archiveRef = sdk.doc(sdk.collection(db, "archive"));
  return sdk.runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error("Zapis više ne postoji.");
    const data = snapshot.data();
    tx.set(archiveRef, {
      module,
      recordId: id,
      data,
      actorUid,
      createdAt: sdk.serverTimestamp(),
    });
    tx.delete(ref);
    appendAudit(tx, sdk, db, module, id, data, null, actorUid, "archive");
  });
}
export async function restoreArchived(sdk, db, archiveId, actorUid) {
  return sdk.runTransaction(db, async (tx) => {
    const archiveRef = sdk.doc(db, "archive", archiveId),
      snapshot = await tx.get(archiveRef);
    if (!snapshot.exists()) throw new Error("Arhivirani zapis nije pronađen.");
    const archived = snapshot.data();
    if (archived.module === "users") throw new Error("Zaštićen zapis.");
    const ref = sdk.doc(db, archived.module, archived.recordId),
      current = await tx.get(ref);
    if (current.exists())
      throw new Error(
        "Zapis s tim ID-em već postoji. Povrat ne prepisuje postojeće podatke.",
      );
    const after = { ...archived.data, updatedAt: sdk.serverTimestamp() };
    tx.set(ref, after);
    tx.update(archiveRef, {
      restoredAt: sdk.serverTimestamp(),
      restoredBy: actorUid,
    });
    appendAudit(
      tx,
      sdk,
      db,
      archived.module,
      archived.recordId,
      null,
      after,
      actorUid,
      "restore",
    );
  });
}
