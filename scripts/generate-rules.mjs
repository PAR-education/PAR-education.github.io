import { writeFileSync } from "node:fs";
import { modules } from "../src/modules/catalog.js";
const quote = (value) => `'${value.replaceAll("'", "\\'")}'`;
function fieldCheck(field) {
  const value = `d.${field.key}`;
  let check;
  if (field.type === "uids")
    check = `${value} is list && ${value}.size() <= 10`;
  else if (field.type === "checkbox") check = `${value} is bool`;
  else if (field.type === "number")
    check = `${value} is ${field.integer ? "int" : "number"} && ${value} >= ${field.min} && ${value} <= ${field.max}`;
  else {
    check = `${value} is string && ${value}.size() <= ${field.maxLength || 200}`;
    if (field.required) check += ` && ${value}.size() > 0`;
    if (field.options)
      check += ` && ${value} in [${field.options.map(quote).join(", ")}]`;
    if (field.pattern === "academicYear")
      check += ` && ${value}.matches('^[0-9]{4}/[0-9]{4}$')`;
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
    : `(!('${field.key}' in d) || ${["time", "date", "number", "checkbox", "uids"].includes(field.type) ? "" : `d.${field.key} == '' || `}(${check}))`;
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
    if (name === "workPlans")
      expressions.push("d.month.matches('^[0-9]{4}-(0[1-9]|1[0-2])$')");
    if (name === "workEntries")
      expressions.push("(('startTime' in d) == ('endTime' in d))");
    if (keys.includes("startDate") && keys.includes("endDate"))
      expressions.push("d.endDate >= d.startDate");
    if (keys.includes("startTime") && keys.includes("endTime"))
      expressions.push(
        "(!('startTime' in d) || !('endTime' in d) || d.endTime > d.startTime)",
      );
    if (keys.includes("time") && keys.includes("endTime"))
      expressions.push("(!('endTime' in d) || d.endTime > d.time)");
    if (name === "notifications")
      expressions.push(
        "((d.get('ownerUid','') != '' && d.get('audience','') == '') || (d.get('ownerUid','') == '' && d.get('audience','') in ['student','profesor','students_professors']))",
      );
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
      let p = profile();
      return signedIn() && p.active == true
        && p.role in ['admin', 'administracija_par', 'dept_head', 'profesor', 'lab_assistant', 'student', 'alumni']
        && (!p.get('emailVerificationRequired', false) || request.auth.token.get('email_verified', false));
    }
    function role(r) { return active() && profile().role == r; }
    function admin() { return role('admin'); }
    function staff() { return active() && profile().role in ['admin', 'dept_head', 'profesor', 'lab_assistant']; }
    function own(d) { return active() && d.ownerUid == request.auth.uid; }
    function assignedUid(d) { return (('instructorUid' in d) && d.instructorUid == request.auth.uid) || (('instructorUids' in d) && request.auth.uid in d.instructorUids); }
    function instructor(d) { return role('profesor') && assignedUid(d); }
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
        && d.email == request.auth.token.email && d.emailVerificationRequired == true
        && d.emailVerified == request.auth.token.get('email_verified', false) && created(d);
    }
    function updated(d) {
      return d.updatedAt == request.time && d.createdAt == resource.data.createdAt
        && d.createdBy == resource.data.createdBy;
    }
    function assignedCourse(d) {
      let c = get(/databases/$(database)/documents/courses/$(d.courseId)).data;
      return assignedUid(c) && d.instructorUid == c.instructorUid
        && (!('instructorUids' in d) || d.instructorUids == c.get('instructorUids', [c.instructorUid]));
    }
    function enrollmentKey(d, uid) { return d.courseId + '__' + uid + (d.get('academicYear','') == '' ? '' : '__' + d.academicYear.split('/')[0]); }
    function enrolledStudent(d) {
      let enrollment = get(/databases/$(database)/documents/enrollments/$(enrollmentKey(d, d.ownerUid))).data;
      return enrollment.ownerUid == d.ownerUid && enrollment.courseId == d.courseId && enrollment.status == 'Odobreno';
    }
    function broadcastVisible(d) {
      return active() && ((role('administracija_par') && d.get('audience','') in ['student','profesor','students_professors'])
        || (profile().role in ['student','profesor'] && d.get('audience','') in [profile().role,'students_professors']));
    }
    function officeBroadcast(d) {
      return role('administracija_par') && d.get('ownerUid','') == ''
        && d.get('audience','') in ['student','profesor','students_professors']
        && d.get('sourceModule','') == '' && d.get('sourceId','') == '';
    }
    function courseNoticeAuthor(d) {
      return role('profesor') && d.get('sourceModule','') == 'courses' && d.createdBy == request.auth.uid;
    }
    function manualCourseNotice(d) {
      let c = get(/databases/$(database)/documents/courses/$(d.courseId)).data;
      let en = get(/databases/$(database)/documents/enrollments/$(d.enrollmentId)).data;
      return role('profesor') && assignedUid(c) && d.get('audience','') == ''
        && d.sourceModule == 'courses' && d.sourceId == d.courseId && d.courseTitle == c.title
        && en.status == 'Odobreno' && en.courseId == d.courseId && en.ownerUid == d.ownerUid && d.ownerUid != ''
        && d.get('academicYear','') == en.get('academicYear','')
        && (c.get('academicYear','') == '' || d.get('academicYear','') == c.academicYear);
    }
    function teacherNotice(d) {
      let source = get(/databases/$(database)/documents/$(d.sourceModule)/$(d.sourceId)).data;
      return role('profesor') && d.sourceModule in ['calendarEvents','enrollments','examBookings'] && instructor(source)
        && ((d.sourceModule in ['enrollments','examBookings'] && source.ownerUid == d.ownerUid)
          || (d.sourceModule == 'calendarEvents' && enrolledStudent({'courseId':source.courseId,'ownerUid':d.ownerUid,'academicYear':source.get('academicYear','')})));
    }
    function studentEnrollment(d, id) {
      let c = get(/databases/$(database)/documents/courses/$(d.courseId)).data;
      return role('student') && d.ownerUid == request.auth.uid && d.status == 'Na čekanju'
        && id == enrollmentKey(d, request.auth.uid) && d.instructorUid == c.instructorUid
        && d.get('instructorUids', [d.instructorUid]) == c.get('instructorUids', [c.instructorUid])
        && d.get('academicYear','') == c.get('academicYear','') && d.courseTitle == c.title;
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
      allow update: if signedIn() && request.auth.uid == uid && request.auth.token.get('email_verified', false)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['emailVerified','updatedAt'])
        && request.resource.data.emailVerified == true && request.resource.data.updatedAt == request.time;
      allow delete: if false;
    }
`;
const policies = {
  rooms: { read: "active()", write: "admin()" },
  students: {
    read: "admin() || role('administracija_par') || inDepartment(resource.data)",
    write:
      "admin() || (role('administracija_par') && request.resource.data.get('ownerUid', '') == '')",
    update: "admin()",
    remove: "admin()",
  },
  employees: {
    read: "admin() || role('administracija_par') || inDepartment(resource.data)",
    write:
      "admin() || (role('administracija_par') && request.resource.data.get('ownerUid', '') == '')",
    update: "admin()",
    remove: "admin()",
  },
  courses: { read: "active()", write: "admin()" },
  calendarEvents: {
    read: "active()",
    write:
      "admin() || role('administracija_par') || (role('profesor') && assignedCourse(request.resource.data))",
    update:
      "admin() || role('administracija_par') || (instructor(resource.data) && assignedCourse(request.resource.data))",
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
    read: "admin() || role('administracija_par')",
    write: "admin() || role('administracija_par')",
    update: "admin() || role('administracija_par')",
    remove: "admin() || role('administracija_par')",
  },
  workPlans: {
    read: "admin() || role('administracija_par')",
    write: "admin() || role('administracija_par')",
    update: "admin() || role('administracija_par')",
    remove: "admin() || role('administracija_par')",
  },
  vacations: {
    read: "admin() || (staff() && own(resource.data))",
    write:
      "admin() || (staff() && own(request.resource.data) && request.resource.data.status == 'Na čekanju')",
    update: "admin()",
    remove: "admin()",
  },
  evaluations: {
    read: "admin() || (!role('administracija_par') && own(resource.data))",
    write: "!role('administracija_par') && own(request.resource.data)",
    update: "false",
    remove: "admin()",
  },
  notifications: {
    read: "admin() || own(resource.data) || broadcastVisible(resource.data) || courseNoticeAuthor(resource.data)",
    write:
      "admin() || (request.resource.data.get('sourceModule','') == 'courses' && manualCourseNotice(request.resource.data)) || officeBroadcast(request.resource.data) || (request.resource.data.get('audience','') == '' && teacherNotice(request.resource.data))",
    update: "admin()",
    remove: "admin()",
  },
};
let matches = "";
for (const [name, policy] of Object.entries(policies)) {
  matches += `    match /${name}/{id} {
      allow read: if ${policy.read};
      ${name === "notifications" ? "allow get: if role('profesor') && !exists(/databases/$(database)/documents/notifications/$(id));" : ""}
      allow create: if (${policy.write}) && valid_${name}(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_${name}(request.resource.data) && restored(request.resource.data);
      allow update: if (${policy.update || policy.write}) && valid_${name}(request.resource.data) && updated(request.resource.data);
      allow update: if admin() && valid_${name}(request.resource.data) && updated(request.resource.data);
      allow delete: if ${policy.remove || policy.write};
    }\n`;
}
matches += `
    // Europe/Zagreb: EU summer time starts/ends at 01:00 UTC on the last Sunday of March/October.
    function zagrebClock(at) {
      let march = timestamp.date(at.year(), 3, 31);
      let october = timestamp.date(at.year(), 10, 31);
      let summerStart = march - duration.value(march.dayOfWeek() % 7, 'd') + duration.value(1, 'h');
      let summerEnd = october - duration.value(october.dayOfWeek() % 7, 'd') + duration.value(1, 'h');
      return at + duration.value(at >= summerStart && at < summerEnd ? 2 : 1, 'h');
    }
    function attendanceSource(d, id, event, enrollment) {
      return id == d.eventId + '__' + d.enrollmentId
        && enrollment.status == 'Odobreno'
        && enrollment.courseId == event.courseId && d.courseId == event.courseId
        && (enrollment.get('academicYear','') == '' || enrollment.get('academicYear','') == event.get('academicYear',''))
        && d.ownerUid == enrollment.get('ownerUid','') && d.studentId == enrollment.get('studentId','')
        && d.studentName == enrollment.ownerName && d.courseTitle == event.title && d.date == event.date
        && d.academicYear == event.get('academicYear', enrollment.get('academicYear',''))
        && d.instructorUid == event.get('instructorUid','')
        && d.instructorUids == event.get('instructorUids', [event.get('instructorUid','')])
        && d.markedByUid == request.auth.uid && d.markedByRole == profile().role;
    }
    function attendanceWindow(event, at) {
      let clock = zagrebClock(at);
      let date = event.date.split('-');
      let start = event.time.split(':');
      let end = event.endTime.split(':');
      let minute = clock.hours() * 60 + clock.minutes();
      return clock.year() == int(date[0]) && clock.month() == int(date[1]) && clock.day() == int(date[2])
        && minute >= int(start[0]) * 60 + int(start[1]) && minute < int(end[0]) * 60 + int(end[1]);
    }
    function attendanceWriter(d, id, selfAllowed) {
      let enrollment = get(/databases/$(database)/documents/enrollments/$(d.enrollmentId)).data;
      let event = get(/databases/$(database)/documents/calendarEvents/$(d.eventId)).data;
      let r = profile().role;
      return (r == 'administracija_par' || (r == 'profesor' && assignedUid(event))
        || (selfAllowed && r == 'student' && enrollment.get('ownerUid','') == request.auth.uid && d.status == 'Prisutan'
          && event.get('endTime','') != '' && attendanceWindow(event,request.time)))
        && attendanceSource(d,id,event,enrollment);
    }
    function attendanceReader(d) {
      return admin() || role('administracija_par') || (role('profesor') && instructor(get(/databases/$(database)/documents/courses/$(d.courseId)).data))
        || (role('student') && own(get(/databases/$(database)/documents/enrollments/$(d.enrollmentId)).data));
    }
    match /attendance/{id} {
      allow list: if attendanceReader(resource.data);
      allow get: if attendanceReader(resource.data)
        || (active() && profile().role in ['profesor','student'] && !exists(/databases/$(database)/documents/attendance/$(id)));
      allow create: if (admin() || (active() && attendanceWriter(request.resource.data,id,true)))
        && valid_attendance(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_attendance(request.resource.data) && restored(request.resource.data);
      allow update: if (admin() || (active() && attendanceWriter(request.resource.data,id,false)
          && request.resource.data.eventId == resource.data.eventId
          && request.resource.data.enrollmentId == resource.data.enrollmentId))
        && valid_attendance(request.resource.data) && updated(request.resource.data);
      allow delete: if admin();
    }
    match /calendarLocks/{date} {
      allow read: if active();
      allow create, update: if active() && profile().role in ['admin','administracija_par','profesor']
        && request.resource.data.keys().hasOnly(['version','updatedAt','actorUid'])
        && request.resource.data.version is int && request.resource.data.version > 0
        && request.resource.data.actorUid == request.auth.uid && request.resource.data.updatedAt == request.time;
      allow delete: if false;
    }
    match /auditLog/{id} {
      allow read: if admin();
      allow create: if active() && request.resource.data.keys().hasOnly(['module','recordId','action','before','after','actorUid','createdAt'])
        && request.resource.data.actorUid == request.auth.uid && request.resource.data.createdAt == request.time
        && request.resource.data.module in [${Object.keys(modules).map(quote).join(", ")}]
        && request.resource.data.recordId is string && request.resource.data.recordId.size() <= 1500
        && request.resource.data.action in ['create','update','archive','restore']
        && (admin() || (((request.resource.data.after != null
          && request.resource.data.after == getAfter(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId)).data
          && request.resource.data.after.updatedAt == request.time)
          || (request.resource.data.action == 'archive' && !existsAfter(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId))))
        && ((request.resource.data.before == null && !exists(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId)))
          || request.resource.data.before == get(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId)).data)));
      allow update, delete: if false;
    }
    match /archive/{id} {
      allow read: if admin();
      allow create: if active() && request.resource.data.actorUid == request.auth.uid && request.resource.data.createdAt == request.time
        && request.resource.data.module != 'users'
        && request.resource.data.data == get(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId)).data
        && !existsAfter(/databases/$(database)/documents/$(request.resource.data.module)/$(request.resource.data.recordId));
      allow update: if admin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['restoredAt','restoredBy'])
        && request.resource.data.restoredAt == request.time && request.resource.data.restoredBy == request.auth.uid;
      allow delete: if false;
    }
`;

matches += `
    match /enrollments/{id} {
      allow read: if admin() || role('administracija_par') || instructor(resource.data) || (role('student') && own(resource.data));
      allow create: if admin() && id.matches('^template-.+$') && valid_enrollments(request.resource.data) && created(request.resource.data);
      allow create: if admin() && valid_enrollments(request.resource.data) && restored(request.resource.data);
      allow update: if admin() && valid_enrollments(request.resource.data) && updated(request.resource.data);
      allow create: if studentEnrollment(request.resource.data,id) && valid_enrollments(request.resource.data) && created(request.resource.data);
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
        && (!('instructorUids' in request.resource.data) || request.resource.data.instructorUids == get(/databases/$(database)/documents/exams/$(request.resource.data.examId)).data.get('instructorUids', [request.resource.data.instructorUid]))
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
