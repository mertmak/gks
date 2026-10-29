import { useLatestRequest } from '../hooks/useLatestRequest';
import { useLiveList } from '../hooks/useLiveList';
import { businessDate } from '../utils/dates';
import AdminForm from '../components/AdminForm';
import { useState } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import CustomDataGrid from '../components/CustomDataGrid';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import { usePendingAction } from '../hooks/usePendingAction';

const UPDATE_EVENTS = ['leaves_updated', 'users_updated'];

function Leaves() {
  const suggestionRequest = useLatestRequest();
  const { rows: leaves, loading: listLoading, error: listError, refresh: fetchLeaves } = useLiveList('/leaves', UPDATE_EVENTS);
  const { pending: loading, run } = usePendingAction();
  const [confirmation, setConfirmation] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  // Arama ve Personel Seçimi
  const [arama, setArama] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form
  const [formData, setFormData] = useState({
    izin_turu: 'Yıllık İzin',
    baslangic: businessDate(),
    bitis: businessDate(),
    aciklama: ''
  });

  // --- BİLEŞENE UYGUN LOKAL HIZLI ARAMA ---
  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    suggestionRequest.cancel();
    setSuggestions([]);
    setArama(value);
    setSelectedUser(null);
    setSearchError('');
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
      } catch { setSearchError('Personel araması başarısız. Lütfen tekrar deneyin.'); }
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectUser = (user) => {
    suggestionRequest.cancel();
    setSelectedUser(user);
    setArama(user.Ad_Soyad);
    setSuggestions([]);
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmation) return;
    if (!selectedUser) {
      setMessage({ text: 'Lütfen önce bir personel seçiniz.', type: 'error' });
      return;
    }

    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.post('/leaves', { ...formData, user_id: selectedUser.ID });
        setMessage({ text: 'İzin başarıyla kaydedildi.', type: 'success' });

        // Formu sıfırla
        setFormData({ izin_turu: 'Yıllık İzin', baslangic: businessDate(), bitis: businessDate(), aciklama: '' });
        setSelectedUser(null);
        setArama('');
        fetchLeaves();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'İzin eklenirken hata oluştu.', type: 'error' });
      }
    });
  };

  const handleDelete = (leave) => {
    if (loading || confirmation) return;
    setMessage({ text: '', type: '' });
    setConfirmation(leave);
  };

  const confirmDelete = async () => {
    if (!confirmation) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.delete(`/leaves/${confirmation.ID}`);
        setMessage({ text: 'İzin silindi.', type: 'success' });
        setConfirmation(null);
        fetchLeaves();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'Silme işlemi başarısız.', type: 'error' });
      }
    });
  };

  const colDefs = [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 120 },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 150, cellClass: 'font-bold text-slate-800' },
    { field: 'Departman', headerName: 'Departman', width: 130 },
    {
      field: 'Izin_Turu',
      headerName: 'İzin Türü',
      width: 150,
      cellRenderer: (params) => (
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${params.value === 'Raporlu' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {params.value}
        </span>
      )
    },
    {
      headerName: 'Tarih Aralığı',
      valueGetter: (params) => {
        const bas = new Date(params.data.Baslangic_Tarihi).toLocaleDateString('tr-TR', { timeZone: 'UTC' });
        const bit = new Date(params.data.Bitis_Tarihi).toLocaleDateString('tr-TR', { timeZone: 'UTC' });
        return `${bas} - ${bit}`;
      },
      width: 220
    },
    { field: 'Durum', headerName: 'Onay Durumu', width: 135 },
    { headerName: 'Kayıt Kontrolü', width: 170, valueGetter: ({ data }) => data.Cakisma_Var ? 'İzin Çakışması' : '—' },
    { field: 'Aciklama', headerName: 'Açıklama', flex: 1, minWidth: 150 },
    {
      headerName: 'İşlemler', width: 100, sortable: false, filter: false,
      cellRenderer: (params) => (
        <button disabled={loading || Boolean(confirmation)} onClick={() => handleDelete(params.data)} className="px-3 py-1 bg-red-50 text-red-600 font-bold rounded text-xs hover:bg-red-100 transition-colors mt-1">
          İptal Et
        </button>
      )
    }
  ];

  return (
    <div className="space-y-8 relative mt-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">İzin ve Rapor Girişi</h2>
        <p className="text-slate-500 text-sm mt-1">Personellerin yıllık izin, sağlık raporu veya mazeret izinlerini buradan yönetebilirsiniz.</p>
      </div>

      {leaves.some(row => row.Cakisma_Var) && <p role="alert" className="p-3 bg-amber-50 text-amber-900 rounded-lg">Çakışan onaylı veya bekleyen izinler var. İlgili personelin tarih aralıklarını inceleyip hatalı kaydı kaldırın. Aynı gündeki birden fazla onaylı izin puantajda “İzin Çakışması” olarak gösterilir.</p>}
      {listLoading && <p role="status">İzinler yükleniyor…</p>}
      {listError && <p role="alert" className="text-red-700">{listError} <button type="button" onClick={fetchLeaves} className="underline">Tekrar dene</button></p>}
      <AlertMessage message={message.text} type={message.type} />

      {/* İZİN EKLEME FORMU */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Yeni İzin Girişi</h3>
        <AdminForm onSubmit={handleSubmit} disabled={loading || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">

          <div className="md:col-span-1 relative z-50">
            {/* YENİ ORTAK ARAMA BİLEŞENİ */}
            <AutocompleteSearch
              label="Personel Ara *"
              placeholder="İsim veya Sicil yazın..."
              value={arama}
              onChange={handleSearchInputChange}
              suggestions={suggestions}
              onSelect={(item) => {
                handleSelectUser(item.originalData);
              }}
              required={!selectedUser}
            />
            {searchError && <p role="alert" className="text-sm text-red-700">{searchError}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="leaves-field-1">İzin Türü *</label>
            <select id="leaves-field-1" name="izin_turu" value={formData.izin_turu} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="Yıllık İzin">Yıllık İzin</option>
              <option value="Raporlu">Sağlık Raporu</option>
              <option value="Mazeret İzni">Mazeret İzni</option>
              <option value="Ücretsiz İzin">Ücretsiz İzin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="leaves-field-2">Başlangıç Tarihi *</label>
            <input id="leaves-field-2" type="date" name="baslangic" value={formData.baslangic} onChange={handleChange} required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="leaves-field-3">Bitiş Tarihi *</label>
            <input id="leaves-field-3" type="date" name="bitis" min={formData.baslangic} value={formData.bitis} onChange={handleChange} required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="leaves-field-4">Açıklama (Opsiyonel)</label>
            <input id="leaves-field-4" type="text" name="aciklama" maxLength={255} value={formData.aciklama} onChange={handleChange} placeholder="İzin sebebi, rapor numarası vb." className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="flex items-end h-full">
            <button type="submit" disabled={loading} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors shadow-sm">
              {loading ? 'İşleniyor...' : 'İzni Kaydet'}
            </button>
          </div>
        </AdminForm>
      </div>

      {/* İZİN TABLOSU */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-4 h-[55vh]">
        <div className="p-2 text-sm font-bold text-slate-700 border-b border-slate-100 mb-2">
          Sistemde Kayıtlı İzinler ({leaves.length})
        </div>

        {/* YENİ ORTAK TABLO BİLEŞENİ */}
        <div className="flex-1 w-full h-full">
          <CustomDataGrid
            rowData={leaves}
            columnDefs={colDefs}
            exportFileName="GKS_Izinler"
            getRowId={(params) => params.data.ID}
          />
        </div>
      </div>
      <ConfirmAction isOpen={Boolean(confirmation)} title="İzin Kaydını Sil" pending={loading} error={message.type === 'error' ? message.text : ''} onClose={() => setConfirmation(null)} onConfirm={confirmDelete} confirmLabel="İzni Sil">
        <p><strong>{confirmation?.Ad_Soyad}</strong> · {confirmation?.Izin_Turu}</p>
        <p>{confirmation?.Baslangic_Tarihi?.slice(0, 10)} – {confirmation?.Bitis_Tarihi?.slice(0, 10)}</p>
        <p>Bu izin kaydı silinecek ve ilgili günlerin puantaj hesabı yeniden değerlendirilecek.</p>
      </ConfirmAction>
    </div>
  );
}

export default Leaves;
