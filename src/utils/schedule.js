import { validateFields } from "./validation.js";
export const defaultRooms = [
  "Dvorana PAR",
  "Dvorana 1",
  "Dvorana 2",
  "Inkubator",
  "IT Lab 1",
];
export const minutes = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Vrijeme nije ispravno.");
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const timeAt = (value) =>
  String(Math.floor(value / 60)).padStart(2, "0") +
  ":" +
  String(value % 60).padStart(2, "0");
export const durationOf = (row) =>
  row.endTime
    ? minutes(row.endTime) - minutes(row.time)
    : Math.min(120, 1439 - minutes(row.time));
export function scheduleConflicts(events, target, excludeId) {
  const start = minutes(target.time),
    end = minutes(target.endTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target.date || "") || !target.room?.trim())
    throw new Error("Odaberite datum i dvoranu.");
  if (end <= start) throw new Error("Završetak mora biti nakon početka.");
  return events
    .filter(
      (row) =>
        row.id !== excludeId &&
        row.date === target.date &&
        row.room.trim() === target.room.trim() &&
        minutes(row.time) < end &&
        start < minutes(row.time) + durationOf(row),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}
export function availableSlots(
  events,
  {
    date = "",
    room = "",
    time = "",
    duration = 90,
    from,
    days = 14,
    limit = 12,
    excludeId,
  } = {},
) {
  duration = Number(duration);
  if (!Number.isInteger(duration) || duration < 15 || duration > 720)
    throw new Error("Trajanje mora biti između 15 i 720 minuta.");
  const first = date || from;
  validateFields(
    [{ key: "date", label: "Datum", type: "date", required: true }],
    { date: first },
  );
  const rooms = room
    ? [room]
    : [...new Set([...defaultRooms, ...events.map((row) => row.room)])];
  const result = [];
  for (let d = 0; d < (date ? 1 : days); d++) {
    const value = new Date(first + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + d);
    const day = value.toISOString().slice(0, 10);
    const starts = time
      ? [minutes(time)]
      : Array.from({ length: 25 }, (_, i) => 480 + i * 30);
    for (const start of starts) {
      if (start + duration > (time ? 1439 : 1200)) continue;
      for (const location of rooms) {
        const target = {
          date: day,
          room: location,
          time: timeAt(start),
          endTime: timeAt(start + duration),
        };
        if (!scheduleConflicts(events, target, excludeId).length)
          result.push(target);
        if (result.length === limit) return result;
      }
    }
  }
  return result;
}
export function prepareCalendarMove(record, target, events = []) {
  const { date, time, room } = validateFields(
    [
      { key: "date", label: "Datum", type: "date", required: true },
      { key: "time", label: "Početak", type: "time", required: true },
      { key: "room", label: "Dvorana", required: true, maxLength: 200 },
    ],
    {
      date: target.date || record.date,
      time: target.time || record.time,
      room: target.room || record.room,
    },
  );
  const end = target.endTime
    ? minutes(target.endTime)
    : minutes(time) + durationOf(record);
  if (end <= minutes(time) || end >= 1440)
    throw new Error("Završetak mora biti nakon početka i unutar istog dana.");
  const collision = scheduleConflicts(
    events,
    { date, time, endTime: timeAt(end), room },
    record.id,
  )[0];
  if (collision)
    throw new Error(
      "Termin se preklapa s događajem „" +
        collision.title +
        "” (" +
        (collision.instructorName || "nastavnik nije naveden") +
        ") · " +
        collision.time +
        "–" +
        timeAt(minutes(collision.time) + durationOf(collision)) +
        ".",
    );
  const day = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"][
    new Date(date + "T12:00:00Z").getUTCDay()
  ];
  return { date, time, endTime: timeAt(end), room: room.trim(), day };
}
export function revisionOf(row) {
  const value = row.updatedAt;
  const stamp = value?.$timestamp;
  return JSON.stringify([
    value?.seconds !== undefined
      ? [value.seconds, value.nanoseconds]
      : stamp
        ? [stamp.seconds, stamp.nanoseconds]
        : value,
    row.date,
    row.time,
    row.endTime,
    row.room,
  ]);
}
