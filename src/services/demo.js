import { visibleNotice, validateNotice } from "../utils/notices.js";
import { validateFields } from "../utils/validation.js";
import { modules } from "../modules/catalog.js";
import { notifyChangeSafely } from "./notifications.js";
import { attendanceValues, attendanceId } from "../utils/attendance.js";
import { enrollmentId } from "../utils/academic-year.js";
import { isInstructor, instructorFields } from "../utils/instructors.js";
import { courseScheduleUpdates } from "./course-schedule.js";
import {
  scopeFor,
  canRead,
  canEditCalendar,
  canManage,
  canAdd,
  canDelete,
  staffRoles,
} from "../auth/permissions.js";
import { tuitionInstallments } from "../utils/tuition.js";
import {
  prepareCalendarMove,
  revisionOf,
  teachingConflicts,
} from "../utils/schedule.js";
export class DemoRecords {
  constructor(data, user, profile) {
    this.data = data;
    this.data.auditLog ||= [];
    this.data.archive ||= [];
    this.user = user;
    this.profile = profile;
  }
  async moveCalendar(record, target) {
    if (
      !canEditCalendar(this.profile.role, this.user.uid, record) ||
      this.profile.active !== true
    )
      throw new Error("Nemate ovlasti za promjenu rasporeda.");
    const current = this.data.calendarEvents.find(
      (row) => row.id === record.id,
    );
    if (!current || revisionOf(current) !== revisionOf(record))
      throw new Error(
        "Događaj je izmijenjen ili više ne postoji. Osvježite prikaz.",
      );
    const values = prepareCalendarMove(
      current,
      target,
      this.data.calendarEvents,
    );
    Object.assign(current, values, { updatedAt: new Date().toISOString() });
    await notifyChangeSafely(
      { repository: this, user: this.user, profile: this.profile, demo: true },
      "calendarEvents",
      current.id,
      current,
    );
    return values;
  }
  async list(name) {
    if (!canRead(this.profile.role, name))
      throw new Error("Nemate pristup modulu.");
    const field = scopeFor(this.profile.role, name);
    const value =
      field === "departmentId" ? this.profile.departmentId : this.user.uid;
    return structuredClone(
      (this.data[name] || []).filter((row) =>
        name === "notifications"
          ? visibleNotice(row, this.profile.role, this.user.uid)
          : !field ||
            (field === "instructorUid"
              ? isInstructor(row, value)
              : row[field] === value),
      ),
    );
  }
  async listAll(name) {
    if (
      name === "attendance" &&
      ["student", "profesor"].includes(this.profile.role)
    ) {
      const teacher = this.profile.role === "profesor";
      return structuredClone(
        (this.data.attendance || []).filter((row) =>
          teacher
            ? this.data.courses.some(
                (c) => c.id === row.courseId && isInstructor(c, this.user.uid),
              )
            : this.data.enrollments.some(
                (en) =>
                  en.id === row.enrollmentId && en.ownerUid === this.user.uid,
              ),
        ),
      );
    }
    return this.list(name);
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
      !this.profile.active ||
      (!(
        canManage(role, name) ||
        (!id && canAdd(role, name)) ||
        (role === "student" && name === "attendance")
      ) &&
        (!ownCreation || (id && !["workEntries", "research"].includes(name))))
    )
      throw new Error("Nemate ovlasti za spremanje.");
    if (!canAdd(role, name) || (name === "research" && role !== "admin"))
      values = { ...values, ownerUid: this.user.uid };

    this.data[name] ||= [];
    if (name === "attendance") {
      if (id !== attendanceId(values.eventId, values.enrollmentId))
        throw new Error("Neispravan zapis prisutnosti.");
      const event = this.data.calendarEvents.find(
        (r) => r.id === values.eventId,
      );
      const enrollment = this.data.enrollments.find(
        (r) => r.id === values.enrollmentId,
      );
      if (!event || !enrollment) throw new Error("Termin ili upis ne postoji.");
      values = attendanceValues(
        event,
        enrollment,
        values.status,
        this.profile,
        this.user.uid,
      );
    }
    const old = this.data[name].find((row) => row.id === id);
    if (name === "attendance" && role === "student" && old)
      throw new Error(
        "Prisutnost je već evidentirana. Ispravak radi nastavnik ili studentski ured.",
      );
    if (options.expected && (!old || revisionOf(old) !== options.expected))
      throw new Error(
        "Raspored je u međuvremenu izmijenjen. Osvježite prikaz.",
      );
    if (
      old &&
      role !== "admin" &&
      ["workEntries", "research"].includes(name) &&
      old.ownerUid !== this.user.uid
    )
      throw new Error("Nemate ovlasti za tuđi zapis.");
    if (
      ["calendarEvents", "exams", "grades"].includes(name) &&
      values.courseId
    ) {
      const course = this.data.courses.find((c) => c.id === values.courseId);
      if (
        !course ||
        (role === "profesor" && !isInstructor(course, this.user.uid))
      )
        throw new Error("Odaberite dodijeljeni kolegij.");
      values = {
        ...values,
        ...instructorFields(course),
        ...(["calendarEvents", "exams"].includes(name)
          ? { instructorName: course.instructorName || "" }
          : {}),
      };
    }
    if (name === "calendarEvents") {
      const conflicts = teachingConflicts(this.data.calendarEvents, values, id);
      if (conflicts.length)
        throw new Error("Zauzeto: " + conflicts.map((r) => r.title).join(", "));
    }
    if (name === "courses" && this.profile.role === "admin" && old) {
      const course = { ...old, ...values };
      const changes = courseScheduleUpdates(
        this.data.calendarEvents,
        id,
        course,
      );
      Object.assign(old, values, { updatedAt: new Date().toISOString() });
      for (const change of changes)
        Object.assign(
          this.data.calendarEvents.find((r) => r.id === change.id),
          change,
          { updatedAt: new Date().toISOString() },
        );
      for (const name of ["enrollments", "exams", "examBookings", "grades"])
        for (const row of this.data[name] || [])
          if (row.courseId === id) Object.assign(row, instructorFields(course));
      return { syncedEvents: changes.length };
    }
    if (name === "calendarEvents" && this.profile.role === "profesor") {
      if (old && !isInstructor(old, this.user.uid))
        throw new Error("Nemate ovlasti za tuđu nastavu.");
      if (
        !this.data.courses.some(
          (c) => c.id === values.courseId && isInstructor(c, this.user.uid),
        )
      )
        throw new Error("Odaberite vlastiti dodijeljeni kolegij.");
      values = {
        ...values,
        ...instructorFields(
          this.data.courses.find((c) => c.id === values.courseId),
        ),
      };
    }
    const recordId = id || crypto.randomUUID();
    this.data.auditLog.push({
      id: crypto.randomUUID(),
      module: name,
      recordId,
      action: old ? "update" : "create",
      before: old ? structuredClone(old) : null,
      after: structuredClone(values),
      actorUid: this.user.uid,
      createdAt: new Date().toISOString(),
    });
    if (old)
      Object.assign(old, values, { updatedAt: new Date().toISOString() });
    else
      this.data[name].push({
        ...values,
        id: recordId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: this.user.uid,
      });
    return notifyChangeSafely(
      { repository: this, user: this.user, profile: this.profile, demo: true },
      name,
      recordId,
      { ...old, ...values },
    );
  }
  async remove(name, id) {
    if (!canDelete(this.profile.role, name))
      throw new Error("Nemate ovlasti za brisanje.");
    const row = this.data[name]?.find((r) => r.id === id);
    if (
      !row ||
      name === "users" ||
      (name === "calendarEvents" &&
        !canEditCalendar(this.profile.role, this.user.uid, row))
    )
      throw new Error("Nemate ovlasti za arhiviranje.");
    this.data.archive.push({
      id: crypto.randomUUID(),
      module: name,
      recordId: id,
      data: structuredClone(row),
      actorUid: this.user.uid,
      createdAt: new Date().toISOString(),
    });
    this.data[name] = this.data[name].filter((r) => r.id !== id);
  }
  async requestBooking(name, item) {
    if (this.profile.role !== "student")
      throw new Error("Prijave su dostupne studentima.");
    const id =
      name === "enrollments"
        ? enrollmentId(item.id, this.user.uid, item.academicYear)
        : `${item.id}__${this.user.uid}`;
    if (this.data[name].some((row) => row.id === id))
      throw new Error("Zahtjev za ovu stavku već postoji.");
    const values = {
      id,
      ownerUid: this.user.uid,
      ownerName: this.profile.name,
      status: "Na čekanju",
      createdAt: "Ogledna sesija",
    };
    if (name === "enrollments")
      Object.assign(values, {
        courseId: item.id,
        courseTitle: item.title,
        ...(item.academicYear ? { academicYear: item.academicYear } : {}),
        ...instructorFields(item),
      });
    if (name === "examBookings")
      Object.assign(values, {
        examId: item.id,
        courseId: item.courseId,
        title: item.title,
        ...instructorFields(item),
        date: item.date,
      });
    if (name === "labBookings") {
      if (item.status !== "Dostupno")
        throw new Error("Oprema trenutno nije dostupna.");
      Object.assign(values, { labId: item.id, title: item.title });
    }
    this.data[name].push(values);
  }
  async decide(name, id, status) {
    const row = this.data[name]?.find((r) => r.id === id);
    if (
      !row ||
      row.status !== "Na čekanju" ||
      !["Odobreno", "Odbijeno"].includes(status) ||
      !(
        this.profile.role === "admin" ||
        (this.profile.role === "profesor" &&
          ["enrollments", "examBookings"].includes(name) &&
          isInstructor(row, this.user.uid)) ||
        (this.profile.role === "lab_assistant" && name === "labBookings")
      )
    )
      throw new Error("Nemate ovlasti za tu odluku.");

    Object.assign(
      this.data[name].find((row) => row.id === id),
      { status },
    );
    return notifyChangeSafely(
      { repository: this, user: this.user, profile: this.profile, demo: true },
      name,
      id,
      row,
      status,
    );
  }
  async maintenance(name) {
    if (this.profile.role !== "admin") throw new Error("Samo administrator.");
    return structuredClone(this.data[name] || []);
  }
  async restoreArchive(id) {
    if (this.profile.role !== "admin") throw new Error("Samo administrator.");
    const row = this.data.archive.find((r) => r.id === id);
    if (!row || this.data[row.module].some((r) => r.id === row.recordId))
      throw new Error("Povrat nije moguć bez prepisivanja.");
    if (
      row.module === "calendarEvents" &&
      teachingConflicts(this.data.calendarEvents, row.data).length
    )
      throw new Error("Povrat bi preklopio postojeći termin.");
    this.data[row.module].push({
      ...structuredClone(row.data),
      id: row.recordId,
    });
    row.restoredAt = new Date().toISOString();
  }
  async createTuition(studentId, base, discount, count, date, year) {
    if (this.profile.role !== "admin") throw new Error("Samo administrator.");
    const student = this.data.students.find((row) => row.id === studentId);
    if (
      this.data.finances.some((row) =>
        row.id.startsWith(`tuition-${studentId}-${year}-`),
      )
    )
      throw new Error("Obveze za ovu godinu već postoje.");
    tuitionInstallments(base, discount, count, date).forEach((item, i) =>
      this.data.finances.push({
        id: `tuition-${studentId}-${year}-${i + 1}`,
        ownerUid: student.ownerUid,
        ownerName: student.name,
        title: `Školarina ${year} · ${i + 1}. rata`,
        ...item,
        status: "Dugovanje",
        paymentReference: "",
        createdAt: "Ogledna sesija",
      }),
    );
  }
}
