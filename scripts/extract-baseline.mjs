// Local migration utility. The reference is ignored and never needed to serve the app.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(".reference/original.html", "utf8");
const start = source.indexOf("const DUMMY_DATA =");
const end = source.indexOf("window.exportFormalTimesheet", start);
const block = source
  .slice(start, end)
  .replace(/let chart1 = null, chart2 = null, chart3 = null;/, "");
const original = vm.runInNewContext(
  `${block}; JSON.stringify(DUMMY_DATA)`,
  {},
  { timeout: 1000 },
);
const data = JSON.parse(original);
// Retain the prototype fixtures but anonymize people and email addresses before publication.
const replacements = new Map();
data.students.forEach((row, i) => {
  replacements.set(row.name, `Ogledni student ${i + 1}`);
  row.name = `Ogledni student ${i + 1}`;
  row.email = `student${i + 1}@example.test`;
  row.jmbag = `DEMO-${String(i + 1).padStart(5, "0")}`;
  row.img = "";
});
data.employees.forEach((row, i) => {
  replacements.set(row.name, `Ogledni zaposlenik ${i + 1}`);
  row.name = `Ogledni zaposlenik ${i + 1}`;
  row.email = `zaposlenik${i + 1}@example.test`;
});
let json = JSON.stringify(data, null, 2);
for (const [name, replacement] of replacements)
  json = json.replaceAll(name, replacement);
// Names referenced by inconsistent spelling in the old data are removed as well.
json = json.replace(
  /(?:prof\.|dr\.|sc\.|doc\.|izv\.|pred\.)[^"\n]+/g,
  "Ogledni nastavnik",
);
json = json
  .replace(/[A-Za-z0-9_.+-]+@(?:student\.)?par\.hr/g, "demo@example.test")
  .replace(/"jmbag": "[0-9]+"/g, '"jmbag": "DEMO-ONLY"');
const sanitized = JSON.parse(json);
function removeRemainingIdentities(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(removeRemainingIdentities);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      [
        "student",
        "empName",
        "employee",
        "prof",
        "assignedTo",
        "authors",
      ].includes(key) &&
      !child.startsWith("Ogledni")
    )
      value[key] = "Ogledna osoba";
    if (
      ["professors", "students"].includes(key) &&
      Array.isArray(child) &&
      child.every((item) => typeof item === "string")
    )
      value[key] = child.map((_, i) => `Ogledna osoba ${i + 1}`);
    else removeRemainingIdentities(child);
  }
}
removeRemainingIdentities(sanitized);
writeFileSync(
  "src/data/prototype-fixtures.json",
  JSON.stringify(sanitized, null, 2) + "\n",
);
const evalStart = source.indexOf("const EVAL_DATA =");
const evalEnd = source.indexOf("let currentEvalEmp", evalStart);
const templates = JSON.parse(
  vm.runInNewContext(
    source.slice(evalStart, evalEnd) + "; JSON.stringify(EVAL_DATA)",
    {},
    { timeout: 1000 },
  ),
);
writeFileSync(
  "src/data/evaluation-templates.json",
  JSON.stringify(
    templates.map((row, i) => ({
      id: `template-${i + 1}`,
      department: row.department,
      questions: row.questions,
    })),
    null,
    2,
  ) + "\n",
);
const functions = [
  ...source.matchAll(/(?:window\.(\w+)\s*=\s*function|function\s+(\w+)\s*\()/g),
].map((match) => match[1] || match[2]);
writeFileSync(
  ".reference/function-inventory.json",
  JSON.stringify(functions, null, 2),
);
process.stdout.write(
  `Extracted ${data.students.length} students, ${data.employees.length} employees and ${functions.length} function names.\n`,
);
