import { canEditCalendar } from "../auth/permissions.js";
import { teachingConflicts, revisionOf } from "../utils/schedule.js";
export function planSeries(events, record, values, role, uid) {
  if (!record.seriesId) throw new Error("Termin nije dio serije.");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.endTime) ||
    values.endTime <= values.time
  )
    throw new Error("Provjerite početak i završetak.");
  const targets = events.filter((r) => r.seriesId === record.seriesId);
  if (!targets.length || targets.some((r) => !canEditCalendar(role, uid, r)))
    throw new Error("Nemate ovlasti za cijelu seriju.");
  const next = targets.map((r) => ({
    ...r,
    expectedRevision: revisionOf(r),
    time: values.time,
    endTime: values.endTime,
    room: values.room,
  }));
  const final = [
    ...events.filter((r) => r.seriesId !== record.seriesId),
    ...next,
  ];
  for (const row of next) {
    const conflicts = teachingConflicts(final, row, row.id);
    if (conflicts.length)
      throw new Error(
        `${row.date}: zauzeto · ${conflicts.map((r) => r.title).join(", ")}`,
      );
  }
  return next;
}
