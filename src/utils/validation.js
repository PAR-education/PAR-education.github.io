export function validateFields(fields, values) {
  const result = {};
  for (const field of fields) {
    let value = values[field.key];
    if (typeof value === "string") value = value.trim();
    if (field.required && (value === "" || value == null))
      throw new Error(`${field.label}: obavezno polje.`);
    if (value === "" || value == null) {
      result[field.key] = "";
      continue;
    }
    if (field.type === "number") {
      value = Number(value);
      if (
        !Number.isFinite(value) ||
        (field.min != null && value < field.min) ||
        (field.max != null && value > field.max) ||
        (field.integer && !Number.isInteger(value))
      )
        throw new Error(
          `${field.label}: vrijednost nije u dopuštenom rasponu.`,
        );
    } else {
      if (String(value).length > (field.maxLength || 2000))
        throw new Error(`${field.label}: tekst je predugačak.`);
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw new Error("E-adresa nije ispravna.");
      if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error(`${field.label}: datum nije ispravan.`);
      if (field.type === "date") {
        const date = new Date(`${value}T12:00:00Z`);
        if (
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        )
          throw new Error(`${field.label}: datum nije ispravan.`);
      }
      if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        throw new Error(`${field.label}: vrijeme nije ispravno.`);
      if (field.type === "url" && !/^https:\/\//i.test(value))
        throw new Error("Poveznica mora početi s https://.");
      if (field.options && !field.options.includes(value))
        throw new Error(`${field.label}: odaberite ponuđenu vrijednost.`);
    }
    result[field.key] = value;
  }
  if (result.startDate && result.endDate && result.endDate < result.startDate)
    throw new Error("Završni datum mora biti nakon početnog datuma.");
  if (result.startTime && result.endTime && result.endTime <= result.startTime)
    throw new Error("Završno vrijeme mora biti nakon početnog vremena.");
  return result;
}
