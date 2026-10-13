// Deliberately separate from production. All identities below are fictional fixtures.
export async function demoData() {
  const response = await fetch(
    new URL("./prototype-fixtures.json", import.meta.url),
  );
  if (!response.ok) throw new Error("Ogledni podaci nisu dostupni.");
  const old = await response.json();
  const day = new Date().toLocaleDateString("sv-SE");
  const common = {
    createdAt: "Ogledni zapis",
    updatedAt: "Ogledni zapis",
    createdBy: "demo-admin",
  };
  const student = old.students[0];
  const employee = old.employees[1];
  const records = {
    students: old.students.map((row) => ({
      id: String(row.id),
      ownerUid: row.id === 1 ? "demo-student" : `student-${row.id}`,
      name: row.name,
      jmbag: row.jmbag,
      year: row.year,
      status: row.status,
      email: row.email,
      departmentId: "poslovanje",
    })),
    employees: old.employees.map((row) => ({
      id: String(row.id),
      ownerUid: row.id === 2 ? "demo-profesor" : `employee-${row.id}`,
      name: row.name,
      position: row.role,
      email: row.email,
      departmentId: "poslovanje",
    })),
    courses: old.courses.map((row) => ({
      id: String(row.id),
      title: row.title,
      ects: row.ects,
      semester: row.sem,
      instructorUid: "demo-profesor",
      instructorName: employee.name,
      room: row.dvorana,
      day: row.day,
      startTime: `${String(row.timeStart).padStart(2, "0")}:00`,
      endTime: `${String(row.timeEnd).padStart(2, "0")}:00`,
      description: row.description,
      outcomes: row.outcomes.join("\n"),
      literature: row.literature.join("\n"),
    })),
    projects: old.projects.map((row) => ({
      id: String(row.id),
      title: row.name,
      fundingLine: row.fundingLine,
      budget: Number(row.budget.replace(/[^\d]/g, "")),
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      partners: row.partners.join(", "),
      workPackages: row.wps.join("\n"),
      description: row.description,
    })),
    grades: [
      {
        id: "1",
        ownerUid: "demo-student",
        studentName: student.name,
        courseId: "1",
        courseTitle: old.courses[0].title,
        instructorUid: "demo-profesor",
        grade: 5,
        date: day,
      },
    ],
    exams: old.exams.map((row) => ({
      id: String(row.id),
      courseId: String(row.id),
      title: row.course,
      instructorUid: "demo-profesor",
      date: "2026-12-15",
      time: row.time,
      room: row.room,
      capacity: row.capacity,
    })),
    enrollments: [
      {
        id: "1__demo-student",
        ownerUid: "demo-student",
        ownerName: student.name,
        courseId: "1",
        courseTitle: old.courses[0].title,
        instructorUid: "demo-profesor",
        status: "Odobreno",
      },
    ],
    examBookings: [],
    labBookings: [],
    calendarEvents: [
      {
        id: "1",
        title: "Početak nastave · Menadžment",
        date: day,
        time: "10:00",
        room: "Dvorana PAR",
        description: "Ogledni događaj",
      },
    ],
    research: old.research.map((row) => ({
      id: String(row.id),
      ownerUid: "demo-profesor",
      title: row.title,
      authors: employee.name,
      status: {
        Drafting: "U pripremi",
        "Peer Review": "Recenzija",
        Published: "Objavljeno",
      }[row.status],
      projectId: "1",
      description: "Ogledni znanstveni rad",
    })),
    labs: old.labs.map((row) => ({
      id: String(row.id),
      title: row.name,
      tag: row.id_tag,
      category: row.type,
      status: row.status,
    })),
    documents: [
      {
        id: "1",
        title: "Ogledni pravilnik o studiranju",
        category: "Pravilnik",
        date: day,
        url: "https://www.par.hr",
        description: "Ogledna poveznica, bez privatnih datoteka.",
      },
    ],
    requests: [
      {
        id: "1",
        ownerUid: "demo-student",
        ownerName: student.name,
        type: "Prijepis ocjena",
        details: "Potrebno za stipendiju.",
        status: "Na čekanju",
        response: "",
      },
    ],
    finances: [
      {
        id: "1",
        ownerUid: "demo-student",
        ownerName: student.name,
        title: "Školarina · prva rata",
        amount: 1750,
        dueDate: "2026-11-15",
        status: "Dugovanje",
        paymentReference: "Ogledni podaci, ne koristiti za plaćanje.",
      },
    ],
    employeeSchedules: [
      {
        id: "1",
        ownerUid: "demo-profesor",
        ownerName: employee.name,
        departmentId: "poslovanje",
        date: day,
        activity: "Nastava",
        startTime: "08:00",
        endTime: "16:00",
      },
    ],
    workEntries: old.timeEntries.map((row) => ({
      id: String(row.id),
      ownerUid: "demo-profesor",
      ownerName: employee.name,
      date: day,
      category: row.category.includes("Znanstveni")
        ? "Znanstveni rad"
        : row.category,
      hours: row.hours,
      projectId: row.project ? "1" : "",
      description: row.description,
    })),
    vacations: [
      {
        id: "1",
        ownerUid: "demo-profesor",
        ownerName: employee.name,
        startDate: "2026-11-02",
        endDate: "2026-11-06",
        days: 5,
        status: "Na čekanju",
        details: "",
      },
    ],
    alumniEvents: old.alumniEvents.map((row) => ({
      id: String(row.id),
      title: row.title,
      date: "2026-12-20",
      location: row.location,
      description: "Ogledni susret",
    })),
    evaluations: [],
    notifications: [
      {
        id: "1",
        ownerUid: "demo-student",
        title: "Dobrodošli u PAR Education",
        message: "Ovo su ogledni podaci. Promjene ostaju samo u ovoj sesiji.",
      },
    ],
    users: [
      "admin",
      "dept_head",
      "profesor",
      "lab_assistant",
      "student",
      "alumni",
    ].map((role) => ({
      id: `demo-${role}`,
      role,
      name:
        role === "student"
          ? student.name
          : role === "profesor"
            ? employee.name
            : "Ogledni korisnik",
      email: `${role}@example.test`,
      active: true,
      departmentId: "poslovanje",
    })),
  };
  for (const list of Object.values(records))
    list.forEach((row) => Object.assign(row, common));
  return records;
}
