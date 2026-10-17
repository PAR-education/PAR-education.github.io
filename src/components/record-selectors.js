import { escapeHTML as e } from "../utils/helpers.js";
import { instructorIds } from "../utils/instructors.js";
import { defaultRooms } from "../utils/schedule.js";
import { canonicalRoom } from "../utils/rooms.js";
export async function mountRecordSelectors(
  form,
  name,
  context,
  record,
  isCurrent,
) {
  const list = (n) => context.repository.listAll(n);
  function replace(key, html, multiple = false) {
    const input = form.elements[key];
    if (!input) return null;
    const select = document.createElement("select");
    select.id = input.id;
    select.name = key;
    select.required = input.required;
    select.multiple = multiple;
    select.innerHTML = html;
    input.replaceWith(select);
    return select;
  }
  if (form.elements.instructorUid && context.profile.role === "admin") {
    const users = (await list("users")).filter((u) => u.role === "profesor");
    if (!isCurrent()) return;
    const selected = instructorIds(record);
    const teachers = replace(
      "instructorUids",
      users
        .map(
          (u) =>
            `<option value="${e(u.id)}" ${selected.includes(u.id) ? "selected" : ""}>${e(u.name)} · ${e(u.email)}${u.active ? "" : " (neaktivan)"}</option>`,
        )
        .join(""),
      true,
    );
    const primary = replace(
      "instructorUid",
      '<option value="">Nastavnik još nije dodijeljen</option>' +
        users
          .map(
            (u) =>
              `<option value="${e(u.id)}" ${record.instructorUid === u.id ? "selected" : ""}>${e(u.name)} · ${e(u.email)}</option>`,
          )
          .join(""),
    );
    const missing = selected.filter((id) => !users.some((u) => u.id === id));
    for (const id of missing) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = "Nepoznat račun · " + id;
      option.selected = true;
      teachers?.append(option);
      if (record.instructorUid === id) {
        const copy = option.cloneNode(true);
        primary?.append(copy);
      }
    }
    const update = () => {
      const ids = [...teachers.selectedOptions].map((o) => o.value);
      if (primary.value && !ids.includes(primary.value))
        ids.unshift(primary.value);
      if (!primary.value && ids.length) primary.value = ids[0];
      for (const option of teachers.options)
        option.selected = ids.includes(option.value);
      if (form.elements.instructorName)
        form.elements.instructorName.value = ids
          .map((id) => users.find((u) => u.id === id)?.name || id)
          .join("; ");
    };
    primary?.addEventListener("change", update);
    teachers?.addEventListener("change", update);
  }
  if (form.elements.courseId) {
    const courses = await list("courses");
    if (!isCurrent()) return;
    const allowed =
      context.profile.role === "profesor"
        ? courses.filter((c) => instructorIds(c).includes(context.user.uid))
        : courses;
    const select = replace(
      "courseId",
      '<option value="">Odaberite kolegij</option>' +
        allowed
          .map(
            (c) =>
              `<option value="${e(c.id)}" ${record.courseId === c.id ? "selected" : ""}>${e(c.title)} · ${e(c.semester || "")}</option>`,
          )
          .join(""),
    );
    select.addEventListener("change", () => {
      const course = courses.find((c) => c.id === select.value);
      if (!course) return;
      if (name === "calendarEvents") {
        if (form.elements.instructorUid)
          form.elements.instructorUid.value = course.instructorUid || "";
        if (form.elements.instructorName)
          form.elements.instructorName.value = course.instructorName || "";
        const teachers = form.elements.instructorUids;
        if (teachers) {
          const ids = instructorIds(course);
          for (const id of ids)
            if (![...teachers.options].some((o) => o.value === id)) {
              const option = document.createElement("option");
              option.value = id;
              option.textContent = id;
              teachers.append(option);
            }
          for (const option of teachers.options)
            option.selected = ids.includes(option.value);
        }
      }
      if (form.elements.academicYear)
        form.elements.academicYear.value = course.academicYear || "";
      for (const key of ["title", "courseTitle"])
        if (form.elements[key]) form.elements[key].value = course.title;
    });
  }
  if (form.elements.room) {
    const registry = await list("rooms");
    if (!isCurrent()) return;
    const known = registry.length ? registry.map((r) => r.name) : defaultRooms;
    const value = canonicalRoom(record.room, registry);
    const names = [...new Set([...known, value].filter(Boolean))];
    replace(
      "room",
      '<option value="">Dvorana nije određena</option>' +
        names
          .map(
            (room) =>
              `<option ${value === room ? "selected" : ""}>${e(room)}</option>`,
          )
          .join(""),
    );
  }
  if (context.profile.role === "admin" && form.elements.ownerUid) {
    const users = await list("users");
    if (!isCurrent()) return;
    replace(
      "ownerUid",
      '<option value="">Račun još nije povezan</option>' +
        users
          .map(
            (u) =>
              `<option value="${e(u.id)}" ${record.ownerUid === u.id ? "selected" : ""}>${e(u.name)} · ${e(u.email)}</option>`,
          )
          .join(""),
    );
  }
}
