import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { businessDate, previousMonthDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';

import CustomDataGrid from '../components/CustomDataGrid';
import PageHeader from '../components/ui/PageHeader';
import AutocompleteSearch from '../components/AutoCompleteSearch';

function SystemLogs() {
  const suggestionRequest = useLatestRequest();
  const bitisTarihi = businessDate();
  const baslangicTarihi = previousMonthDate(bitisTarihi);

  const [filters, setFilters] = useState({ baslangic: baslangicTarihi, bitis: bitisTarihi, arama: '' });
  const [initialFilters] = useState(filters);
  const { rows: logs, pagination, error: listError, loading, search, goToPage, refresh } = usePagedList('/system-logs', 'new_system_log', initialFilters);
  
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
        <span className="font-bold text-info">{params.value || 'Sistem'}</span>
      )
    },
    { 
      field: 'Islem_Tipi', 
      headerName: 'İşlem Tipi', 
      width: 150, 
      cellRenderer: (params) => (
        <span className="font-bold text-ink">{params.value}</span>
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
    <div className="space-y-6">
      <PageHeader title="Sistem İşlemleri" description="Personel, vardiya, izin ve mesai işlemlerinin denetim kayıtları. Varsayılan olarak son bir ay listelenir." />

      <form onSubmit={handleFetchData} className="card grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="field-label" htmlFor="SystemLogs-start">Başlangıç Tarihi</label>
          <input id="SystemLogs-start" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="SystemLogs-end">Bitiş Tarihi</label>
          <input id="SystemLogs-end" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="field" />
        </div>
        <div className="relative z-20">
          <AutocompleteSearch
            label="Ad Soyad / Sicil No"
            placeholder="Sicil veya isim ara…"
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
          exportFileName={`Sistem_Islemleri_${businessDate()}`}
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

export default SystemLogs;
