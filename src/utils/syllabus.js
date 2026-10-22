// Presentation only: keep the imported source intact for editing and backups.
export function syllabusFields(fields) {
  const visible = new Set([
    "title",
    "academicYear",
    "ects",
    "semester",
    "instructorName",
    "room",
    "description",
    "outcomes",
    "literature",
  ]);
  return fields
    .filter((field) => visible.has(field.key))
    .map((field) =>
      field.key === "academicYear"
        ? { ...field, label: "Akademska godina" }
        : field,
    );
}
export function syllabusRecord(record) {
  const clean = (value) =>
    String(value || "")
      .replace(/PD-KT-\d+,?\s*rev\.?\s*\d+\s*p\.?\s*\d+\s*\/\s*\d+/gi, "")
      .replace(/Izvor:\s*[^\n]*?(?=Kontakt nastavnika:|$)/gi, "")
      .trim();
  let description = clean(record.description);
  const goal = description.search(/\bGoal\b/);
  if (goal >= 0) description = description.slice(goal);
  if (record.outcomes) {
    const start = description.indexOf("Learning Outcomes");
    if (start >= 0) {
      const end = description.indexOf("Teaching Methods", start);
      description =
        description.slice(0, start) + (end >= 0 ? description.slice(end) : "");
    }
  }
  const format = (value) =>
    clean(value)
      .replace(/\s*●\s*/g, "\n• ")
      .replace(
        /\s+(Topics|Teaching Methods|3\. GRADING SYSTEM|Kontakt nastavnika:)\s*/g,
        "\n\n$1\n",
      );
  return {
    ...record,
    description: format(description),
    outcomes: format(record.outcomes),
    literature: format(record.literature),
  };
}
