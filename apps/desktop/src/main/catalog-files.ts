import ExcelJS from 'exceljs';
import { bookInputSchema } from '@catalog/contracts';
import type { ImportPreview } from '@catalog/contracts';

export const catalogHeaders = ['מספר מדף', 'שם ספר', 'הנושא', 'שם מחבר'] as const;
const aliases = [
  ['מספר מדף', 'מדף'],
  ['שם ספר', 'שם הספר'],
  ['הנושא', 'נושא'],
  ['שם מחבר', 'מחבר'],
];
const headerText = (value: string) => value.trim().replace(/\s+/g, ' ');

export async function parseBookWorkbook(
  bytes: Uint8Array,
  filename: string,
): Promise<ImportPreview> {
  const preview: ImportPreview = { filename, books: [], issues: [] };
  const fail = (code: ImportPreview['issues'][number]['code']) => ({
    ...preview,
    books: [],
    issues: [{ row: 0, code }],
  });
  if (bytes.byteLength > 5 * 1024 * 1024 || !filename.toLowerCase().endsWith('.xlsx'))
    return fail('INVALID_FILE');
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer, {
      ignoreNodes: ['drawing', 'picture', 'extLst'],
    });
    const sheet = workbook.worksheets[0];
    if (!sheet || workbook.worksheets.slice(1).some((other) => other.actualRowCount > 0))
      return fail('INVALID_FILE');
    if (sheet.rowCount > 10001) return fail('TOO_MANY_ROWS');
    const headers = sheet.getRow(1);
    const indices = aliases.map((names) => {
      let index = 0;
      headers.eachCell((cell, col) => {
        if (names.includes(headerText(cell.text))) index = index ? -1 : col;
      });
      return index;
    });
    if (indices.some((index) => index <= 0)) return fail('HEADERS');
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const relevant = indices;
      if (relevant.every((index) => !row.getCell(index).text.trim())) return;
      // Formulas, dates, hyperlinks and error values are rejected, never evaluated or silently coerced.
      const safe = relevant.every((index) => {
        const value = row.getCell(index).value;
        return value === null || typeof value === 'string' || typeof value === 'number';
      });
      const input = bookInputSchema.safeParse({
        title: row.getCell(indices[1]!).text,
        author: row.getCell(indices[3]!).text,
        subject: row.getCell(indices[2]!).text,
        location: {
          shelf: row.getCell(indices[0]!).text,
          cabinet: '',
          position: '',
        },
      });
      if (!safe || !input.success) preview.issues.push({ row: rowNumber, code: 'INVALID_ROW' });
      else preview.books.push(input.data);
    });
    return preview;
  } catch {
    return fail('INVALID_FILE');
  }
}

export async function bookTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('קטלוג', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow([...catalogHeaders]);
  sheet.columns.forEach((column, index) => {
    column.width = [20, 38, 30, 32][index] ?? 20;
    column.numFmt = '@';
  });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF704B34' } };
  sheet.getRow(1).height = 28;
  sheet.autoFilter = 'A1:D1';
  return workbook.xlsx.writeBuffer();
}
