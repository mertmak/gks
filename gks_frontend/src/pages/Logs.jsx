import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { businessDate, previousMonthDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';

import CustomDataGrid from '../components/CustomDataGrid';
import PageHeader from '../components/ui/PageHeader';
import AutocompleteSearch from '../components/AutoCompleteSearch';

function Logs() {
  const suggestionRequest = useLatestRequest();
  const bitisTarihi = businessDate();
  const baslangicTarihi = previousMonthDate(bitisTarihi);

  const [filters, setFilters] = useState({ baslangic: baslangicTarihi, bitis: bitisTarihi, arama: '' });
  const [initialFilters] = useState(filters);
  const { rows: logs, pagination, error: listError, loading, search, goToPage, refresh } = usePagedList('/logs', 'new_rfid_log', initialFilters);
  
  // ARAMA ÖNERİLERİ İÇİN STATE
  const [suggestions, setSuggestions] = useState([]);

  // --- AG GRID SÜTUN AYARLARI ---
  const colDefs = useMemo(() => [
    { field: 'ID', headerName: 'ID', width: 90 },
    { 
      field: 'Ad_Soyad', 
      headerName: 'Personel Adı', 
      flex: 1, minWidth: 200,
      cellRenderer: (params) => {
        return params.value ? (
          <span className="font-medium text-ink">{params.value}</span>
        ) : (
          <span className="text-danger italic font-bold">Bilinmeyen Kişi</span>
        );
      }
    },
    { field: 'RFID_Kart_No', headerName: 'Kart No', flex: 1, minWidth: 200 },
    { field: 'Kapi_Adi', headerName: 'Kapı', flex: 1 , minWidth: 200},
    { 
      field: 'Basarili_Mi',
      valueFormatter: ({ value }) => value ? 'Başarılı' : 'Reddedildi',
      headerName: 'Durum', 
      width: 130,
      cellRenderer: (params) => {
        return params.value 
          ? <span className="text-success font-bold">Başarılı</span> 
          : <span className="text-danger font-bold">Reddedildi</span>;
      }
    },
    { 
      field: 'Zaman', 
      headerName: 'Tarih / Saat', 
      flex: 1, minWidth: 200,
      valueFormatter: ({ value }) => value ? new Date(value).toLocaleString('tr-TR', { timeZone: 'UTC' }) : '—'
    }
  ], []);

  // --- YENİ BİLEŞENE UYGUN LOKAL HIZLI ARAMA ---
  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    suggestionRequest.cancel();
    setSuggestions([]);
    setFilters({ ...filters, arama: value }); 
    if (value.length >= 2) {
      try {
        const response = await suggestionRequest.run(signal => api.get('/users', { params: { arama: value }, signal }));
        if (!response) return;
        // Veriyi AutocompleteSearch bileşeninin okuyacağı formata haritalıyoruz
        const formattedSuggestions = listRows(response.data).map(user => ({
           label: user.Ad_Soyad,
           subLabel: `Sicil: ${user.Sicil_No} | Kart: ${user.RFID_Kart_No || 'Yok'}`,
           value: user.Ad_Soyad || user.RFID_Kart_No, // Arama kutusuna adı veya kartı yazılabilir
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
      <PageHeader title="Geçiş Hareketleri" description="Kart okutmaları ve sonuçları. Varsayılan olarak son bir ayın kayıtları listelenir." />

      <form onSubmit={handleFetchData} className="card grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="field-label" htmlFor="Logs-start">Başlangıç Tarihi</label>
          <input id="Logs-start" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="Logs-end">Bitiş Tarihi</label>
          <input id="Logs-end" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="field" />
        </div>
        <div className="relative z-20">
          <AutocompleteSearch
            label="Ad Soyad / Kart No"
            placeholder="İsim veya kart ara…"
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
          exportFileName={`Gecis_Hareketleri_${businessDate()}`}
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

export default Logs;
