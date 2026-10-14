import { validateFields } from "./validation.js";
import { zonedUTC } from "./calendar.js";
export function rangeBounds(range) {
  const dates = validateFields(
    [
      { key: "from", label: "Od datuma", type: "date", required: true },
      { key: "to", label: "Do datuma", type: "date", required: true },
    ],
    range || {},
  );
  if (dates.to < dates.from)
    throw new Error("Završni datum mora biti isti ili nakon početnog datuma.");
  const next = new Date(dates.to + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    ...dates,
    start: Date.parse(zonedUTC(dates.from, "00:00")),
    end: Date.parse(zonedUTC(next.toISOString().slice(0, 10), "00:00")),
  };
}
export function recordTimestamp(record) {
  for (const value of [record.updatedAt, record.createdAt]) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    const stamp = value?.$timestamp;
    if (stamp && Number.isInteger(stamp.seconds))
      return stamp.seconds * 1000 + (stamp.nanoseconds || 0) / 1e6;
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ) {
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
  }
  return null;
}
