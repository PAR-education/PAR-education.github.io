// These aliases intentionally identify only numbered rooms, not arbitrary names.
export function roomKey(value) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const number = clean.match(/^(?:dvorana|ucionica|room)\s*([0-9]+)$/);
  return number ? "room-" + Number(number[1]) : clean;
}
export function roomNames(registry = [], current = "") {
  return [
    ...new Set([...registry.map((r) => r.name), current].filter(Boolean)),
  ];
}
export function canonicalRoom(value, registry = []) {
  const key = roomKey(value);
  const room = registry.find((r) =>
    [r.name, ...String(r.aliases || "").split(/[,;\n]+/)].some(
      (name) => roomKey(name) === key,
    ),
  );
  return room?.name || String(value || "").trim();
}
