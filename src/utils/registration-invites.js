export const registrationEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
export const registrationName = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function registrationRoster(text) {
  const rows = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  const result = [],
    emails = new Set();
  for (const line of rows) {
    if (/^name[;,\t]email$/i.test(line)) continue;
    const cells = line
      .split(/[;\t]/)
      .map((s) => s.trim().replace(/^"|"$/g, ""));
    const name = cells[0],
      email = registrationEmail(cells[1]);
    if (
      cells.length !== 2 ||
      !name ||
      name.length > 200 ||
      email.length > 200 ||
      !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)
    )
      throw new Error(
        "Svaki red mora sadržavati ime i e-adresu, odvojene točkom-zarezom.",
      );
    if (emails.has(email))
      throw new Error("Adresa je navedena više puta: " + email);
    emails.add(email);
    result.push({ name, email });
  }
  if (!result.length || result.length > 50)
    throw new Error("Unesite od 1 do 50 studenata.");
  return result;
}
export function matchRegistrationStudent(row, students) {
  const email = students.filter(
    (s) => registrationEmail(s.email) === row.email,
  );
  if (email.length > 1) throw new Error("Više dosjea ima adresu " + row.email);
  if (email.length) return email[0].id;
  const names = students.filter(
    (s) => registrationName(s.name) === registrationName(row.name),
  );
  return names.length === 1 ? names[0].id : "";
}
export function assertRegistrationClaim(
  invite,
  profile,
  student,
  enrollment,
  user,
) {
  if (
    profile?.active !== true ||
    !invite?.enabled ||
    invite.email !== registrationEmail(user.email)
  )
    throw new Error(
      "Administrator prvo mora odobriti studentski račun s pripremljenog popisa.",
    );
  if (invite.claimedBy && invite.claimedBy !== user.uid)
    throw new Error("Ovaj upis već pripada drugom računu.");
  if (
    profile?.role !== "student" ||
    registrationEmail(profile.email) !== invite.email
  )
    throw new Error("Priprema vrijedi samo za odgovarajući studentski račun.");
  if (
    !student ||
    registrationEmail(student.email) !== invite.email ||
    (student.ownerUid && student.ownerUid !== user.uid)
  )
    throw new Error("Dosje nije dostupan za povezivanje.");
  if (
    !enrollment ||
    enrollment.studentId !== invite.studentId ||
    enrollment.courseId !== invite.courseId ||
    enrollment.academicYear !== invite.academicYear ||
    enrollment.status !== "Odobreno" ||
    (enrollment.ownerUid && enrollment.ownerUid !== user.uid)
  )
    throw new Error("Pripremljeni upis nije dostupan za povezivanje.");
}
