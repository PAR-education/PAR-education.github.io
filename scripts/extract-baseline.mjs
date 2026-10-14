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
// Preserve the supplied prototype's labels and records as requested.
writeFileSync(
  "src/data/prototype-fixtures.json",
  JSON.stringify(data, null, 2) + "\n",
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
