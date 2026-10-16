import { writeFileSync } from "node:fs";
import { modules } from "../src/modules/catalog.js";
const quote = (value) => `'${value.replaceAll("'", "\\'")}'`;
function fieldCheck(field) {
  const value = `d.${field.key}`;
  let check;
  if (field.type === "checkbox") check = `${value} is bool`;
  else if (field.type === "number")
    check = `${value} is ${field.integer ? "int" : "number"} && ${value} >= ${field.min} && ${value} <= ${field.max}`;
  else {
    check = `${value} is string && ${value}.size() <= ${field.maxLength || 200}`;
    if (field.required) check += ` && ${value}.size() > 0`;
    if (field.options)
      check += ` && ${value} in [${field.options.map(quote).join(", ")}]`;
    if (field.type === "date")
      check += ` && ${value}.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`;
    if (field.type === "time")
      check += ` && ${value}.matches('^([01][0-9]|2[0-3]):[0-5][0-9]$')`;
    if (field.type === "email")
      check += ` && ${value}.matches('^[^ @]+@[^ @]+[.][^ @]+$')`;
    if (field.type === "url") check += ` && ${value}.matches('^https://.+$')`;
  }
  return field.required
    ? `(${check})`
    : `(!('${field.key}' in d) || ${["time", "date", "number", "checkbox"].includes(field.type) ? "" : `d.${field.key} == '' || `}(${check}))`;
}
const schemas = Object.entries(modules)
  .map(([name, config]) => {
    const keys = [
      ...config.fields.map((field) => field.key),
      "createdAt",
      "createdBy",
      "updatedAt",
    ];
    const required = config.fields
      .filter((field) => field.required)
      .map((field) => field.key);
    if (name !== "users") required.push("createdAt", "createdBy", "updatedAt");
    const expressions = [
      `d.keys().hasOnly([${keys.map(quote).join(", ")}])`,
      `d.keys().hasAll([${required.map(quote).join(", ")}])`,
      ...config.fields.map(fieldCheck),
    ];
    if (keys.includes("startDate") && keys.includes("endDate"))
      expressions.push("d.endDate >= d.startDate");
    if (keys.includes("startTime") && keys.includes("endTime"))
      expressions.push(
        "(!('startTime' in d) || !('endTime' in d) || d.endTime > d.startTime)",
      );
    if (keys.includes("time") && keys.includes("endTime"))
      expressions.push("(!('endTime' in d) || d.endTime > d.time)");
    if (name === "enrollments")
      expressions.push(
        "(('ownerUid' in d && d.ownerUid.size() > 0) || ('studentId' in d && d.studentId.size() > 0))",
      );
    return `    function valid_${name}(d) {\n      return ${expressions.join("\n        && ")};\n    }`;
  })
  .join("\n");
const common = `rules_version = '2';
// Generated from src/modules/catalog.js and scripts/generate-rules.mjs.
// Publish to the par-education Firestore database before using real records.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function profile() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function active() {
      return signedIn() && profile().active == true
        && profile().role in ['admin', 'dept_head', 'profesor', 'lab_assistant', 'student', 'alumni'];
    }
    function role(r) { return active() && profile().role == r; }
    function admin() { return role('admin'); }
    function staff() { return active() && profile().role in ['admin', 'dept_head', 'profesor', 'lab_assistant']; }
    function own(d) { return active() && d.ownerUid == request.auth.uid; }
    function instructor(d) { return role('profesor') && d.instructorUid == request.auth.uid; }
    function inDepartment(d) {
      return role('dept_head') && profile().departmentId is string
        && profile().departmentId.size() > 0 && d.departmentId == profile().departmentId;
    }
    function created(d) {
      return d.createdAt == request.time && d.updatedAt == request.time && d.createdBy == request.auth.uid;
    }
    function restored(d) {
      return d.createdAt is timestamp && d.createdBy is string
        && d.createdBy.size() > 0 && d.createdBy.size() <= 1500
        && d.updatedAt == request.time;
    }
    function pendingSelf(uid, d) {
      return signedIn() && uid == request.auth.uid
        && d.role == 'student' && d.active == false && d.departmentId == ''
        && d.email == request.auth.token.email && created(d);
    }
    function updated(d) {
      return d.updatedAt == request.time && d.createdAt == resource.data.createdAt
        && d.createdBy == resource.data.createdBy;
    }
    function assignedCourse(d) {
      return get(/databases/$(database)/documents/courses/$(d.courseId)).data.instructorUid == request.auth.uid
        && d.instructorUid == request.auth.uid;
    }
    function enrolledStudent(d) {
      let enrollment = get(/databases/$(database)/documents/enrollments/$(d.courseId + '__' + d.ownerUid)).data;
      return enrollment.ownerUid == d.ownerUid && enrollment.courseId == d.courseId && enrollment.status == 'Odobreno';
    }
    function decision(d) {
      return resource.data.status == 'Na čekanju' && d.status in ['Odobreno', 'Odbijeno']
        && d.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt']) && updated(d);
    }
${schemas}

    match /users/{uid} {
      allow get: if signedIn() && (request.auth.uid == uid || admin());
      allow list: if admin();
      allow create: if (pendingSelf(uid, request.resource.data) || admin()) && valid_users(request.resource.data)
        && request.resource.data.active is bool && request.resource.data.updatedAt == request.time;
      allow update: if admin() && valid_users(request.resource.data)
        && request.resource.data.active is bool && request.resource.data.updatedAt == request.time
        && (uid != request.auth.uid || (request.resource.data.role == 'admin' && request.resource.data.active == true));
      allow delete: if false;
    }
`;
const policies = {
  students: {
    read: "admin() || inDepartment(resource.data)",
    write: "admin()",
  },
  employees: {
    read: "admin() || inDepartment(resource.data)",
    write: "admin()",
  },
  courses: { read: "active()", write: "admin()" },
  calendarEvents: {
    read: "active()",
    write:
      "admin() || (role('profesor') && assignedCourse(request.resource.data))",
    update:
      "admin() || (instructor(resource.data) && assignedCourse(request.resource.data))",
    remove: "admin() || instructor(resource.data)",
  },
  exams: {
    read: "active() && profile().role in ['admin', 'dept_head', 'profesor', 'student']",
    write:
      "admin() || (role('profesor') && assignedCourse(request.resource.data))",
    update:
      "admin() || (instructor(resource.data) && assignedCourse(request.resource.data))",
    remove: "admin() || instructor(resource.data)",
  },
  grades: {
    read: "admin() || instructor(resource.data) || (role('student') && own(resource.data))",
    write:
      "admin() || (role('profesor') && assignedCourse(request.resource.data) && enrolledStudent(request.resource.data))",
    update:
      "admin() || (instructor(resource.data) && assignedCourse(request.resource.data) && enrolledStudent(request.resource.data))",
    remove: "admin() || instructor(resource.data)",
  },
  projects: { read: "staff()", write: "admin() || role('dept_head')" },
  research: {
    read: "admin() || (staff() && own(resource.data))",
    write: "admin() || (staff() && own(request.resource.data))",
    update:
      "admin() || (staff() && own(resource.data) && own(request.resource.data))",
    remove: "admin()",
  },
  labs: {
    read: "admin() || role('lab_assistant') || role('student')",
    write: "admin() || role('lab_assistant')",
  },
  documents: { read: "active()", write: "admin()" },
  alumniEvents: { read: "admin() || role('alumni')", write: "admin()" },
  requests: {
    read: "admin() || (active() && profile().role in ['student', 'alumni'] && own(resource.data))",
    write:
      "admin() || (active() && profile().role in ['student', 'alumni'] && own(request.resource.data) && request.resource.data.status == 'Na čekanju' && request.resource.data.response == '')",
    update: "admin()",
    remove: "admin()",
  },
  finances: {
    read: "admin() || (role('student') && own(resource.data))",
    write: "admin()",
  },
  employeeSchedules: {
    read: "admin() || (staff() && own(resource.data))",
    write: "admin()",
  },
  workEntries: {
    read: "admin() || (staff() && own(resource.data))",
    write: "admin() || (staff() && own(request.resource.data))",
    update:
      "admin() || (staff() && own(resource.data) && own(request.resource.data))",
    remove: "admin()",
  },
  vacations: {
    read: "admin() || (staff() && own(resource.data))",
    write:
      "admin() || (staff() && own(request.resource.data) && request.resource.data.status == 'Na čekanju')",
    update: "admin()",
    remove: "admin()",
  },
  evaluations: {
    read: "admin() || own(resource.data)",
    write: "own(request.resource.data)",
    update: "false",
    remove: "admin()",
  },
  notifications: { read: "admin() || own(resource.data)", write: "admin()" },
};
let matches = "";
for (const [name, policy] of Object.entries(policies)) {
  matches += `    match /${name}/{id} {
      allow read: if ${policy.read};
      allow create: if (${policy.write}) && valid_${name}(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_${name}(request.resource.data) && restored(request.resource.data);
      allow update: if (${policy.update || policy.write}) && valid_${name}(request.resource.data) && updated(request.resource.data);
      allow update: if admin() && valid_${name}(request.resource.data) && updated(request.resource.data);
      allow delete: if ${policy.remove || policy.write};
    }\n`;
}
matches += `
    match /enrollments/{id} {
      allow read: if admin() || instructor(resource.data) || (role('student') && own(resource.data));
      allow create: if admin() && id.matches('^template-.+$') && valid_enrollments(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_enrollments(request.resource.data) && restored(request.resource.data);
      allow update: if admin() && valid_enrollments(request.resource.data) && updated(request.resource.data);
      allow create: if role('student') && own(request.resource.data) && valid_enrollments(request.resource.data)
        && created(request.resource.data) && request.resource.data.status == 'Na čekanju'
        && id == request.resource.data.courseId + '__' + request.auth.uid
        && request.resource.data.instructorUid == get(/databases/$(database)/documents/courses/$(request.resource.data.courseId)).data.instructorUid
        && request.resource.data.courseTitle == get(/databases/$(database)/documents/courses/$(request.resource.data.courseId)).data.title;
      allow update: if (admin() || instructor(resource.data)) && valid_enrollments(request.resource.data) && decision(request.resource.data);
      allow delete: if admin();
    }
    match /examBookings/{id} {
      allow read: if admin() || instructor(resource.data) || (role('student') && own(resource.data));
      allow create: if admin() && id.matches('^template-.+$') && valid_examBookings(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_examBookings(request.resource.data) && restored(request.resource.data);
      allow update: if admin() && valid_examBookings(request.resource.data) && updated(request.resource.data);
      allow create: if role('student') && own(request.resource.data) && valid_examBookings(request.resource.data)
        && created(request.resource.data) && request.resource.data.status == 'Na čekanju'
        && id == request.resource.data.examId + '__' + request.auth.uid
        && request.resource.data.instructorUid == get(/databases/$(database)/documents/exams/$(request.resource.data.examId)).data.instructorUid
        && request.resource.data.courseId == get(/databases/$(database)/documents/exams/$(request.resource.data.examId)).data.courseId
        && request.resource.data.title == get(/databases/$(database)/documents/exams/$(request.resource.data.examId)).data.title
        && request.resource.data.date == get(/databases/$(database)/documents/exams/$(request.resource.data.examId)).data.date;
      allow update: if (admin() || instructor(resource.data)) && valid_examBookings(request.resource.data) && decision(request.resource.data);
      allow delete: if admin();
    }
    match /labBookings/{id} {
      allow read: if admin() || role('lab_assistant') || (role('student') && own(resource.data));
      allow create: if admin() && id.matches('^template-.+$') && valid_labBookings(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_labBookings(request.resource.data) && restored(request.resource.data);
      allow update: if admin() && valid_labBookings(request.resource.data) && updated(request.resource.data);
      allow create: if role('student') && own(request.resource.data) && valid_labBookings(request.resource.data)
        && created(request.resource.data) && request.resource.data.status == 'Na čekanju'
        && id == request.resource.data.labId + '__' + request.auth.uid
        && get(/databases/$(database)/documents/labs/$(request.resource.data.labId)).data.status == 'Dostupno'
        && request.resource.data.title == get(/databases/$(database)/documents/labs/$(request.resource.data.labId)).data.title;
      allow update: if (admin() || role('lab_assistant')) && valid_labBookings(request.resource.data) && decision(request.resource.data);
      allow delete: if admin();
    }
    // Includes all unknown collections, Storage and integrations are not implicitly allowed.
    match /{document=**} { allow read, write: if false; }
  }
}
`;
writeFileSync(
  new URL("../firebase/firestore.rules", import.meta.url),
  common + matches,
);
