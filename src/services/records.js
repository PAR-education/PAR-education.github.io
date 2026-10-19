import { audiencesFor, validateNotice } from "../utils/notices.js";
import { validateFields } from "../utils/validation.js";
import { modules } from "../modules/catalog.js";
import { notifyChangeSafely, saveAnnouncementRecord } from "./notifications.js";
import { saveAttendanceRecord } from "./attendance.js";
import { enrollmentId } from "../utils/academic-year.js";
import { saveCalendarRecord } from "./calendar-save.js";
import { appendAudit, archiveRecord, restoreArchived } from "./audit.js";
import { isInstructor, instructorFields } from "../utils/instructors.js";
import { saveCourseAndSchedule } from "./course-schedule.js";
import { getFirebase } from "../config/firebase.js";
import {
  canRead,
  canManage,
  canAdd,
  canDelete,
  scopeFor,
  staffRoles,
  canEditCalendar,
} from "../auth/permissions.js";
import { tuitionInstallments } from "../utils/tuition.js";
import { prepareCalendarMove, revisionOf } from "../utils/schedule.js";
export async function readAllRecords(sdk, db, name, field, value) {
  const rows = [];
  let cursor;
  for (;;) {
    const constraints = [sdk.orderBy(sdk.documentId()), sdk.limit(500)];
    if (field)
      constraints.unshift(
        field === "instructorUid"
          ? sdk.or(
              sdk.where("instructorUid", "==", value),
              sdk.where("instructorUids", "array-contains", value),
            )
          : sdk.where(field, "==", value),
      );
    if (cursor) constraints.push(sdk.startAfter(cursor));
    const snapshot = await sdk.getDocsFromServer(
      sdk.query(sdk.collection(db, name), ...constraints),
    );
    rows.push(...snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    if (snapshot.size < 500) return rows;
    cursor = snapshot.docs.at(-1);
  }
}
// Import IDs must be created deterministically, not updated before they exist.
export async function writeImportedRecord(sdk, db, name, id, values, uid) {
  const ref = sdk.doc(db, name, id);
  return sdk.runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    const data = { ...values, updatedAt: sdk.serverTimestamp() };
    if (name === "notifications" && values.audience && !id)
      return saveAnnouncementRecord(sdk, db, this.user, this.profile, values);
    if (current.exists()) {
      tx.update(ref, data);
      appendAudit(
        tx,
        sdk,
        db,
        name,
        id,
        current.data(),
        { ...current.data(), ...data },
        uid,
      );
    } else {
      const after = {
        ...data,
        createdAt: sdk.serverTimestamp(),
        createdBy: uid,
      };
      tx.set(ref, after);
      appendAudit(tx, sdk, db, name, id, null, after, uid);
    }
  });
}
export class Records {
  constructor(user, profile) {
    this.user = user;
    this.profile = profile;
  }
  async moveCalendar(record, target) {
    if (
      this.profile.active !== true ||
      !canEditCalendar(this.profile.role, this.user.uid, record)
    )
      throw new Error("Nemate ovlasti za promjenu rasporeda.");
    const events = await this.listAll("calendarEvents");
    const values = prepareCalendarMove(record, target, events);
    const { db, firestore: sdk } = await getFirebase();
    const saved = await saveCalendarRecord(
      sdk,
      db,
      this.user,
      this.profile,
      { ...record, ...values },
      record.id,
      { expected: revisionOf(record) },
    );
    return {
      ...saved,
      ...(await notifyChangeSafely(
        { repository: this, user: this.user, profile: this.profile },
        "calendarEvents",
        record.id,
        { ...record, ...values },
      )),
    };
  }

  async listAll(name) {
    if (!canRead(this.profile.role, name))
      throw new Error("Nemate pristup ovom modulu.");
    const { db, firestore: sdk } = await getFirebase();
    const field = scopeFor(this.profile.role, name);
    if (name === "notifications" && this.profile.role !== "admin") {
      const pages = await Promise.all([
        readAllRecords(sdk, db, name, "ownerUid", this.user.uid),
        ...audiencesFor(this.profile.role).map((audience) =>
          readAllRecords(sdk, db, name, "audience", audience),
        ),
      ]);
      return [...new Map(pages.flat().map((row) => [row.id, row])).values()];
    }
    if (
      name === "attendance" &&
      ["profesor", "student"].includes(this.profile.role)
    ) {
      const teacher = this.profile.role === "profesor";
      const sources = await this.listAll(teacher ? "courses" : "enrollments");
      const selected = teacher
        ? sources.filter((r) => isInstructor(r, this.user.uid))
        : sources;
      const pages = await Promise.all(
        selected.map((r) =>
          readAllRecords(
            sdk,
            db,
            name,
            teacher ? "courseId" : "enrollmentId",
            r.id,
          ),
        ),
      );
      return [...new Map(pages.flat().map((r) => [r.id, r])).values()];
    }
    const value =
      field === "departmentId" ? this.profile.departmentId : this.user.uid;
    if (field && !value) return [];
    return readAllRecords(sdk, db, name, field, value);
  }
  async list(name) {
    return this.listAll(name);
  }
  async save(name, values, id, options = {}) {
    const role = this.profile.role;
    if (!canRead(role, name))
      throw new Error("Nemate ovlasti za ovu evidenciju.");
    if (
      role === "administracija_par" &&
      ["students", "employees"].includes(name) &&
      values.ownerUid
    )
      throw new Error("Korisnički račun s dosjeom povezuje administrator.");
    if (name === "notifications") {
      values = validateFields(modules.notifications.fields, values);
      validateNotice(values, role);
    }
    const ownCreation =
      ["requests", "evaluations"].includes(name) ||
      (staffRoles.includes(role) &&
        ["workEntries", "vacations", "research"].includes(name));
    if (
      !(canManage(role, name) || (!id && canAdd(role, name))) &&
      (!ownCreation || (id && !["workEntries", "research"].includes(name)))
    )
      throw new Error("Nemate ovlasti za spremanje.");
    const { db, firestore: sdk } = await getFirebase();
    const data = { ...values, updatedAt: sdk.serverTimestamp() };
    if (name === "notifications" && values.audience && !id)
      return saveAnnouncementRecord(sdk, db, this.user, this.profile, values);
    if (name === "attendance")
      return saveAttendanceRecord(sdk, db, this.user, this.profile, values, id);
    if (name === "calendarEvents") {
      const saved = await saveCalendarRecord(
        sdk,
        db,
        this.user,
        this.profile,
        values,
        id || sdk.doc(sdk.collection(db, name)).id,
        { expected: options.expected },
      );
      return {
        ...saved,
        ...(await notifyChangeSafely(
          { repository: this, user: this.user, profile: this.profile },
          name,
          saved.id,
          saved.record || values,
        )),
      };
    }
    if (name === "courses" && role === "admin") {
      const courseId = id || sdk.doc(sdk.collection(db, "courses")).id;
      return saveCourseAndSchedule(
        sdk,
        db,
        courseId,
        values,
        this.user.uid,
        !id || options.import === true,
      );
    }
    if (
      ["exams", "grades", "enrollments", "examBookings"].includes(name) &&
      data.courseId
    ) {
      const course = await sdk.getDocFromServer(
        sdk.doc(db, "courses", data.courseId),
      );
      if (
        !course.exists() ||
        (role === "profesor" && !isInstructor(course.data(), this.user.uid))
      )
        throw new Error("Odaberite dodijeljeni kolegij.");
      Object.assign(
        data,
        instructorFields(course.data()),
        ...(course.data().academicYear
          ? [{ academicYear: course.data().academicYear }]
          : []),
      );
    }
    if (!canAdd(role, name) || (name === "research" && role !== "admin"))
      data.ownerUid = this.user.uid;
    if (!id) {
      data.createdAt = sdk.serverTimestamp();
      data.createdBy = this.user.uid;
    }
    if (options.import && id && name !== "users")
      return writeImportedRecord(sdk, db, name, id, data, this.user.uid);
    if (name === "users") {
      if (!id) throw new Error("Potreban je Firebase Authentication UID.");
      await writeImportedRecord(sdk, db, name, id, data, this.user.uid);
    } else
      await writeImportedRecord(
        sdk,
        db,
        name,
        id || sdk.doc(sdk.collection(db, name)).id,
        data,
        this.user.uid,
      );
  }
  async remove(name, id) {
    if (!canDelete(this.profile.role, name))
      throw new Error("Nemate ovlasti za brisanje.");
    const { db, firestore: sdk } = await getFirebase();
    await archiveRecord(sdk, db, name, id, this.user.uid);
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
    const ref = sdk.doc(
      db,
      name,
      name === "enrollments"
        ? enrollmentId(item.id, this.user.uid, item.academicYear)
        : `${item.id}__${this.user.uid}`,
    );
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
          ...(current.academicYear
            ? { academicYear: current.academicYear }
            : {}),
          ...instructorFields(current),
        });
      if (name === "examBookings")
        Object.assign(data, {
          examId: item.id,
          courseId: current.courseId,
          ...instructorFields(current),
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
    if (
      !["Odobreno", "Odbijeno"].includes(status) ||
      !["enrollments", "examBookings", "labBookings", "vacations"].includes(
        name,
      )
    )
      throw new Error("Neispravna odluka.");
    let row;
    await sdk.runTransaction(db, async (tx) => {
      const ref = sdk.doc(db, name, id),
        old = await tx.get(ref);
      if (!old.exists() || old.data().status !== "Na čekanju")
        throw new Error("Prijava više nije na čekanju. Osvježite prikaz.");
      row = old.data();
      if (this.profile.role === "profesor" && !isInstructor(row, this.user.uid))
        throw new Error("Nemate ovlasti za ovu prijavu.");
      const after = { ...row, status, updatedAt: sdk.serverTimestamp() };
      tx.update(ref, { status, updatedAt: sdk.serverTimestamp() });
      appendAudit(tx, sdk, db, name, id, row, after, this.user.uid);
    });
    return notifyChangeSafely(
      { repository: this, user: this.user, profile: this.profile },
      name,
      id,
      row,
      status,
    );
  }
  async maintenance(name) {
    if (this.profile.role !== "admin") throw new Error("Samo administrator.");
    const { db, firestore: sdk } = await getFirebase();
    return readAllRecords(sdk, db, name);
  }
  async restoreArchive(id) {
    if (this.profile.role !== "admin") throw new Error("Samo administrator.");
    const { db, firestore: sdk } = await getFirebase();
    const archived = await sdk.getDocFromServer(sdk.doc(db, "archive", id));
    if (archived.exists() && archived.data().module === "calendarEvents") {
      const row = archived.data();
      await saveCalendarRecord(
        sdk,
        db,
        this.user,
        this.profile,
        row.data,
        row.recordId,
        { requireNew: true, original: row.data, action: "restore" },
      );
      await sdk.updateDoc(archived.ref, {
        restoredAt: sdk.serverTimestamp(),
        restoredBy: this.user.uid,
      });
      return;
    }
    return restoreArchived(sdk, db, id, this.user.uid);
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
