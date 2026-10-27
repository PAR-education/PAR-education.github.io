import { workMatrix, workPeriod } from "../utils/work-time.js";
export const workMonths = [
  "Siječanj",
  "Veljača",
  "Ožujak",
  "Travanj",
  "Svibanj",
  "Lipanj",
  "Srpanj",
  "Kolovoz",
  "Rujan",
  "Listopad",
  "Studeni",
  "Prosinac",
];
const groups = [
  "Studij",
  "Cjeloživotno obrazovanje",
  "Projekti",
  "Administracija",
  "Ostalo",
];
const safeText = (s) => String(s || "");
export function buildWorkWorkbook(
  Excel,
  { year, ownerUid, ownerName, entries, plans },
) {
  const book = new Excel.Workbook();
  book.creator = "PAR Education";
  for (let m = 1; m <= 12; m++) {
    const sheet = book.addWorksheet(workMonths[m - 1]);
    const period = workPeriod(
      `${year}-${String(m).padStart(2, "0")}-01`,
      "month",
    );
    const n = period.days.length,
      actualCol = n + 3,
      deltaCol = n + 4;
    const rows = workMatrix(entries, plans, period.days, ownerUid);
    sheet.mergeCells(2, 1, 2, deltaCol);
    sheet.getCell(2, 1).value = "EVIDENCIJA RADA";
    sheet.getCell(3, 1).value = safeText(ownerName);
    sheet.getCell(3, 2).value = "PLANIRANO [h]";
    sheet.mergeCells(3, 3, 3, n + 2);
    sheet.getCell(3, 3).value = `${workMonths[m - 1]} ${year}`;
    sheet.getCell(3, actualCol).value = "REALIZIRANO [h]";
    sheet.getCell(3, deltaCol).value = "ODSTUPANJE [h]";
    sheet.getCell(4, 1).value = "PROJEKTI / AKTIVNOSTI";
    period.days.forEach((date, i) => {
      sheet.getCell(4, i + 3).value = ["N", "P", "U", "S", "Č", "P", "S"][
        new Date(date + "T12:00:00Z").getUTCDay()
      ];
      sheet.getCell(5, i + 3).value = i + 1;
    });
    let r = 6;
    const detailRows = [];
    for (const category of groups) {
      const header = r++;
      sheet.getCell(header, 1).value = category;
      const first = r,
        items = rows.filter((row) => row.category === category);
      for (const row of items.length ? items : [null, null, null]) {
        const ix = r++;
        detailRows.push(ix);
        sheet.getCell(ix, 1).value = row ? safeText(row.activity) : "";
        if (row?.projectId)
          sheet.getCell(ix, 1).note = "PAR project: " + row.projectId;
        if (row?.planned !== null && row)
          sheet.getCell(ix, 2).value = row.planned;
        period.days.forEach((date, i) => {
          if (row?.days[date] !== undefined)
            sheet.getCell(ix, i + 3).value = row.days[date];
        });
        const lastLetter = sheet.getColumn(n + 2).letter;
        sheet.getCell(ix, actualCol).value = {
          formula: `SUM(C${ix}:${lastLetter}${ix})`,
          result: row?.actual || 0,
        };
        const actualLetter = sheet.getColumn(actualCol).letter;
        sheet.getCell(ix, deltaCol).value = {
          formula: `IF(B${ix}="","",B${ix}-${actualLetter}${ix})`,
          result: row?.planned == null ? "" : row.planned - row.actual,
        };
      }
      for (const col of [2, actualCol, deltaCol])
        sheet.getCell(header, col).value = {
          formula: `SUM(${sheet.getColumn(col).letter}${first}:${sheet.getColumn(col).letter}${r - 1})`,
        };
      sheet.getRow(header).font = { bold: true, color: { argb: "FF17243C" } };
      sheet.getRow(header).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDCE6F1" },
      };
    }
    sheet.getCell(r, 1).value = "UKUPNO";
    for (let col = 2; col <= deltaCol; col++)
      sheet.getCell(r, col).value = {
        formula: `SUM(${detailRows.map((row) => `${sheet.getColumn(col).letter}${row}`).join(",")})`,
      };
    sheet.getColumn(1).width = 44;
    sheet.getColumn(2).width = 14;
    for (let col = 3; col <= n + 2; col++) sheet.getColumn(col).width = 5;
    sheet.getColumn(actualCol).width = 15;
    sheet.getColumn(deltaCol).width = 15;
    sheet.eachRow((row, rowIndex) => {
      row.height = rowIndex < 6 ? 29 : 25;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: cell.col === 1 ? "left" : "center",
        };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFCAD5E2" } },
        };
        if (cell.col > 1 && rowIndex >= 6) cell.numFmt = "0.##";
      });
    });
    for (const ix of [2, 3, 4, 5, r]) {
      sheet.getRow(ix).font = { bold: true, size: ix === 2 ? 16 : 10 };
    }
    for (const date of period.days)
      if ([0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay())) {
        const col = Number(date.slice(-2)) + 2;
        for (let ix = 4; ix < r; ix++)
          sheet.getCell(ix, col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0F3F7" },
          };
      }
    sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];
    sheet.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "2:5",
      printArea: `A2:${sheet.getColumn(deltaCol).letter}${r}`,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.1,
        footer: 0.1,
      },
    };
  }
  book.calcProperties.fullCalcOnLoad = true;
  return book;
}
const value = (cell) => {
  const v = cell.value;
  return v && typeof v === "object"
    ? (v.result ?? (v.richText ? v.richText.map((x) => x.text).join("") : ""))
    : v;
};
export function parseWorkWorkbook(book, year, person) {
  if (!/^\d{4}$/.test(String(year)) || year < 2000 || year > 2100)
    throw new Error("Unesite godinu između 2000. i 2100.");
  if (!person?.ownerUid || !person?.ownerName)
    throw new Error("Odaberite zaposlenika prije uvoza.");
  const entries = [],
    plans = [],
    errors = [];
  for (const sheet of book.worksheets) {
    const m =
      workMonths.findIndex(
        (s) => s.toLocaleLowerCase("hr") === sheet.name.toLocaleLowerCase("hr"),
      ) + 1;
    if (!m) continue;
    if (!String(value(sheet.getCell(4, 1)) || "").includes("AKTIVNOSTI")) {
      errors.push(`${sheet.name}: očekuje se predložak Evidencija rada.`);
      continue;
    }
    const month = `${year}-${String(m).padStart(2, "0")}`,
      days = workPeriod(month + "-01", "month").days;
    let category = "";
    for (let r = 6; r <= Math.min(sheet.rowCount, 500); r++) {
      const activity = String(value(sheet.getCell(r, 1)) || "").trim();
      const group =
        groups.find(
          (g) => g.toLocaleLowerCase("hr") === activity.toLocaleLowerCase("hr"),
        ) ||
        (activity.toLocaleLowerCase("hr") === "akademski studij"
          ? "Studij"
          : "");
      if (group) {
        category = group;
        continue;
      }
      if (/^(UKUPNO|S\s*:)/i.test(activity)) break;
      const planned = value(sheet.getCell(r, 2));
      const dayValues = days.map((date, i) => ({
        date,
        hours: value(sheet.getCell(r, i + 3)),
      }));
      const nonblank = (v) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        String(v).trim() !== "/" &&
        String(v).trim() !== "";
      if (!nonblank(planned) && !dayValues.some((v) => nonblank(v.hours)))
        continue;
      if (!activity || !category) {
        errors.push(
          `${sheet.name}, redak ${r}: nedostaje naziv aktivnosti ili skupina.`,
        );
        continue;
      }
      const rawNote = sheet.getCell(r, 1).note;
      const note =
        typeof rawNote === "string"
          ? rawNote
          : rawNote?.texts?.map((t) => t.text || "").join("") || "";
      const projectId =
        typeof note === "string" && note.startsWith("PAR project: ")
          ? note.slice(13)
          : "";
      const base = { ...person, activity, category, projectId };
      if (nonblank(planned)) {
        if (
          typeof planned !== "number" ||
          !Number.isFinite(planned) ||
          planned < 0 ||
          planned > 744
        )
          errors.push(`${sheet.name}, redak ${r}: neispravan plan sati.`);
        else plans.push({ ...base, month, plannedHours: planned });
      }
      for (const { date, hours } of dayValues)
        if (nonblank(hours)) {
          if (
            typeof hours !== "number" ||
            !Number.isFinite(hours) ||
            hours < 0 ||
            hours > 24
          )
            errors.push(
              `${sheet.name}, redak ${r}, ${date}: neispravan broj sati.`,
            );
          else if (hours > 0)
            entries.push({ ...base, date, hours, description: activity });
        }
    }
  }
  if (
    !book.worksheets.some((s) =>
      workMonths.some((m) => m.toLowerCase() === s.name.toLowerCase()),
    )
  )
    throw new Error("Datoteka nema mjesečne listove prema predlošku.");
  const combined = (rows, periodKey, hoursKey) => {
    const map = new Map();
    for (const r of rows) {
      const key = JSON.stringify([
        r.ownerUid,
        r[periodKey],
        r.category,
        r.activity,
        r.projectId,
      ]);
      const old = map.get(key);
      if (old) old[hoursKey] += r[hoursKey];
      else map.set(key, { ...r });
    }
    return [...map.values()];
  };
  const combinedEntries = combined(entries, "date", "hours"),
    combinedPlans = combined(plans, "month", "plannedHours");
  for (const date of new Set(combinedEntries.map((r) => r.date)))
    if (
      combinedEntries
        .filter((r) => r.date === date)
        .reduce((s, r) => s + r.hours, 0) > 24.0001
    )
      errors.push(`${date}: zbroj dnevnih sati je veći od 24.`);
  return { entries: combinedEntries, plans: combinedPlans, errors };
}
export function prepareWorkTableImport(parsed, entries, plans) {
  const errors = [...parsed.errors],
    actions = [];
  for (const data of parsed.entries) {
    const matches = entries.filter(
      (r) =>
        r.ownerUid === data.ownerUid &&
        r.date === data.date &&
        (r.activity || r.description) === data.activity &&
        (r.projectId || "") === data.projectId &&
        (r.category === data.category ||
          {
            Nastava: "Studij",
            "Rad na projektu": "Projekti",
            "Znanstveni rad": "Ostalo",
            "Izvanredne aktivnosti": "Ostalo",
          }[r.category] === data.category),
    );
    const sameTotal =
      matches.length > 0 &&
      Math.abs(matches.reduce((s, r) => s + Number(r.hours), 0) - data.hours) <
        0.0001;
    if (
      matches.length > 0 &&
      !sameTotal &&
      (matches.length > 1 || matches.some((r) => r.startTime || r.endTime))
    )
      errors.push(
        `${data.date}, ${data.activity}: postoje detaljne aktivnosti s drukčijim zbrojem sati. Uredite ih u dnevnom pregledu.`,
      );
    actions.push({
      kind: "workEntries",
      data,
      id: matches.length === 1 ? matches[0].id : null,
      skip: sameTotal,
    });
  }
  for (const data of parsed.plans) {
    const matches = plans.filter(
      (r) =>
        r.ownerUid === data.ownerUid &&
        r.month === data.month &&
        r.category === data.category &&
        r.activity === data.activity &&
        (r.projectId || "") === data.projectId,
    );
    if (matches.length > 1)
      errors.push(
        `${data.month}, ${data.activity}: više postojećih planova. Prvo ih uskladite.`,
      );
    actions.push({
      kind: "workPlans",
      data,
      id: matches[0]?.id,
      skip:
        matches.length === 1 &&
        Number(matches[0].plannedHours) === data.plannedHours,
    });
  }
  return { actions, errors };
}
