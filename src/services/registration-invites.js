import { getFirebase } from "../config/firebase.js";
import { enrollmentId } from "../utils/academic-year.js";
import {
  registrationEmail,
  assertRegistrationClaim,
} from "../utils/registration-invites.js";
import { isInstructor, instructorFields } from "../utils/instructors.js";

export async function prepareRegistrationInvite(
  context,
  row,
  course,
  studentId,
  departmentId,
  connect = getFirebase,
) {
  if (
    context.demo ||
    context.profile.role !== "admin" ||
    !context.profile.active
  )
    throw new Error(
      "Priprema je dostupna samo administratoru u stvarnom načinu.",
    );
  if (!course?.id || !course.academicYear || !departmentId.trim())
    throw new Error("Odaberite kolegij, akademsku godinu i odjel.");
  enrollmentId(course.id, "test", course.academicYear);
  const { db, firestore: sdk } = await connect();
  return sdk.runTransaction(db, async (tx) => {
    const courseRef = sdk.doc(db, "courses", course.id),
      inviteRef = sdk.doc(db, "registrationInvites", row.email);
    const currentCourse = await tx.get(courseRef),
      invitation = await tx.get(inviteRef);
    if (
      !currentCourse.exists() ||
      currentCourse.data().academicYear !== course.academicYear ||
      !currentCourse.data().instructorUid
    )
      throw new Error("Provjerite godinu i dodijeljenog nastavnika kolegija.");
    if (invitation.exists() && invitation.data().claimedBy) {
      const old = invitation.data();
      if (
        old.courseId === course.id &&
        old.academicYear === course.academicYear &&
        (!studentId || old.studentId === studentId)
      )
        return { claimed: true, studentId: old.studentId };
      throw new Error(
        "Adresa već ima iskorištenu pripremu upisa. Daljnje upise dodajte kroz evidenciju.",
      );
    }
    if (
      invitation.exists() &&
      (invitation.data().courseId !== course.id ||
        invitation.data().academicYear !== course.academicYear)
    )
      throw new Error(
        "Adresa već ima pripremu za drugi kolegij. Prvo je provjerite.",
      );
    const chosenStudentId =
      studentId ||
      invitation.data()?.studentId ||
      sdk.doc(sdk.collection(db, "students")).id;
    const studentRef = sdk.doc(db, "students", chosenStudentId),
      student = await tx.get(studentRef);
    if (studentId && !student.exists())
      throw new Error("Odabrani dosje više ne postoji.");
    if (
      student.exists() &&
      student.data().email &&
      registrationEmail(student.data().email) !== row.email
    )
      throw new Error("Dosje ima drugu e-adresu: " + row.name);
    const snapshotCourse = { id: currentCourse.id, ...currentCourse.data() };
    if (!isInstructor(snapshotCourse, snapshotCourse.instructorUid))
      throw new Error("Kolegij nema nastavnika.");
    const rows = await context.repository.listAll("enrollments");
    const matches = rows.filter(
      (r) =>
        r.studentId === chosenStudentId &&
        r.courseId === course.id &&
        r.academicYear === course.academicYear,
    );
    if (matches.length > 1)
      throw new Error(
        "Dosje ima više upisa na ovaj kolegij i godinu. Prvo ih uskladite.",
      );
    const enRef = sdk.doc(
      db,
      "enrollments",
      matches[0]?.id ||
        enrollmentId(course.id, chosenStudentId, course.academicYear),
    );
    const enrollment = await tx.get(enRef);
    if (
      enrollment.exists() &&
      (enrollment.data().studentId !== chosenStudentId ||
        enrollment.data().courseId !== course.id ||
        enrollment.data().academicYear !== course.academicYear)
    )
      throw new Error("Postojeći upis ne odgovara dosjeu.");
    if (
      student.data()?.ownerUid &&
      enrollment.data()?.ownerUid &&
      student.data().ownerUid !== enrollment.data().ownerUid
    )
      throw new Error("Dosje i upis pripadaju različitim računima.");
    const meta = { updatedAt: sdk.serverTimestamp() },
      created = {
        ...meta,
        createdAt: sdk.serverTimestamp(),
        createdBy: context.user.uid,
      };
    if (student.exists()) tx.update(studentRef, { email: row.email, ...meta });
    else
      tx.set(studentRef, {
        name: row.name,
        email: row.email,
        departmentId,
        status: "Erasmus",
        ...created,
      });
    const en = {
      studentId: chosenStudentId,
      ownerUid: student.data()?.ownerUid || enrollment.data()?.ownerUid || "",
      ownerName: student.data()?.name || row.name,
      courseId: course.id,
      courseTitle: snapshotCourse.title,
      academicYear: snapshotCourse.academicYear,
      ...instructorFields(snapshotCourse),
      status: "Odobreno",
      ...meta,
    };
    if (enrollment.exists()) tx.update(enRef, en);
    else
      tx.set(enRef, {
        ...en,
        createdAt: sdk.serverTimestamp(),
        createdBy: context.user.uid,
      });
    tx.set(inviteRef, {
      email: row.email,
      studentId: chosenStudentId,
      enrollmentId: enRef.id,
      courseId: course.id,
      academicYear: course.academicYear,
      enabled: true,
      claimedBy: "",
      createdAt: invitation.data()?.createdAt || sdk.serverTimestamp(),
      createdBy: invitation.data()?.createdBy || context.user.uid,
      ...meta,
    });
    return { studentId: chosenStudentId };
  });
}
export async function claimRegistrationInvite(user, connect = getFirebase) {
  if (!user?.email) return false;
  const { db, firestore: sdk } = await connect();
  const email = registrationEmail(user.email);
  return sdk.runTransaction(db, async (tx) => {
    const userRef = sdk.doc(db, "users", user.uid),
      account = await tx.get(userRef);
    if (
      !account.exists() ||
      account.data().role !== "student" ||
      account.data().active !== true
    )
      return false;
    const inviteRef = sdk.doc(db, "registrationInvites", email),
      invitation = await tx.get(inviteRef);
    if (
      !invitation.exists() ||
      !invitation.data().enabled ||
      invitation.data().claimedBy
    )
      return false;
    const invite = invitation.data(),
      studentRef = sdk.doc(db, "students", invite.studentId),
      enRef = sdk.doc(db, "enrollments", invite.enrollmentId);
    const student = await tx.get(studentRef),
      enrollment = await tx.get(enRef);
    assertRegistrationClaim(
      invite,
      account.data(),
      student.data(),
      enrollment.data(),
      user,
    );
    const meta = { updatedAt: sdk.serverTimestamp() };
    tx.update(studentRef, { ownerUid: user.uid, ...meta });
    tx.update(enRef, { ownerUid: user.uid, ...meta });
    tx.update(userRef, {
      name: student.data().name,
      departmentId: student.data().departmentId,
      ...meta,
    });
    tx.update(inviteRef, {
      claimedBy: user.uid,
      claimedAt: sdk.serverTimestamp(),
      ...meta,
    });
    return true;
  });
}
