import { openDialog } from "./dialog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import {
  registrationRoster,
  matchRegistrationStudent,
  registrationName,
} from "../utils/registration-invites.js";
import { prepareRegistrationInvite } from "../services/registration-invites.js";

export async function showRegistrationInvites(context) {
  if (context.profile.role !== "admin" || context.demo)
    throw new Error("Pripremu otvorite kao administrator izvan demo načina.");
  openDialog(
    "Priprema registracija i upisa",
    '<section id="registration-prep">Učitavanje podataka…</section>',
  );
  const root = document.getElementById("registration-prep");
  const [courses, students] = await Promise.all([
    context.repository.listAll("courses"),
    context.repository.listAll("students"),
  ]);
  if (!root.isConnected) return;
  const preferred = courses.filter(
    (c) => registrationName(c.title) === "digital transformation",
  );
  let preview = [],
    busy = false;
  root.innerHTML = `<p>Priprema odobren upis i povezuje dosje s budućim računom. Račun se aktivira tek nakon potvrde e-adrese. Lozinke se ne stvaraju niti šalju.</p><div class="work-form-grid"><label>Kolegij<select id="prep-course"><option value="">Odaberite kolegij</option>${courses.map((c) => `<option value="${e(c.id)}" ${preferred.length === 1 && preferred[0].id === c.id ? "selected" : ""}>${e(c.title)} · ${e(c.academicYear || "Nedostaje godina")} · ${e(c.instructorName || "Nedostaje nastavnik")}</option>`).join("")}</select></label><label>Odjel za nove dosjee<input id="prep-department" maxlength="200" placeholder="Oznaka odjela"></label></div><label>Popis studenata<textarea id="prep-roster" rows="7" placeholder="Ime i prezime;email@example.com"></textarea></label><label>Učitaj popis (.csv ili .txt)<input id="prep-file" type="file" accept=".csv,.txt"></label><button class="button" id="prep-preview">Provjeri popis</button><p id="prep-message" role="status"></p><div id="prep-results"></div><label><input id="prep-confirm" type="checkbox"> Provjerio sam odabrani kolegij i dosjee; odobravam aktivaciju navedenih studenata nakon potvrde njihove e-adrese.</label><button class="button primary" id="prep-save" disabled>Pripremi upise</button>`;
  const $ = (id) => root.querySelector("#" + id);
  const invalidate = () => {
    preview = [];
    $("prep-save").disabled = true;
    $("prep-confirm").checked = false;
    $("prep-results").replaceChildren();
  };
  $("prep-file").addEventListener("change", async (event) => {
    invalidate();
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 100000) {
      $("prep-message").textContent = "Popis smije imati najviše 100 kB.";
      return;
    }
    const text = await file.text();
    if (root.isConnected) $("prep-roster").value = text;
  });
  for (const id of ["prep-roster", "prep-course"])
    $(id).addEventListener("input", invalidate);
  $("prep-preview").addEventListener("click", () => {
    invalidate();
    try {
      const course = courses.find((c) => c.id === $("prep-course").value);
      if (!course?.academicYear || !course.instructorUid)
        throw new Error(
          "Kolegij mora imati akademsku godinu i dodijeljenog nastavnika.",
        );
      preview = registrationRoster($("prep-roster").value).map((row) => ({
        ...row,
        studentId: matchRegistrationStudent(row, students),
      }));
      const departments = preview
        .map((r) => students.find((s) => s.id === r.studentId)?.departmentId)
        .filter(Boolean);
      if (!$("prep-department").value)
        $("prep-department").value = departments[0] || "";
      $("prep-results").innerHTML =
        `<div class="table-scroll"><table><thead><tr><th>Student</th><th>E-adresa</th><th>Dosje za povezivanje</th></tr></thead><tbody>${preview.map((r, index) => `<tr><td>${e(r.name)}</td><td>${e(r.email)}</td><td><select data-prep-row="${index}">${!r.studentId ? '<option value="__choose__" selected>Odaberite dosje ili novi</option>' : ""}<option value="">Novi dosje</option>${students.map((s) => `<option value="${e(s.id)}" ${r.studentId === s.id ? "selected" : ""}>${e(s.name)}${s.email ? " · " + e(s.email) : ""}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>`;
      $("prep-message").textContent =
        `${preview.length} studenata · ${course.title} · ${course.academicYear}. Provjerite dosjee prije potvrde.`;
      $("prep-save").disabled = false;
    } catch (error) {
      $("prep-message").textContent = errorMessage(error);
    }
  });
  $("prep-save").addEventListener("click", async () => {
    if (busy || !preview.length) return;
    if (!$("prep-confirm").checked) {
      $("prep-message").textContent = "Prvo potvrdite pregled i odobrenje.";
      return;
    }
    const course = courses.find((c) => c.id === $("prep-course").value),
      department = $("prep-department").value.trim();
    const choices = [...root.querySelectorAll("[data-prep-row]")].map(
      (s) => s.value,
    );
    if (choices.includes("__choose__")) {
      $("prep-message").textContent =
        "Za sve neprepoznate studente odaberite postojeći ili novi dosje.";
      return;
    }
    if (
      choices.filter(Boolean).length !== new Set(choices.filter(Boolean)).size
    ) {
      $("prep-message").textContent =
        "Isti dosje ne može biti odabran za dvije različite adrese.";
      return;
    }
    busy = true;
    root
      .querySelectorAll("button,input,textarea,select")
      .forEach((n) => (n.disabled = true));
    let count = 0;
    try {
      for (let i = 0; i < preview.length; i++) {
        if (!root.isConnected) return;
        const student = students.find((s) => s.id === choices[i]);
        await prepareRegistrationInvite(
          context,
          preview[i],
          course,
          choices[i],
          student?.departmentId || department,
        );
        count++;
        $("prep-message").textContent =
          `Pripremljeno ${count} / ${preview.length}.`;
      }
      $("prep-message").textContent =
        `Pripremljeno ${count} upisa. Studenti se registriraju navedenim e-adresama, potvrde poruku i kliknu „Potvrdio/la sam e-adresu”. Već registrirani studenti mogu se ponovno prijaviti.`;
      preview = [];
    } catch (error) {
      if (root.isConnected)
        $("prep-message").textContent =
          `Pripremljeno ${count} upisa. ${errorMessage(error)} Ponovite pripremu nakon ispravka; već pripremljeni upisi ne dupliciraju se.`;
    } finally {
      busy = false;
      if (root.isConnected) {
        root
          .querySelectorAll("button,input,textarea,select")
          .forEach((n) => (n.disabled = false));
        $("prep-save").disabled = !preview.length;
      }
    }
  });
}
