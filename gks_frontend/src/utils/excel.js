// Keep user input as literal strings: never accept formula/hyperlink objects.
function cellValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  return String(value);
}

export function gridExcelData(api) {
  const columns = api.getAllDisplayedColumns().filter(column => {
    const def = column.getColDef();
    return (def.field || def.valueGetter) && !['İşlem', 'İşlemler'].includes(def.headerName);
  });
  const headers = columns.map(column => api.getDisplayNameForColumn(column, 'header'));
  const rows = [];
  api.forEachNodeAfterFilterAndSort(rowNode => {
    if (!rowNode.data) return;
    rows.push(columns.map(column => {
      const raw = api.getCellValue({ rowNode, colKey: column, useFormatter: false });
      // Preserve numbers for calculations, use formatters for textual labels/dates.
      const value = typeof raw === 'number' || raw instanceof Date ? raw
        : api.getCellValue({ rowNode, colKey: column, useFormatter: true });
      return cellValue(value);
    }));
  });
  return { headers, rows };
}

// `data` is one table ({headers, rows}) or a list of named sheets ([{name, headers, rows}]).
export async function createExcelBuffer(data) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GKS';
  for (const { name = 'Tablo', headers, rows } of Array.isArray(data) ? data : [data]) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers.map(cellValue));
    rows.forEach(row => sheet.addRow(row.map(cellValue)));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    sheet.getRow(1).height = 26;
    if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: headers.length } };
    sheet.columns.forEach(column => {
      let width = 12;
      column.eachCell(cell => {
        width = Math.max(width, Math.min(48, String(cell.value ?? '').length + 2));
        if (cell.value instanceof Date) cell.numFmt = 'dd.mm.yyyy hh:mm';
        if (typeof cell.value === 'string') cell.numFmt = '@';
      });
      column.width = width;
    });
  }
  return workbook.xlsx.writeBuffer();
}

export async function prepareExcel(data, fileName) {
  const buffer = await createExcelBuffer(data);
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  return { url, fileName: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx` };
}

export const prepareGridExcel = (api, fileName) => prepareExcel(gridExcelData(api), fileName);
