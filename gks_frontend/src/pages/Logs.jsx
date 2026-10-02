import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { businessDate, previousMonthDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';

// YENİ ORTAK BİLEŞENLER
import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';

function Logs() {
  const suggestionRequest = useLatestRequest();
  const bitisTarihi = businessDate();
  const baslangicTarihi = previousMonthDate(bitisTarihi);

  const [filters, setFilters] = useState({ baslangic: baslangicTarihi, bitis: bitisTarihi, arama: '' });
  const { rows: logs, pagination, error: listError, searched: hasSearched, loading, search, goToPage } = usePagedList('/logs', 'new_rfid_log');
  
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
          <span className="font-medium text-slate-800">{params.value}</span>
        ) : (
          <span className="text-red-500 italic font-bold">Bilinmeyen Kişi</span>
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
          ? <span className="text-green-600 font-bold">Başarılı</span> 
          : <span className="text-red-600 font-bold">Reddedildi</span>;
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
    <div className="mt-8 flex flex-col h-[85vh] space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Geçiş Logları</h2>
        <p className="text-slate-500 text-sm mt-1">Lütfen görüntülemek istediğiniz aralığı seçin.</p>
      </div>

      <form onSubmit={handleFetchData} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="Logs-start">Başlangıç Tarihi</label>
          <input id="Logs-start" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="Logs-end">Bitiş Tarihi</label>
          <input id="Logs-end" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        {/* YENİ ORTAK ARAMA KUTUSU EKLENDİ */}
        <div className="relative z-50">
           <AutocompleteSearch 
             label="Ad Soyad / Kart No"
             placeholder="İsim veya kart ara..."
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
            {loading ? 'Aranıyor...' : 'Logları Getir'}
          </button>
        </div>
      </form>

      {/* YENİ ORTAK TABLO BİLEŞENİ EKLENDİ */}
      {listError && <p role="alert" className="text-red-600 p-2">{listError}</p>}
      {hasSearched && (
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-2">
          <div className="p-2 text-sm font-bold text-slate-700">Arama Sonuçları ({logs.length} Kayıt)</div>
          <CustomDataGrid
            exportFileName={`Gecis_Loglari_${businessDate()}`}
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

export default Logs;
