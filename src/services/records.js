import { getFirebase } from "../config/firebase.js";
import {
  canRead,
  canManage,
  scopeFor,
  staffRoles,
} from "../auth/permissions.js";
import { tuitionInstallments } from "../utils/tuition.js";
export async function readAllRecords(sdk, db, name, field, value) {
  const rows = [];
  let cursor;
  for (;;) {
    const constraints = [sdk.orderBy(sdk.documentId()), sdk.limit(500)];
    if (field) constraints.unshift(sdk.where(field, "==", value));
    if (cursor) constraints.push(sdk.startAfter(cursor));
    const snapshot = await sdk.getDocsFromServer(
      sdk.query(sdk.collection(db, name), ...constraints),
    );
    rows.push(...snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    if (snapshot.size < 500) return rows;
    cursor = snapshot.docs.at(-1);
  }
}
export class Records {
  constructor(user, profile) {
    this.user = user;
    this.profile = profile;
  }
  async listAll(name) {
    if (!canRead(this.profile.role, name))
      throw new Error("Nemate pristup ovom modulu.");
    const { db, firestore: sdk } = await getFirebase();
    const field = scopeFor(this.profile.role, name);
    const value =
      field === "departmentId" ? this.profile.departmentId : this.user.uid;
    if (field && !value) return [];
    return readAllRecords(sdk, db, name, field, value);
  }
  async list(name) {
    if (!canRead(this.profile.role, name))
      throw new Error("Nemate pristup ovom modulu.");
    const { db, firestore: sdk } = await getFirebase();
    const field = scopeFor(this.profile.role, name);
    const value =
      field === "departmentId" ? this.profile.departmentId : this.user.uid;
    if (field && !value) return [];
    const ref = sdk.collection(db, name);
    const query = field
      ? sdk.query(ref, sdk.where(field, "==", value), sdk.limit(250))
      : sdk.query(ref, sdk.limit(250));
    const snapshot = await sdk.getDocsFromServer(query);
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }
  async save(name, values, id) {
    const role = this.profile.role;
    const ownCreation =
      ["requests", "evaluations"].includes(name) ||
      (staffRoles.includes(role) &&
        ["workEntries", "vacations", "research"].includes(name));
    if (
      !canManage(role, name) &&
      (!ownCreation || (id && !["workEntries", "research"].includes(name)))
    )
      throw new Error("Nemate ovlasti za spremanje.");
    const { db, firestore: sdk } = await getFirebase();
    const data = { ...values, updatedAt: sdk.serverTimestamp() };
    if (!canManage(role, name) || (name === "research" && role !== "admin"))
      data.ownerUid = this.user.uid;
    if (!id) {
      data.createdAt = sdk.serverTimestamp();
      data.createdBy = this.user.uid;
    }
    if (name === "users") {
      if (!id) throw new Error("Potreban je Firebase Authentication UID.");
      // Profiles may be preprovisioned only by an existing administrator.
      const ref = sdk.doc(db, "users", id);
      const old = await sdk.getDocFromServer(ref);
      if (!old.exists())
        Object.assign(data, {
          createdAt: sdk.serverTimestamp(),
          createdBy: this.user.uid,
        });
      await sdk.setDoc(ref, data, { merge: true });
    } else if (id) await sdk.updateDoc(sdk.doc(db, name, id), data);
    else await sdk.addDoc(sdk.collection(db, name), data);
  }
  async remove(name, id) {
    if (!canManage(this.profile.role, name))
      throw new Error("Nemate ovlasti za brisanje.");
    const { db, firestore: sdk } = await getFirebase();
    await sdk.deleteDoc(sdk.doc(db, name, id));
  }
  async requestBooking(name, item) {
    if (this.profile.role !== "student")
      throw new Error("Ova radnja je dostupna studentima.");
    const { db, firestore: sdk } = await getFirebase();
    const target =
      name === "enrollments"
        ? "courses"
        : name === "examBookings"
          ? "exams"
          : "labs";
    const ref = sdk.doc(db, name, `${item.id}__${this.user.uid}`);
    await sdk.runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      const source = await transaction.get(sdk.doc(db, target, item.id));
      if (existing.exists())
        throw new Error("Zahtjev za ovu stavku već postoji.");
      if (!source.exists()) throw new Error("Stavka više nije dostupna.");
      const current = source.data();
      if (target === "labs" && current.status !== "Dostupno")
        throw new Error("Oprema trenutno nije dostupna.");
      if (
        target === "exams" &&
        current.date < new Date().toLocaleDateString("sv-SE")
      )
        throw new Error("Ispitni rok je prošao.");
      const data = {
        ownerUid: this.user.uid,
        ownerName: this.profile.name,
        status: "Na čekanju",
        createdAt: sdk.serverTimestamp(),
        updatedAt: sdk.serverTimestamp(),
        createdBy: this.user.uid,
      };
      if (name === "enrollments")
        Object.assign(data, {
          courseId: item.id,
          courseTitle: current.title,
          instructorUid: current.instructorUid,
        });
      if (name === "examBookings")
        Object.assign(data, {
          examId: item.id,
          courseId: current.courseId,
          instructorUid: current.instructorUid,
          title: current.title,
          date: current.date,
        });
      if (name === "labBookings")
        Object.assign(data, { labId: item.id, title: current.title });
      transaction.set(ref, data);
    });
  }
  async decide(name, id, status) {
    if (
      !(
        this.profile.role === "admin" ||
        (this.profile.role === "profesor" &&
          ["enrollments", "examBookings"].includes(name)) ||
        (this.profile.role === "lab_assistant" && name === "labBookings")
      )
    )
      throw new Error("Nemate ovlasti za odluku.");
    const { db, firestore: sdk } = await getFirebase();
    await sdk.updateDoc(sdk.doc(db, name, id), {
      status,
      updatedAt: sdk.serverTimestamp(),
    });
  }
  async createTuition(studentId, base, discount, count, dueDate, year) {
    if (this.profile.role !== "admin")
      throw new Error("Samo administrator može izraditi obveze školarine.");
    if (!/^\d{4}$/.test(year))
      throw new Error("Unesite akademsku godinu kao četiri znamenke.");
    const plan = tuitionInstallments(base, discount, count, dueDate);
    const { db, firestore: sdk } = await getFirebase();
    await sdk.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(
        sdk.doc(db, "students", studentId),
      );
      if (!snapshot.exists()) throw new Error("Student više ne postoji.");
      const student = snapshot.data();
      if (!student.ownerUid)
        throw new Error("Studentu treba dodijeliti Firebase UID.");
      const refs = plan.map((_, i) =>
        sdk.doc(db, "finances", `tuition-${studentId}-${year}-${i + 1}`),
      );
      // Read all possible installment IDs, including a previous model with more installments.
      const existing = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          transaction.get(
            sdk.doc(db, "finances", `tuition-${studentId}-${year}-${i + 1}`),
          ),
        ),
      );
      if (existing.some((doc) => doc.exists()))
        throw new Error(
          "Obveze za ovu akademsku godinu već postoje. Uredite ih u Financijama.",
        );
      plan.forEach((item, i) =>
        transaction.set(refs[i], {
          ownerUid: student.ownerUid,
          ownerName: student.name,
          title: `Školarina ${year}/${Number(year) + 1} · ${i + 1}. rata · osnovica ${base} €, popust ${discount}%`,
          ...item,
          status: "Dugovanje",
          paymentReference: "",
          createdAt: sdk.serverTimestamp(),
          updatedAt: sdk.serverTimestamp(),
          createdBy: this.user.uid,
        }),
      );
    });
  }
}
