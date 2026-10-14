import { scopeFor, canRead } from "../auth/permissions.js";
import { tuitionInstallments } from "../utils/tuition.js";
import { prepareCalendarMove, revisionOf } from "../utils/schedule.js";
export class DemoRecords {
  constructor(data, user, profile) {
    this.data = data;
    this.user = user;
    this.profile = profile;
  }
  async moveCalendar(record, target) {
    if (this.profile.role !== "admin" || this.profile.active !== true)
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
    return values;
  }
  async list(name) {
    if (!canRead(this.profile.role, name))
      throw new Error("Nemate pristup modulu.");
    const field = scopeFor(this.profile.role, name);
    const value =
      field === "departmentId" ? this.profile.departmentId : this.user.uid;
    return structuredClone(
      this.data[name].filter((row) => !field || row[field] === value),
    );
  }
  async save(name, values, id) {
    const old = this.data[name].find((row) => row.id === id);
    if (old) Object.assign(old, values);
    else
      this.data[name].push({
        ...values,
        id: id || crypto.randomUUID(),
        createdAt: "Ogledna sesija",
        updatedAt: "Ogledna sesija",
        createdBy: this.user.uid,
      });
  }
  async remove(name, id) {
    this.data[name] = this.data[name].filter((row) => row.id !== id);
  }
  async requestBooking(name, item) {
    const id = `${item.id}__${this.user.uid}`;
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
        instructorUid: item.instructorUid,
      });
    if (name === "examBookings")
      Object.assign(values, {
        examId: item.id,
        courseId: item.courseId,
        title: item.title,
        instructorUid: item.instructorUid,
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
    Object.assign(
      this.data[name].find((row) => row.id === id),
      { status },
    );
  }
  async createTuition(studentId, base, discount, count, date, year) {
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
