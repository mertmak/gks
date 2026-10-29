import { prepareGridExcel } from '../utils/excel';
import { businessDate } from '../utils/dates';
import { readSession } from '../utils/session';
import { useTheme } from '../utils/theme';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ModuleRegistry, ValidationModule, ClientSideRowModelModule, ClientSideRowModelApiModule,
  TextFilterModule, NumberFilterModule, DateFilterModule, QuickFilterModule, PaginationModule,
  RowSelectionModule, CellStyleModule, TooltipModule, LocaleModule, RowAutoHeightModule,
  CellApiModule, ColumnApiModule,
} from 'ag-grid-community';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { AG_GRID_LOCALE_TR } from '../utils/constants';

// Only the features the tables use; AllCommunityModule roughly doubles the grid chunk.
// ValidationModule reports a missing module in development and is dropped from the build.
ModuleRegistry.registerModules([
  ClientSideRowModelModule, ClientSideRowModelApiModule, TextFilterModule, NumberFilterModule,
  DateFilterModule, QuickFilterModule, PaginationModule, RowSelectionModule, CellStyleModule,
  TooltipModule, LocaleModule, RowAutoHeightModule, CellApiModule, ColumnApiModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

const CustomDataGrid = forwardRef(({ 
  rowData, 
  columnDefs, 
  getRowId, 
  quickFilterText, 
  rowSelection,
  selectionColumnDef,
  onSelectionChanged,
  rowHeight = 50, 
  paginationPageSize = 50,
  serverPagination,
  onPageChange,
  exportFileName = `GKS_Tablo_${businessDate()}`,
}, ref) => {

  const { dark } = useTheme();
  const apiRef = useRef(null);
  const downloadRef = useRef(null);
  const mounted = useRef(true);
  const exportLock = useRef(false);
  const [gridReady, setGridReady] = useState(false);
  const [download, setDownload] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const handleExport = async () => {
    if (!apiRef.current || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportError('');
    setDownload(null);
    try {
      const prepared = await prepareGridExcel(apiRef.current, exportFileName);
      if (mounted.current) setDownload(prepared);
      else URL.revokeObjectURL(prepared.url);
    }
    catch { setExportError('Excel dosyası hazırlanamadı. Lütfen tekrar deneyin.'); }
    finally { exportLock.current = false; setExporting(false); }
  };

  useEffect(() => {
    if (!download) return;
    downloadRef.current?.click();
    // Keep a visible link available if the browser blocks the automatic download.
    // Delay revocation on navigation so an already-started download can finish.
    return () => { setTimeout(() => URL.revokeObjectURL(download.url), 10000); };
  }, [download]);

  const defaultColDef = useMemo(() => ({
    filter: true, 
    sortable: true, 
    resizable: true, 
    cellStyle: { borderRight: '1px solid var(--color-line)' }, 
    headerClass: 'border-r border-line' 
  }), []);

  return (
    <div className={`${dark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'} flex-1 w-full h-full flex flex-col min-h-0`}>
      <div className="flex flex-wrap items-center justify-end gap-3 p-2 border-b text-sm">
        <span className="text-xs text-muted">{serverPagination ? 'İndirme: mevcut sayfanın filtrelenen satırları' : 'İndirme: tüm sayfalardaki filtrelenen satırlar'}</span>
        <button type="button" onClick={handleExport} disabled={!gridReady || exporting || !rowData?.length} className="px-3 py-2 bg-green-700 text-white rounded-lg disabled:opacity-50">
          {exporting ? 'Excel hazırlanıyor…' : 'Excel İndir (.xlsx)'}
        </button>
        {download && <span role="status" className="text-xs text-muted">
          Dosya hazır. İndirme başlamadıysa: {' '}
          <a ref={downloadRef} href={download.url} download={download.fileName} className="break-all underline text-success">{download.fileName}</a>
        </span>}
        {exportError && <span role="alert" className="text-danger">{exportError}</span>}
      </div>
      <>{serverPagination && <p className="text-xs text-muted px-3 py-2">Kolon filtreleri ve sıralama yalnız mevcut sayfadaki kayıtları kapsar. Tüm kayıtlarda arama için üstteki arama formunu kullanın.</p>}</>
      <div className="flex-1 min-h-0"><AgGridReact
        ref={ref}
        onGridReady={({ api }) => { apiRef.current = api; setGridReady(true); }}
        alwaysMultiSort={true} 
        getRowId={getRowId ? params => String(getRowId(params)) : undefined}
        rowData={rowData}
        columnDefs={readSession()?.role === 'admin' ? columnDefs : columnDefs.filter(c => !['İşlem', 'İşlemler'].includes(c.headerName))}
        defaultColDef={defaultColDef}
        localeText={AG_GRID_LOCALE_TR}
        theme="legacy"
        pagination={!serverPagination}
        paginationPageSize={paginationPageSize}
        domLayout="normal"
        rowHeight={rowHeight}
        rowSelection={rowSelection}
        selectionColumnDef={selectionColumnDef}
        onSelectionChanged={onSelectionChanged}
        quickFilterText={quickFilterText}
      /></div>
      {serverPagination && <div className="flex justify-between items-center gap-3 p-3 border-t text-sm">
        <span>{serverPagination.total} kayıt · Sayfa {serverPagination.page} / {Math.max(1, serverPagination.totalPages)}</span>
        <div className="flex gap-3"><button disabled={serverPagination.page <= 1} onClick={() => onPageChange(serverPagination.page - 1)}>Önceki</button><button disabled={serverPagination.page >= serverPagination.totalPages} onClick={() => onPageChange(serverPagination.page + 1)}>Sonraki</button></div>
      </div>}
    </div>
  );
});

CustomDataGrid.displayName = 'CustomDataGrid';

export default CustomDataGrid;
