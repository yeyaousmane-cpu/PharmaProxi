import "server-only";
import ExcelJS from "exceljs";

/** Première feuille d'un classeur .xlsx convertie en CSV (« ; »), pour réutiliser l'analyseur CSV existant. */
export async function xlsxToCsv(buf: ArrayBuffer, maxRows = 2100): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return "";
  const lines: string[] = [];
  const cellText = (v: ExcelJS.CellValue): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
      if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
      if ("text" in v) return String(v.text);
      return "";
    }
    return String(v);
  };
  const width = Math.min(ws.columnCount, 40);
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > maxRows) return;
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) {
      const t = cellText(row.getCell(c).value).replace(/"/g, '""');
      cells.push(/[;"\n\r]/.test(t) ? `"${t}"` : t);
    }
    lines.push(cells.join(";"));
  });
  return lines.join("\n");
}

/** Classeur .xlsx à une feuille, en-têtes en gras, première ligne figée. */
export async function rowsToXlsx(sheet: string, columns: string[], rows: Record<string, unknown>[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SantéProxi";
  const ws = wb.addWorksheet(sheet.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(40, c.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
