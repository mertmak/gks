import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { businessDate, previousMonthDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';

// YENİ ORTAK BİLEŞENLER
import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';

function SystemLogs() {
  const suggestionRequest = useLatestRequest();
  const bitisTarihi = businessDate();
  const baslangicTarihi = previousMonthDate(bitisTarihi);

  const [filters, setFilters] = useState({ baslangic: baslangicTarihi, bitis: bitisTarihi, arama: '' });
  const { rows: logs, pagination, error: listError, searched: hasSearched, loading, search, goToPage } = usePagedList('/system-logs', 'new_system_log');
  
  // ARAMA ÖNERİLERİ İÇİN STATE
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
        <span className="font-bold text-blue-600">{params.value || 'Sistem'}</span>
      )
    },
    { 
      field: 'Islem_Tipi', 
      headerName: 'İşlem Tipi', 
      width: 150, 
      cellRenderer: (params) => (
        <span className="font-bold text-slate-700">{params.value}</span>
      )
    },
    { field: 'Personel_Ad', headerName: 'Personel Adı', width: 200 },
    { field: 'Sicil_No', headerName: 'Sicil No', width: 130 },
    { field: 'Detay', headerName: 'Detay', flex: 1, minWidth: 200 }
  ], []);

  // --- YENİ BİLEŞENE UYGUN ARAMA FONKSİYONU ---
  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    suggestionRequest.cancel();
    setSuggestions([]);
    setFilters({ ...filters, arama: value }); 
    if (value.length >= 2) {
      try {
        const response = await suggestionRequest.run(signal => api.get('/users', { params: { arama: value }, signal }));
        if (!response) return;
        const formattedSuggestions = listRows(response.data).map(user => ({
           label: user.Ad_Soyad,
           subLabel: `Sicil: ${user.Sicil_No} | ${user.Departman || 'Departman Yok'}`,
           value: user.Ad_Soyad,
           originalData: user 
        }));
        setSuggestions(formattedSuggestions.slice(0, 5)); 
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
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Sistem İşlemleri</h2>
      {/* FİLTRE MENÜSÜ */}
      <form onSubmit={handleFetchData} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="SystemLogs-start">Başlangıç Tarihi</label>
          <input id="SystemLogs-start" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="SystemLogs-end">Bitiş Tarihi</label>
          <input id="SystemLogs-end" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        {/* YENİ ORTAK ARAMA BİLEŞENİ */}
        <div className="relative z-50">
           <AutocompleteSearch 
             label="Ad Soyad / Sicil No"
             placeholder="Sicil veya isim ara..."
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

        <div className="flex items-end">
          <button type="submit" disabled={loading} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg transition-colors">
            {loading ? 'Yükleniyor...' : 'Kayıtları Getir'}
          </button>
        </div>
      </form>

      {/* YENİ ORTAK TABLO BİLEŞENİ */}
      {listError && <p role="alert" className="text-red-600 p-2">{listError}</p>}
      {hasSearched && (
        <div className="flex-1 overflow-hidden border border-slate-300 rounded-2xl bg-white shadow-sm flex flex-col p-2 h-[60vh]">
          <div className="p-2 text-sm font-bold text-slate-700">
            Arama Sonuçları ({logs.length} Kayıt)
          </div>
          
          <CustomDataGrid
            exportFileName={`Sistem_Islemleri_${businessDate()}`}
            rowData={logs}
            serverPagination={pagination}
            onPageChange={goToPage}
            columnDefs={colDefs}
            getRowId={(params) => params.data.ID}
          />
        </div>
      )}
    </div>
  );
}

export default SystemLogs;
