import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { businessDate, previousMonthDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';

// YENİ ORTAK BİLEŞENLER EKLENDİ
import CustomDataGrid from '../components/CustomDataGrid';
import PageHeader from '../components/ui/PageHeader';
import AutocompleteSearch from '../components/AutoCompleteSearch';

function DoorLogs() {
  const suggestionRequest = useLatestRequest();
  const bitisTarihi = businessDate();
  const baslangicTarihi = previousMonthDate(bitisTarihi);

  const [filters, setFilters] = useState({ baslangic: baslangicTarihi, bitis: bitisTarihi, arama: '' });
  const [initialFilters] = useState(filters);
  const { rows: logs, pagination, error: listError, loading, search, goToPage, refresh } = usePagedList('/door-logs', 'new_door_log', initialFilters);
  
  const [suggestions, setSuggestions] = useState([]);

  // --- AG GRID SÜTUN AYARLARI ---
  const colDefs = useMemo(() => [
    { 
      field: 'Tarih', 
      headerName: 'Tarih / Saat', 
      width: 170, 
      valueFormatter: ({ value }) => value ? new Date(value).toLocaleString('tr-TR', { timeZone: 'UTC' }) : '—'
    },
    { 
      field: 'Islemi_Yapan', 
      headerName: 'İşlemi Yapan', 
      width: 150, 
      cellRenderer: (params) => (
        <span className="font-bold text-info">{params.value || 'Sistem'}</span>
      )
    },
    { 
      field: 'Islem_Tipi', 
      headerName: 'İşlem Tipi', 
      width: 150, 
      cellRenderer: (params) => (
        <span className={`px-2 py-1 rounded text-xs font-bold ${params.value === 'KAPI SİLİNDİ' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
          {params.value}
        </span>
      )
    },
    { field: 'Kapi_Adi', headerName: 'Kapı Adı', width: 250 },
    { field: 'Detay', headerName: 'Detay', flex: 1, minWidth: 200, wrapText: true, autoHeight: true }
  ], []);

  // YENİ BİLEŞENE UYGUN ARAMA (Yanlışlıkla users olan api kopyası door-logs için düzeltildi)
  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    suggestionRequest.cancel();
    setSuggestions([]);
    setFilters({ ...filters, arama: value }); 
    if (value.length >= 2) {
      try {
        const response = await suggestionRequest.run(signal => api.get('/door-logs', { params: { arama: value }, signal }));
        if (!response) return;
        
        // Tekrar eden kapı isimlerini veya işlemleri filtreleyerek öneri oluşturur
        const uniqueLogs = [];
        const seen = new Set();
        listRows(response.data).forEach(log => {
          if(log.Kapi_Adi && !seen.has(log.Kapi_Adi)) {
             seen.add(log.Kapi_Adi);
             uniqueLogs.push({
                label: log.Kapi_Adi,
                subLabel: `Örnek İşlem: ${log.Islem_Tipi}`,
                value: log.Kapi_Adi
             });
          }
        });
        setSuggestions(uniqueLogs.slice(0, 5)); 
      } catch { /* İstek başarısızsa mevcut seçim korunur. */ }
    } else {
      setSuggestions([]); 
    }
  };

  const handleFetchData = (event) => {
    event.preventDefault();
    return search(filters);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Kapı Değişiklikleri" description="Kapı ekleme, düzenleme ve durum değişikliklerinin denetim kayıtları. Varsayılan olarak son bir ay listelenir." />

      <form onSubmit={handleFetchData} className="card grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="field-label" htmlFor="DoorLogs-start">Başlangıç Tarihi</label>
          <input id="DoorLogs-start" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="DoorLogs-end">Bitiş Tarihi</label>
          <input id="DoorLogs-end" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="field" />
        </div>
        <div className="relative z-20">
          <AutocompleteSearch
            label="Kapı Adı / İşlem Ara"
            placeholder="Örn: Ana Giriş"
            value={filters.arama}
            onChange={handleSearchInputChange}
            suggestions={suggestions}
            onSelect={(item) => {
              suggestionRequest.cancel();
              setFilters({...filters, arama: item.value});
              setSuggestions([]);
            }}
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Yükleniyor…' : 'Kayıtları Getir'}
        </button>
      </form>

      {listError && <p role="alert" className="text-danger">{listError} <button type="button" onClick={refresh} className="underline">Tekrar dene</button></p>}
      <section aria-label="Sonuçlar" className="card p-2 flex flex-col h-[65vh]">
        <p className="p-2 text-sm font-semibold text-ink">{loading ? 'Yükleniyor…' : `${pagination.total ?? logs.length} kayıt`}</p>
        <CustomDataGrid
          exportFileName={`Kapi_Degisiklikleri_${businessDate()}`}
          rowData={logs}
          serverPagination={pagination}
          onPageChange={goToPage}
          columnDefs={colDefs}
          getRowId={(params) => params.data.ID}
        />
      </section>
    </div>
  );
}

export default DoorLogs;
