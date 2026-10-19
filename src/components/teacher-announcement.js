import { openDialog, closeDialog } from "./dialog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { isInstructor } from "../utils/instructors.js";
import { courseNoticeRecipients } from "../utils/course-notices.js";
export async function showTeacherAnnouncement(context, onSaved, courseId = "") {
  openDialog(
    "Obavijest studentima kolegija",
    '<p id="teacher-notice-loading" role="status">Učitavanje vaših kolegija…</p>',
  );
  const loading = document.getElementById("teacher-notice-loading");
  try {
    const [allCourses, enrollments] = await Promise.all([
      context.repository.listAll("courses"),
      context.repository.listAll("enrollments"),
    ]);
    if (!loading.isConnected) return;
    const courses = allCourses
      .filter((c) => isInstructor(c, context.user.uid))
      .sort((a, b) => a.title.localeCompare(b.title, "hr"));
    loading.outerHTML = `<form id="teacher-notice-form"><div class="form-grid"><div class="field wide"><label for="teacher-notice-course">Kolegij</label><select id="teacher-notice-course" required><option value="">Odaberite svoj kolegij</option>${courses.map((c) => `<option value="${e(c.id)}">${e(c.title)}${c.academicYear ? " · " + e(c.academicYear) : ""}</option>`).join("")}</select></div><div class="field wide"><label for="teacher-notice-year">Akademska godina</label><select id="teacher-notice-year" required disabled></select></div><div class="field wide"><label for="teacher-notice-title">Naslov</label><input id="teacher-notice-title" maxlength="200" required></div><div class="field wide"><label for="teacher-notice-message">Poruka</label><textarea id="teacher-notice-message" rows="5" maxlength="2000" required></textarea></div></div><p id="teacher-notice-recipients" class="muted">${courses.length ? "Odaberite kolegij i akademsku godinu." : "Nemate dodijeljenih kolegija."}</p><p id="teacher-notice-progress" role="status" aria-live="polite"></p><div id="teacher-notice-error" role="alert"></div><div class="form-actions"><button type="button" class="button" id="teacher-notice-cancel">Odustani</button><button type="submit" class="button primary" disabled>Pošalji obavijest</button></div></form>`;
    const form = document.getElementById("teacher-notice-form"),
      course = form.querySelector("#teacher-notice-course"),
      year = form.querySelector("#teacher-notice-year"),
      button = form.querySelector('[type="submit"]');
    const selectedYear = () => (year.value === "__legacy__" ? "" : year.value);
    function preview() {
      const c = courses.find((c) => c.id === course.value);
      if (!c || !year.value) {
        button.disabled = true;
        form.querySelector("#teacher-notice-recipients").textContent =
          "Odaberite kolegij i akademsku godinu.";
        return;
      }
      const recipients = courseNoticeRecipients(
        c,
        enrollments,
        context.user.uid,
        selectedYear(),
      );
      const offline = enrollments.filter(
        (en) =>
          en.courseId === c.id &&
          en.status === "Odobreno" &&
          (en.academicYear || "") === selectedYear() &&
          !en.ownerUid,
      ).length;
      form.querySelector("#teacher-notice-recipients").textContent =
        `Obavijest u aplikaciji primit će ${recipients.length} studenata s odobrenim upisom.${offline ? ` Upisa bez povezanog računa: ${offline}.` : ""}`;
      button.disabled = !recipients.length;
    }
    function chooseCourse() {
      const c = courses.find((c) => c.id === course.value);
      const years = c
        ? c.academicYear
          ? [c.academicYear]
          : [
              ...new Set(
                enrollments
                  .filter(
                    (en) => en.courseId === c.id && en.status === "Odobreno",
                  )
                  .map((en) => en.academicYear || ""),
              ),
            ]
              .sort()
              .reverse()
        : [];
      year.innerHTML =
        (years.length !== 1
          ? '<option value="">Odaberite godinu</option>'
          : "") +
        years
          .map(
            (y) =>
              `<option value="${e(y || "__legacy__")}">${e(y || "Bez navedene akademske godine")}</option>`,
          )
          .join("");
      year.disabled = !years.length;
      preview();
    }
    course.addEventListener("change", chooseCourse);
    year.addEventListener("change", preview);
    form
      .querySelector("#teacher-notice-cancel")
      .addEventListener("click", closeDialog);
    if (courses.some((c) => c.id === courseId)) {
      course.value = courseId;
      chooseCourse();
    }
    const operationId = crypto.randomUUID();
    let draft;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      draft ||= {
        courseId: course.value,
        academicYear: selectedYear(),
        title: form.querySelector("#teacher-notice-title").value.trim(),
        message: form.querySelector("#teacher-notice-message").value.trim(),
      };
      if (!draft.title || !draft.message) {
        draft = undefined;
        form.querySelector("#teacher-notice-error").textContent =
          "Unesite naslov i poruku.";
        return;
      }
      button.disabled = true;
      form
        .querySelectorAll("input,textarea,select")
        .forEach((input) => (input.disabled = true));
      form.querySelector("#teacher-notice-error").textContent = "";
      try {
        const result = await context.repository.sendCourseNotice(
          draft,
          operationId,
          ({ sent, total }) => {
            if (form.isConnected)
              form.querySelector("#teacher-notice-progress").textContent =
                `Dostavljeno ${sent}/${total}.`;
          },
        );
        if (!form.isConnected) return;
        closeDialog();
        await onSaved?.(result);
      } catch (error) {
        if (form.isConnected) {
          form.querySelector("#teacher-notice-error").textContent =
            errorMessage(error);
          button.textContent = "Ponovi slanje preostalima";
          button.disabled = false;
        }
      }
    });
  } catch (error) {
    if (loading.isConnected) {
      loading.textContent = errorMessage(error);
      loading.className = "notice error";
    }
  }
}
