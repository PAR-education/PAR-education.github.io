// Pointer capture supports mouse, pen and touch without relying on HTML5 drag events.
export function bindScheduleDrag(
  button,
  root,
  record,
  { isBusy, onStart, onEnd, onDrop },
) {
  let gesture = null,
    ghost = null,
    frame;
  button.draggable = false;
  button.classList.add("draggable-lesson");
  function target(x, y) {
    const slot = document.elementFromPoint(x, y)?.closest(".drop-slot");
    return slot && root.contains(slot) ? slot : null;
  }
  function paint() {
    if (!gesture?.moved) return;
    ghost.style.left = gesture.x - gesture.offsetX + "px";
    ghost.style.top = gesture.y - gesture.offsetY + "px";
    root
      .querySelectorAll(".drop-active")
      .forEach((el) => el.classList.remove("drop-active"));
    target(gesture.x, gesture.y)?.classList.add("drop-active");
  }
  function scroll() {
    if (!gesture?.moved || !root.isConnected) return;
    if (gesture.y > innerHeight - 45) window.scrollBy(0, 12);
    else if (gesture.y < 90) window.scrollBy(0, -12);
    const grid = root.querySelector(".timetable"),
      box = grid.getBoundingClientRect();
    if (gesture.x > box.right - 30) grid.scrollLeft += 12;
    else if (gesture.x < box.left + 30) grid.scrollLeft -= 12;
    paint();
    frame = requestAnimationFrame(scroll);
  }
  function cleanup() {
    gesture = null;
    ghost?.remove();
    ghost = null;
    cancelAnimationFrame(frame);
    button.classList.remove("dragging");
    root.classList.remove("schedule-dragging");
    root
      .querySelectorAll(".drop-active")
      .forEach((el) => el.classList.remove("drop-active"));
  }
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isBusy() || gesture) return;
    const box = button.getBoundingClientRect();
    gesture = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      moved: false,
    };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (
      !gesture.moved &&
      Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 6
    ) {
      gesture.moved = true;
      onStart();
      button.classList.add("dragging");
      root.classList.add("schedule-dragging");
      ghost = button.cloneNode(true);
      ghost.removeAttribute("data-event");
      ghost.removeAttribute("title");
      ghost.tabIndex = -1;
      ghost.setAttribute("aria-hidden", "true");
      ghost.classList.remove("dragging");
      ghost.classList.add("schedule-ghost");
      ghost.style.width = button.getBoundingClientRect().width + "px";
      document.body.append(ghost);
      frame = requestAnimationFrame(scroll);
    }
    if (gesture.moved) {
      event.preventDefault();
      paint();
    }
  });
  button.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const moved = gesture.moved,
      slot = moved ? target(event.clientX, event.clientY) : null;
    const value = slot
      ? { room: slot.dataset.room, time: slot.dataset.time }
      : null;
    cleanup();
    if (button.hasPointerCapture(event.pointerId))
      button.releasePointerCapture(event.pointerId);
    if (moved) {
      event.preventDefault();
      onEnd();
      if (value) onDrop(record, value);
    }
  });
  button.addEventListener("pointercancel", () => {
    cleanup();
    onEnd();
  });
  button.addEventListener("lostpointercapture", () => {
    if (gesture) {
      cleanup();
      onEnd();
    }
  });
}
