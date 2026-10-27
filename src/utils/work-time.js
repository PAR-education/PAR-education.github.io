export const workCategories = [
  "Studij",
  "Cjeloživotno obrazovanje",
  "Projekti",
  "Administracija",
  "Ostalo",
  "Nastava",
  "Rad na projektu",
  "Znanstveni rad",
  "Izvanredne aktivnosti",
];
export function workGroup(category) {
  return (
    {
      Nastava: "Studij",
      "Rad na projektu": "Projekti",
      "Znanstveni rad": "Ostalo",
      "Izvanredne aktivnosti": "Ostalo",
    }[category] ||
    category ||
    "Ostalo"
  );
}
export function workValues(values) {
  const data = { ...values };
  if (Boolean(data.startTime) !== Boolean(data.endTime))
    throw new Error("Unesite i početak i završetak ili samo broj sati.");
  if (data.startTime && data.endTime) {
    const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    if (
      ![data.startTime, data.endTime].every((s) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(s),
      ) ||
      data.endTime <= data.startTime
    )
      throw new Error("Završetak mora biti nakon početka, unutar istog dana.");
    data.hours =
      Math.round(
        ((minutes(data.endTime) - minutes(data.startTime)) / 60) * 10000,
      ) / 10000;
  }
  if (
    !Number.isFinite(Number(data.hours)) ||
    Number(data.hours) <= 0 ||
    Number(data.hours) > 24
  )
    throw new Error("Unesite broj sati veći od 0 i najviše 24.");
  data.hours = Number(data.hours);
  return data;
}
export function workConflicts(rows, value, id) {
  if (!value.startTime || !value.endTime) return [];
  return rows.filter(
    (r) =>
      r.id !== id &&
      r.ownerUid === value.ownerUid &&
      r.date === value.date &&
      r.startTime &&
      r.endTime &&
      value.startTime < r.endTime &&
      value.endTime > r.startTime,
  );
}
export function workPeriod(date, view) {
  const d = new Date(date + "T12:00:00Z");
  if (view === "day") return { start: date, end: date, days: [date] };
  let count;
  if (view === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    count = 7;
  } else {
    d.setUTCDate(1);
    count = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
  }
  const days = Array.from({ length: count }, (_, i) => {
    const day = new Date(d);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  return { start: days[0], end: days.at(-1), days };
}
export function workMatrix(entries, plans, days, ownerUid) {
  const groups = new Map();
  const get = (r) => {
    const category = workGroup(r.category),
      activity = r.activity || r.description || category;
    const key = JSON.stringify([category, activity, r.projectId || ""]);
    if (!groups.has(key))
      groups.set(key, {
        category,
        activity,
        projectId: r.projectId || "",
        planned: null,
        actual: 0,
        days: {},
      });
    return groups.get(key);
  };
  for (const r of plans.filter(
    (r) => r.ownerUid === ownerUid && r.month === days[0].slice(0, 7),
  )) {
    const g = get(r);
    g.planned = (g.planned ?? 0) + Number(r.plannedHours || 0);
  }
  for (const r of entries.filter(
    (r) => r.ownerUid === ownerUid && days.includes(r.date),
  )) {
    const g = get(r),
      hours = Number(r.hours || 0);
    g.days[r.date] = (g.days[r.date] || 0) + hours;
    g.actual += hours;
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category, "hr") ||
      a.activity.localeCompare(b.activity, "hr"),
  );
}
