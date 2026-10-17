import { enrollmentId } from "../utils/academic-year.js";
import { getFirebase } from "../config/firebase.js";
export function validateStudentLink(student, account, uid) {
  if (
    !student ||
    !account ||
    account.role !== "student" ||
    account.active !== true
  )
    throw new Error("Odaberite aktivan studentski račun.");
  if (account.emailVerificationRequired && !account.emailVerified)
    throw new Error("Student mora potvrditi e-adresu prije povezivanja.");
  if (
    !student.email ||
    student.email.trim().toLowerCase() !== account.email?.trim().toLowerCase()
  )
    throw new Error(
      "E-adresa dosjea mora odgovarati studentskom računu. Prvo provjerite i dopunite dosje.",
    );
  if (student.ownerUid && student.ownerUid !== uid)
    throw new Error("Dosje je već povezan s drugim računom.");
}
export async function linkStudentAccount(
  context,
  studentId,
  uid,
  connect = getFirebase,
) {
  if (
    context.demo ||
    context.profile.role !== "admin" ||
    context.profile.active !== true
  )
    throw new Error(
      "Povezivanje je dostupno administratoru u stvarnom načinu.",
    );
  const rows = (await context.repository.listAll("enrollments")).filter(
    (r) => r.studentId === studentId,
  );
  if (rows.length > 200)
    throw new Error(
      "Previše upisa za jednu operaciju; obratite se administratoru sustava.",
    );
  const { db, firestore: sdk } = await connect();
  return sdk.runTransaction(db, async (tx) => {
    const studentRef = sdk.doc(db, "students", studentId),
      userRef = sdk.doc(db, "users", uid);
    const student = await tx.get(studentRef),
      user = await tx.get(userRef);
    validateStudentLink(
      student.exists() ? student.data() : null,
      user.exists() ? user.data() : null,
      uid,
    );
    const transfers = [];
    for (const row of rows) {
      const ref = sdk.doc(db, "enrollments", row.id),
        source = await tx.get(ref);
      if (!source.exists() || source.data().studentId !== studentId)
        throw new Error("Upisi su se promijenili. Ponovite povezivanje.");
      const data = source.data();
      if (data.ownerUid && data.ownerUid !== uid)
        throw new Error("Upis pripada drugom računu.");
      const targetRef = sdk.doc(
          db,
          "enrollments",
          enrollmentId(data.courseId, uid, data.academicYear),
        ),
        target = await tx.get(targetRef);
      if (
        target.exists() &&
        (target.data().ownerUid !== uid ||
          target.data().courseId !== data.courseId ||
          (target.data().studentId && target.data().studentId !== studentId))
      )
        throw new Error("Postojeći upis ne odgovara dosjeu.");
      transfers.push({
        ref,
        targetRef,
        data,
        target: target.exists() ? target.data() : null,
      });
    }
    for (const { ref, targetRef, data, target } of transfers) {
      tx.set(targetRef, {
        ...data,
        ...(target || {}),
        studentId,
        ownerUid: uid,
        updatedAt: sdk.serverTimestamp(),
      });
      if (ref.path !== targetRef.path) tx.delete(ref);
    }
    tx.update(studentRef, { ownerUid: uid, updatedAt: sdk.serverTimestamp() });
    return transfers.length;
  });
}
