import { instructorIds } from "./instructors.js";
import { roomKey } from "./rooms.js";
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
// The pointer is anchored at the original grab point, snapped to 15 minutes.
export function calendarDropTime(
  startMinute,
  pointerOffset,
  grabOffset,
  duration,
  scale = 1.2,
) {
  const start =
    Math.round((startMinute + (pointerOffset - grabOffset) / scale) / 15) * 15;
  return start >= 0 && start + duration < 1440 ? timeAt(start) : null;
}
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
        roomKey(row.room) === roomKey(target.room) &&
        minutes(row.time) < end &&
        start < minutes(row.time) + durationOf(row),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}
export function teachingConflicts(events, target, excludeId) {
  const end = minutes(
    target.endTime || timeAt(minutes(target.time) + durationOf(target)),
  );
  if (end <= minutes(target.time))
    throw new Error("Završetak mora biti nakon početka.");
  if (!target.date) throw new Error("Odaberite datum i dvoranu.");
  return events.filter(
    (row) =>
      row.id !== excludeId &&
      row.date === target.date &&
      ((target.room?.trim() && roomKey(row.room) === roomKey(target.room)) ||
        instructorIds(target).some((uid) => instructorIds(row).includes(uid)) ||
        (target.group &&
          target.study &&
          row.group === target.group &&
          row.study === target.study)) &&
      minutes(row.time) < end &&
      minutes(target.time) < minutes(row.time) + durationOf(row),
  );
}
export function calendarLanes(events) {
  const sorted = [...events].sort((a, b) => minutes(a.time) - minutes(b.time)),
    result = [];
  let cluster = [],
    end = -1;
  function flush() {
    const ends = [];
    for (const event of cluster) {
      let lane = ends.findIndex((e) => e <= minutes(event.time));
      if (lane < 0) lane = ends.length;
      ends[lane] = minutes(event.time) + durationOf(event);
      result.push({ event, lane, cluster });
    }
    result
      .filter((r) => r.cluster === cluster)
      .forEach((r) => (r.columns = ends.length));
    cluster = [];
  }
  for (const event of sorted) {
    if (minutes(event.time) >= end && cluster.length) flush();
    cluster.push(event);
    end = Math.max(
      cluster.length === 1 ? -1 : end,
      minutes(event.time) + durationOf(event),
    );
  }
  if (cluster.length) flush();
  return result;
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
    instructorUid = "",
    group = "",
    study = "",
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
    : [
        ...new Set([
          ...defaultRooms,
          ...events.map((row) => row.room).filter(Boolean),
        ]),
      ];
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
          instructorUid,
          group,
          study,
          date: day,
          room: location,
          time: timeAt(start),
          endTime: timeAt(start + duration),
        };
        if (!teachingConflicts(events, target, excludeId).length)
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
      {
        key: "room",
        label: "Dvorana",
        required: !(target.online ?? record.online),
        maxLength: 200,
      },
    ],
    {
      date: target.date || record.date,
      time: target.time || record.time,
      room: target.room ?? record.room,
    },
  );
  const end = target.endTime
    ? minutes(target.endTime)
    : minutes(time) + durationOf(record);
  if (end <= minutes(time) || end >= 1440)
    throw new Error("Završetak mora biti nakon početka i unutar istog dana.");
  const collision = teachingConflicts(
    events,
    { ...record, date, time, endTime: timeAt(end), room },
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
  const extra = {};
  if (Object.hasOwn(target, "online")) extra.online = target.online;
  if (Object.hasOwn(target, "description"))
    extra.description = target.description;
  const metadata = validateFields(
    [
      {
        key: "online",
        label: "Online nastava",
        type: "checkbox",
        required: false,
      },
      {
        key: "description",
        label: "Napomena / poveznica",
        maxLength: 2000,
        required: false,
      },
    ],
    extra,
  );
  return {
    date,
    time,
    endTime: timeAt(end),
    room: room.trim(),
    day,
    ...(Object.hasOwn(extra, "online") ? { online: metadata.online } : {}),
    ...(Object.hasOwn(extra, "description")
      ? { description: metadata.description }
      : {}),
  };
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
