import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createExcelBuffer, gridExcelData } from '../src/utils/excel.js';

test('XLSX round trip preserves Turkish, identifiers, numbers, dates and literal formulas', async () => {
  const date = new Date('2026-09-14T09:30:00Z');
  const buffer = await createExcelBuffer({
    headers: ['Ad Soyad', 'Sicil', 'Dakika', 'Tarih', 'Not', 'Boş'],
    rows: [['Çağrı ŞİMŞEK', '00123456789012345678', 90, date, '=HYPERLINK("https://example.com")', null],
      ['İğüşöç', '00001', -30, null, '+SUM(1,2)', 'çok\nsatırlı; "not"']]
  });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Tablo');
  assert.equal(sheet.getCell('A2').value, 'Çağrı ŞİMŞEK');
  assert.equal(sheet.getCell('B2').value, '00123456789012345678');
  assert.equal(sheet.getCell('C2').value, 90);
  assert.equal(sheet.getCell('C3').value, -30);
  assert.equal(sheet.getCell('D2').value.toISOString(), date.toISOString());
  assert.equal(sheet.getCell('E2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('E2').formula, undefined);
  assert.equal(sheet.getCell('E3').value, '+SUM(1,2)');
  assert.equal(sheet.getCell('F2').value, null);
  assert.equal(sheet.getCell('F3').value, 'çok\nsatırlı; "not"');
  assert.equal(sheet.views[0].ySplit, 1);
  assert.ok(sheet.autoFilter);
});

test('Grid export respects displayed columns and filtered/sorted rows, excludes actions', () => {
  const defs = [{ field: 'name', headerName: 'Ad' }, { valueGetter: true, headerName: 'Tarih' }, { headerName: 'İşlem' }];
  const columns = defs.map((def, index) => ({ index, getColDef: () => def }));
  const api = {
    getAllDisplayedColumns: () => columns,
    getDisplayNameForColumn: column => column.getColDef().headerName,
    forEachNodeAfterFilterAndSort: callback => [['İkinci', '14.09.2026'], ['İlk', '13.09.2026']].forEach(data => callback({ data })),
    getCellValue: ({ rowNode, colKey }) => rowNode.data[colKey.index]
  };
  assert.deepEqual(gridExcelData(api), { headers: ['Ad', 'Tarih'], rows: [['İkinci', '14.09.2026'], ['İlk', '13.09.2026']] });
});

test('a list of named sheets becomes one workbook', async () => {
  const buffer = await createExcelBuffer([
    { name: 'Özet', headers: ['Ad Soyad', 'Gün'], rows: [['A', 30]] },
    { name: 'Günlük', headers: ['Tarih'], rows: [['01.09.2026'], ['02.09.2026']] },
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Özet', 'Günlük']);
  assert.equal(workbook.getWorksheet('Özet').getCell('B2').value, 30);
  assert.equal(workbook.getWorksheet('Günlük').rowCount, 3);
});
