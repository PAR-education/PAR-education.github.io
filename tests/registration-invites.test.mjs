import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registrationRoster,
  matchRegistrationStudent,
  assertRegistrationClaim,
} from "../src/utils/registration-invites.js";

test("Registration roster normalizes e-mail case, names and rejects duplicate or malformed addresses", () => {
  const rows = registrationRoster(
    "name;email\nTest Student;TEST@Example.test\nSecond Student;second@example.test",
  );
  assert.equal(rows[0].email, "test@example.test");
  assert.equal(rows.length, 2);
  assert.throws(() =>
    registrationRoster("Student;a@example.test\nOther;A@EXAMPLE.TEST"),
  );
  assert.throws(() => registrationRoster("Student;bad-email"));
  assert.equal(
    matchRegistrationStudent(rows[0], [
      { id: "right", name: "Other", email: "TEST@Example.test" },
    ]),
    "right",
  );
  assert.equal(
    matchRegistrationStudent(
      { name: "Mario-Ionut Nicolae", email: "new@example.test" },
      [{ id: "name-match", name: "Mario Ionut Nicolae" }],
    ),
    "name-match",
  );
  assert.equal(
    matchRegistrationStudent({ name: "Student", email: "new@example.test" }, [
      { id: "a", name: "Student" },
      { id: "b", name: "Student" },
    ]),
    "",
  );
});
test("Claim validation requires administrator-approved invited identity and a matching approved course/year", () => {
  const user = {
    uid: "student",
    email: "TEST@example.test",
    emailVerified: true,
  };
  const invite = {
    email: "test@example.test",
    enabled: true,
    claimedBy: "",
    studentId: "s",
    courseId: "c",
    academicYear: "2026/2027",
  };
  const profile = { active: true, role: "student", email: "test@example.test" };
  const student = { email: "Test@example.test", ownerUid: "" };
  const enrollment = {
    studentId: "s",
    courseId: "c",
    academicYear: "2026/2027",
    status: "Odobreno",
    ownerUid: "",
  };
  assert.doesNotThrow(() =>
    assertRegistrationClaim(invite, profile, student, enrollment, user),
  );
  assert.doesNotThrow(() =>
    assertRegistrationClaim(invite, profile, student, enrollment, {
      ...user,
      emailVerified: false,
    }),
  );
  assert.throws(() =>
    assertRegistrationClaim(
      invite,
      { ...profile, role: "admin" },
      student,
      enrollment,
      user,
    ),
  );
  assert.throws(() =>
    assertRegistrationClaim(
      invite,
      profile,
      student,
      { ...enrollment, status: "Na čekanju" },
      user,
    ),
  );
  assert.throws(() =>
    assertRegistrationClaim(
      invite,
      profile,
      student,
      { ...enrollment, academicYear: "2027/2028" },
      user,
    ),
  );
  assert.throws(() =>
    assertRegistrationClaim(
      invite,
      profile,
      { ...student, ownerUid: "other" },
      enrollment,
      user,
    ),
  );
  assert.throws(() =>
    assertRegistrationClaim(
      { ...invite, claimedBy: "other" },
      profile,
      student,
      enrollment,
      user,
    ),
  );
});
