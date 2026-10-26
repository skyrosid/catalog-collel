import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { bookTemplate, catalogHeaders, parseBookWorkbook } from './catalog-files.js';

async function file(rows: unknown[][], headers: string[] = [...catalogHeaders]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('קטלוג');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
describe('Hebrew catalogue workbook import', () => {
  it('accepts the existing four-column format, numeric/composite shelf labels and missing metadata', async () => {
    const preview = await parseBookWorkbook(
      await file([
        ['ב - 6', 'אבודרהם', 'על סדר התפילה', 'רבינו דוד'],
        [149, 'ספר נוסף', '', ''],
        ['', 'ללא מיקום', '', ''],
      ]),
      'קטלוג.xlsx',
    );
    expect(preview.issues).toEqual([]);
    expect(preview.books).toHaveLength(3);
    expect(preview.books[0]?.location).toEqual({ cabinet: '', shelf: 'ב - 6', position: '' });
    expect(preview.books[1]).toMatchObject({ author: '', subject: '', location: { shelf: '149' } });
    expect(preview.books[2]?.location.shelf).toBe('');
  });
  it('maps reordered headers, ignores blank rows and reports exact invalid row numbers', async () => {
    const bytes = await file(
      [['רב', 'נושא', 'ספר', '80- 88'], [], ['רב', '', '', '4']],
      ['שם מחבר', 'הנושא', 'שם ספר', 'מספר מדף'],
    );
    const result = await parseBookWorkbook(bytes, 'books.xlsx');
    expect(result.books[0]).toMatchObject({
      title: 'ספר',
      author: 'רב',
      location: { shelf: '80- 88' },
    });
    expect(result.issues).toEqual([{ row: 4, code: 'INVALID_ROW' }]);
  });
  it('rejects ambiguous headers, formulas, invalid files and excessive rows', async () => {
    expect(
      (
        await parseBookWorkbook(
          await file([], ['שם ספר', 'שם ספר', 'הנושא', 'שם מחבר']),
          'bad.xlsx',
        )
      ).issues[0]?.code,
    ).toBe('HEADERS');
    const formula = await file([['1', { formula: '1+1', result: 2 }, '', '']]);
    expect((await parseBookWorkbook(formula, 'formula.xlsx')).issues).toEqual([
      { row: 2, code: 'INVALID_ROW' },
    ]);
    expect(
      (await parseBookWorkbook(new Uint8Array([1, 2, 3]), 'broken.xlsx')).issues[0]?.code,
    ).toBe('INVALID_FILE');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('books');
    sheet.addRow([...catalogHeaders]);
    sheet.getCell('B10002').value = 'ספר';
    expect(
      (await parseBookWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), 'large.xlsx'))
        .issues[0]?.code,
    ).toBe('TOO_MANY_ROWS');
  });
  it('generates a compatible four-column template matching the existing catalogue', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await bookTemplate());
    expect(workbook.worksheets[0]?.views[0]?.rightToLeft).toBe(true);
    expect(workbook.worksheets[0]?.columnCount).toBe(4);
    workbook.worksheets[0]?.addRow(['49-א', 'שם', 'נושא', 'מחבר']);
    const preview = await parseBookWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'template.xlsx',
    );
    expect(preview.issues).toEqual([]);
    expect(preview.books[0]?.location).toEqual({ shelf: '49-א', cabinet: '', position: '' });
    workbook.addWorksheet('נוסף').addRow(['מידע נוסף']);
    expect(
      (await parseBookWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), 'multiple.xlsx'))
        .issues[0]?.code,
    ).toBe('INVALID_FILE');
  });
});
