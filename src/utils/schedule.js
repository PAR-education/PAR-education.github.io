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
  const collision = events.find(
    (row) =>
      row.id !== record.id &&
      row.date === date &&
      row.room === room &&
      minutes(row.time) < end &&
      minutes(time) < minutes(row.time) + durationOf(row),
  );
  if (collision)
    throw new Error(
      "Termin se preklapa s događajem „" +
        collision.title +
        "” u ovoj dvorani.",
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
