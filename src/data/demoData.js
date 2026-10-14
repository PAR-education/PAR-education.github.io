// Original professor's prototype, isolated from live user profiles.
export async function demoData() {
  const response = await fetch(
    new URL("./prototype-fixtures.json", import.meta.url),
  );
  if (!response.ok) throw new Error("Predložak nije dostupan.");
  const old = await response.json();
  const iso = (s) => s?.split(".").reverse().join("-");
  const su = (id) => (id === 1 ? "demo-student" : "student-" + id);
  const eu = (id) => (id === 2 ? "demo-profesor" : "employee-" + id);
  const studentName = (n) => old.students.find((s) => s.name === n);
  const courseName = (n) =>
    old.courses.find((c) => c.title === n) || old.courses[8];
  const records = {
    students: old.students.map((r) => ({
      id: String(r.id),
      ownerUid: su(r.id),
      name: r.name,
      jmbag: r.jmbag,
      email: r.email,
      year: r.year,
      status: r.status,
      departmentId: "poslovanje",
      gpa: r.gpa,
      ects: r.ects,
    })),
    employees: old.employees.map((r) => ({
      id: String(r.id),
      ownerUid: eu(r.id),
      name: r.name,
      position: r.role,
      email: r.email,
      departmentId: "poslovanje",
      departmentName: r.dept,
    })),
    courses: old.courses.map((r) => ({
      id: String(r.id),
      title: r.title,
      ects: r.ects,
      semester: r.sem,
      instructorUid: "demo-profesor",
      instructorName: r.prof,
      room: r.dvorana,
      day: r.day,
      startTime: String(r.timeStart).padStart(2, "0") + ":00",
      endTime: String(r.timeEnd).padStart(2, "0") + ":00",
      description: r.description,
      outcomes: r.outcomes.join("\n"),
      literature: r.literature.join("\n"),
      courseType: r.tip,
    })),
    projects: old.projects.map((r) => ({
      id: String(r.id),
      title: r.name,
      fundingLine: r.fundingLine,
      budget: Number(r.budget.replace(/[^\d]/g, "")),
      startDate: iso(r.startDate),
      endDate: iso(r.endDate),
      partners: r.partners.join(", "),
      workPackages: r.wps.join("\n"),
      description: r.description,
      duration: r.duration,
    })),
    grades: old.grades.map((r) => ({
      id: String(r.id),
      ownerUid: su(studentName(r.student)?.id || 31),
      studentName: r.student,
      courseId: String(courseName(r.course).id),
      courseTitle: r.course,
      instructorUid: "demo-profesor",
      grade: r.grade,
      date: iso(r.date),
    })),
    exams: old.exams.map((r) => ({
      id: String(r.id),
      courseId: String(courseName(r.course).id),
      title: r.course,
      instructorUid: "demo-profesor",
      instructorName: r.prof,
      date: iso(r.date),
      time: r.time,
      room: r.room,
      capacity: r.capacity,
      enrolledStudents: r.enrolledStudents,
    })),
    enrollments: old.students.flatMap((s) =>
      s.enrolled.map((id) => ({
        id: id + "__" + su(s.id),
        ownerUid: su(s.id),
        ownerName: s.name,
        courseId: String(id),
        courseTitle: old.courses.find((c) => c.id === id).title,
        instructorUid: "demo-profesor",
        status: "Odobreno",
      })),
    ),
    examBookings: old.exams.flatMap((r) =>
      r.enrolledStudents.map((s) => ({
        id: r.id + "__" + su(s.id),
        ownerUid: su(s.id),
        ownerName: s.name,
        examId: String(r.id),
        courseId: String(courseName(r.course).id),
        title: r.course,
        instructorUid: "demo-profesor",
        date: iso(r.date),
        status: "Odobreno",
      })),
    ),
    labBookings: [],
    calendarEvents: old.courses.map((r) => ({
      id: String(r.id),
      title: r.title,
      date:
        "2026-10-" +
        { Pon: "12", Uto: "13", Sri: "14", Čet: "15", Pet: "16" }[r.day],
      time: String(r.timeStart).padStart(2, "0") + ":00",
      room: r.dvorana,
      description: r.prof,
      day: r.day,
      instructorName: r.prof,
    })),
    research: old.research.map((r) => ({
      id: String(r.id),
      ownerUid: "demo-profesor",
      title: r.title,
      authors: r.authors,
      status: {
        Drafting: "U pripremi",
        "Peer Review": "Recenzija",
        Published: "Objavljeno",
      }[r.status],
      projectId: String(old.projects.find((p) => p.name === r.link)?.id || ""),
      description: r.link,
      link: r.link,
    })),
    labs: old.labs.map((r) => ({
      id: String(r.id),
      title: r.name,
      tag: r.id_tag,
      category: r.type,
      status: r.status,
    })),
    documents: old.documents.map((r) => ({
      id: String(r.id),
      title: r.title,
      category: r.uploader,
      date: iso(r.date),
      url: "",
      description: "Dokument iz predloška. Izvorni kod ne sadrži PDF datoteku.",
    })),
    requests: old.requests.map((r) => ({
      id: String(r.id),
      ownerUid: su(studentName(r.student)?.id || 31),
      ownerName: r.student,
      type: r.type,
      details: r.details,
      status: r.status,
      response: r.history.map((h) => h.d + " · " + h.t).join("\n"),
    })),
    finances: old.finances.map((r) => ({
      id: String(r.id),
      ownerUid: su(r.studentId),
      ownerName: r.student,
      title: r.type,
      amount: Number(r.amount.replace(/[^\d.]/g, "")),
      dueDate: iso(r.due),
      status: r.status,
      paymentReference: "Ogledna obveza iz predloška; nije nalog za uplatu.",
    })),
    employeeSchedules: old.employeeSchedules.map((r, i) => ({
      id: String(i + 1),
      ownerUid: eu(r.empId),
      ownerName: r.empName,
      departmentId: "poslovanje",
      date: r.date,
      activity:
        {
          "Na poslu (Ured)": "Ured",
          "Godišnji odmor (GO)": "Godišnji odmor",
          "Slobodan dan": "Slobodan dan",
          "Putni nalozi": "Putni nalog",
        }[r.activity] || r.activity,
      startTime: r.hours === "-" ? "00:00" : r.hours.split(" - ")[0],
      endTime: r.hours === "-" ? "00:01" : r.hours.split(" - ")[1],
    })),
    workEntries: old.timeEntries.map((r) => ({
      id: String(r.id),
      ownerUid: eu(r.empId),
      ownerName: r.empName,
      date: r.date,
      category: r.category.startsWith("Znanstveni")
        ? "Znanstveni rad"
        : r.category,
      hours: r.hours,
      projectId: String(
        old.projects.find((p) => p.name === r.project)?.id || "",
      ),
      description: r.description,
    })),
    vacations: old.vacations.map((r) => ({
      id: String(r.id),
      ownerUid: eu(old.employees.find((p) => p.name === r.employee)?.id || 31),
      ownerName: r.employee,
      startDate:
        "2026-" + r.period.split(" - ")[0].split(".").reverse().join("-"),
      endDate:
        "2026-" + r.period.split(" - ")[1].split(".").reverse().join("-"),
      days: r.days,
      status: r.status,
      details: "",
    })),
    alumniEvents: old.alumniEvents.map((r) => ({
      id: String(r.id),
      title: r.title,
      date: iso(r.date),
      location: r.location,
      description: r.type,
    })),
    evaluations: [],
    notifications: [
      {
        id: "1",
        ownerUid: "demo-student",
        title: "Dobrodošli u PAR",
        message: "Podaci preuzeti iz izvornog oglednog predloška.",
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
      id: "demo-" + role,
      role,
      name:
        role === "student"
          ? old.students[0].name
          : role === "profesor"
            ? old.employees[1].name
            : "Administrator predloška",
      email: role + "@example.test",
      active: true,
      departmentId: "poslovanje",
    })),
  };
  for (const list of Object.values(records))
    list.forEach((r) =>
      Object.assign(r, {
        createdAt: "Ogledni zapis",
        updatedAt: "Ogledni zapis",
        createdBy: "demo-admin",
      }),
    );
  return records;
}
