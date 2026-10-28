import { useLiveList } from '../hooks/useLiveList';
import AdminForm from '../components/AdminForm';
import { useState, useMemo } from 'react';
import api from '../api/axios';

// YENİ ORTAK BİLEŞENLER
import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import { usePendingAction } from '../hooks/usePendingAction';

// API'den gelen saat verisini HH:mm formatına çeviren yardımcı fonksiyon
const formatTimeForInput = (val) => {
  if (!val) return '';
  if (val.includes('T')) return val.split('T')[1].substring(0, 5);
  return val.substring(0, 5);
};

// GÜN TANIMLARI
const GUNLER = [
  { id: 1, ad: 'Pzt' }, { id: 2, ad: 'Sal' }, { id: 3, ad: 'Çar' },
  { id: 4, ad: 'Per' }, { id: 5, ad: 'Cum' }, { id: 6, ad: 'Cmt' }, { id: 0, ad: 'Paz' }
];

const UPDATE_EVENTS = ['shifts_updated'];

function Shifts() {
  const { rows: shifts, loading, error: listError, refresh: fetchShifts } = useLiveList('/shifts', UPDATE_EVENTS);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { pending, run } = usePendingAction();
  const [confirmation, setConfirmation] = useState(null);

  // ARAMA VE OTOMATİK TAMAMLAMA STATE'LERİ
  const [arama, setArama] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // DÜZENLEME VE EKLEME STATE'LERİ
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  const [formData, setFormData] = useState({
    vardiya_adi: '',
    mesai_baslangic: '',
    mesai_bitis: '',
    yemek_baslangic: '',
    yemek_bitis: '',
    tolerans_dk: 0,
    mola_hakki_dk: 0,
    calisma_gunleri: [1, 2, 3, 4, 5]
  });

  // --- BİLEŞENE UYGUN LOKAL HIZLI ARAMA ---
  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setArama(value);

    if (value.length >= 2) {
      const lowerVal = value.toLowerCase();
      // Halihazırda çekilmiş olan vardiyalar içinde (frontend'de) filtreleme yapıyoruz
      const matchedShifts = shifts.filter(shift => shift.Vardiya_Adi.toLowerCase().includes(lowerVal));

      const formattedSuggestions = matchedShifts.map(shift => ({
         label: shift.Vardiya_Adi,
         subLabel: `Çalışma Günleri: ${shift.Calisma_Gunleri || 'Hafta İçi'}`,
         value: shift.Vardiya_Adi,
         originalData: shift
      }));
      setSuggestions(formattedSuggestions.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  };

  // Tabloda sadece aranan vardiyaları göstermek için
  const filteredShifts = useMemo(() => {
    if (!arama) return shifts;
    return shifts.filter(shift => shift.Vardiya_Adi.toLowerCase().includes(arama.toLowerCase()));
  }, [arama, shifts]);

  // --- FORM İŞLEMLERİ ---
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmation) return;
    if (!formData.calisma_gunleri.length) {
      setMessage({ text: 'En az bir çalışma günü seçiniz.', type: 'error' });
      return;
    }
    await run(async () => {
      setMessage({ text: '', type: '' });

      const payload = { ...formData, calisma_gunleri: formData.calisma_gunleri.join(',') };

      try {
        if (isEditing) {
          await api.put(`/shifts/${editId}`, payload);
          setMessage({ text: 'Vardiya başarıyla güncellendi.', type: 'success' });
        } else {
          await api.post('/shifts', payload);
          setMessage({ text: 'Yeni vardiya sisteme eklendi.', type: 'success' });
        }

        setFormData({ vardiya_adi: '', mesai_baslangic: '', mesai_bitis: '', yemek_baslangic: '', yemek_bitis: '', tolerans_dk: 0, mola_hakki_dk: 0, calisma_gunleri: [1, 2, 3, 4, 5] });
        setIsEditing(false);
        setEditId(null);
        fetchShifts();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const handleEditClick = (shift) => {
    if (pending || confirmation) return;
    setIsEditing(true);
    setEditId(shift.ID);

    const parsedGunler = shift.Calisma_Gunleri ? shift.Calisma_Gunleri.split(',').map(Number) : [1, 2, 3, 4, 5];

    setFormData({
      vardiya_adi: shift.Vardiya_Adi || '',
      mesai_baslangic: formatTimeForInput(shift.Mesai_Baslangic),
      mesai_bitis: formatTimeForInput(shift.Mesai_Bitis),
      yemek_baslangic: formatTimeForInput(shift.Yemek_Baslangic),
      yemek_bitis: formatTimeForInput(shift.Yemek_Bitis),
      tolerans_dk: shift.Tolerans_Dk || 0,
      mola_hakki_dk: shift.Mola_Hakki_Dk || 0,
      calisma_gunleri: parsedGunler
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = (shift) => {
    if (pending || confirmation) return;
    const isActive = shift.Durum == null ? true : shift.Durum;
    setMessage({ text: '', type: '' });
    setConfirmation({ id: shift.ID, name: shift.Vardiya_Adi, durum: isActive ? 0 : 1 });
  };

  const confirmStatus = async () => {
    if (!confirmation) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.patch(`/shifts/${confirmation.id}/status`, { durum: confirmation.durum });
        setMessage({ text: confirmation.durum ? 'Vardiya aktifleştirildi.' : 'Vardiya pasife alındı.', type: 'success' });
        setConfirmation(null);
        fetchShifts();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({ vardiya_adi: '', mesai_baslangic: '', mesai_bitis: '', yemek_baslangic: '', yemek_bitis: '', tolerans_dk: 0, mola_hakki_dk: 0, calisma_gunleri: [1, 2, 3, 4, 5] });
    setMessage({ text: '', type: '' });
  };

  // --- AG GRID SÜTUN AYARLARI ---
  const colDefs = [
    { field: 'ID', headerName: 'ID', width: 80 },
    { field: 'Vardiya_Adi', headerName: 'Vardiya Adı', flex: 1, minWidth: 180, cellClass: 'font-bold text-slate-800' },
    {
      headerName: 'Çalışma Günleri',
      valueGetter: (params) => {
        if (!params.data.Calisma_Gunleri) return 'Hafta İçi';
        const gunlerArr = params.data.Calisma_Gunleri.split(',').map(Number);
        if (gunlerArr.length === 7) return 'Her Gün';
        if (gunlerArr.join(',') === '1,2,3,4,5') return 'Hafta İçi';
        if (gunlerArr.join(',') === '0,6' || gunlerArr.join(',') === '6,0') return 'Hafta Sonu';
        return gunlerArr.map(g => GUNLER.find(x => x.id === g)?.ad).join(', ');
      },
      width: 160
    },
    {
      headerName: 'Mesai Saatleri',
      valueGetter: (params) => {
        const bas = formatTimeForInput(params.data.Mesai_Baslangic);
        const bit = formatTimeForInput(params.data.Mesai_Bitis);
        return `${bas} - ${bit}`;
      },
      width: 140
    },
    {
      headerName: 'Yemek Molası',
      valueGetter: (params) => {
        const bas = formatTimeForInput(params.data.Yemek_Baslangic);
        const bit = formatTimeForInput(params.data.Yemek_Bitis);
        return (bas && bit) ? `${bas} - ${bit}` : 'Belirtilmedi';
      },
      width: 140
    },
    {
      headerName: 'Esneklik',
      valueGetter: (params) => `Tol: ${params.data.Tolerans_Dk || 0}dk | Mola: ${params.data.Mola_Hakki_Dk || 0}dk`,
      width: 170
    },
    {
      field: 'Durum',
      headerName: 'Durum',
      valueFormatter: ({ value }) => (value ?? true) ? 'Aktif' : 'Pasif',
      width: 100,
      cellRenderer: (params) => {
        const isActive = params.value === undefined || params.value === null ? true : params.value;
        return isActive
          ? <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-bold">Aktif</span>
          : <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-bold">Pasif</span>;
      }
    },
    {
      headerName: 'İşlemler',
      width: 180,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const isActive = params.data.Durum === undefined || params.data.Durum === null ? true : params.data.Durum;
        return (
          <div className="space-x-2 mt-1">
            <button disabled={pending || Boolean(confirmation)} onClick={() => handleEditClick(params.data)} className="px-3 py-1 bg-blue-50 text-blue-600 font-bold rounded text-xs hover:bg-blue-100 transition-colors">Düzenle</button>
            <button disabled={pending || Boolean(confirmation)} onClick={() => handleToggleStatus(params.data)} className={`px-3 py-1 font-bold rounded text-xs transition-colors ${isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
              {isActive ? 'Pasife Al' : 'Aktifleştir'}
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-8 relative mt-8">

      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Vardiya ve Çalışma Saatleri</h2>
        <p className="text-slate-500 text-sm mt-1">Sistemdeki çalışma vardiyalarını, günleri ve mola sürelerini yönetebilirsiniz.</p>
      </div>

      {/* EKLEME / DÜZENLEME FORMU */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          {isEditing ? 'Vardiyayı Düzenle' : 'Yeni Vardiya Ekle'}
        </h2>

        {loading && <p role="status">Liste yükleniyor…</p>}
      <p className="text-sm text-slate-600">Vardiya düzenlemeleri yeni atamalarda kullanılır. Mevcut personelin yeni ayarlarla çalışması için vardiyayı yeniden atayın; geçmiş günlerin ayarları korunur.</p>
      {listError && <p role="alert" className="text-red-700">{listError} <button type="button" onClick={fetchShifts} className="underline">Tekrar dene</button></p>}
      <AlertMessage message={message.text} type={message.type} />

        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">

          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-1">Vardiya Adı *</label>
            <input id="shifts-field-1" type="text" name="vardiya_adi" maxLength={100} value={formData.vardiya_adi} onChange={handleChange} placeholder="Örn: Hafta İçi Gündüz Vardiyası" required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
          </div>

          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-2">Mesai Başlangıç *</label><input id="shifts-field-2" type="time" name="mesai_baslangic" value={formData.mesai_baslangic} onChange={handleChange} required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-3">Mesai Bitiş *</label><input id="shifts-field-3" type="time" name="mesai_bitis" value={formData.mesai_bitis} onChange={handleChange} required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-4">Yemek Başlangıç</label><input id="shifts-field-4" type="time" name="yemek_baslangic" value={formData.yemek_baslangic} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-5">Yemek Bitiş</label><input id="shifts-field-5" type="time" name="yemek_bitis" value={formData.yemek_bitis} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>

          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-6">Tolerans (Dakika)</label><input id="shifts-field-6" type="number" name="tolerans_dk" max="120" value={formData.tolerans_dk} onChange={handleChange} min="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="shifts-field-7">Günlük Mola Hakkı (Dakika)</label><input id="shifts-field-7" type="number" name="mola_hakki_dk" max="480" value={formData.mola_hakki_dk} onChange={handleChange} min="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>

          {/* ÇALIŞMA GÜNLERİ SEÇİMİ */}
          <div className="md:col-span-4 mt-2">
            <label className="block text-xs font-bold text-slate-500 mb-2">Çalışma Günleri Seçimi *</label>
            <div className="flex flex-wrap gap-2">
              {GUNLER.map(gun => (
                <button
                  key={gun.id} type="button" aria-pressed={formData.calisma_gunleri.includes(gun.id)}
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      calisma_gunleri: prev.calisma_gunleri.includes(gun.id)
                        ? prev.calisma_gunleri.filter(g => g !== gun.id)
                        : [...prev.calisma_gunleri, gun.id].sort()
                    }))
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    formData.calisma_gunleri.includes(gun.id)
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {gun.ad}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-4 flex justify-end space-x-3 mt-4">
            {isEditing && (
              <button type="button" onClick={cancelEdit} className="px-6 py-2 bg-slate-200 font-bold text-slate-700 rounded-lg hover:bg-slate-300 transition-colors w-full sm:w-auto">İptal Et</button>
            )}
            <button type="submit" className={`px-6 py-2 font-bold rounded-lg text-white transition-colors w-full sm:w-auto ${isEditing ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
              {pending ? 'Kaydediliyor…' : isEditing ? 'Vardiyayı Güncelle' : 'Sisteme Kaydet'}
            </button>
          </div>
        </AdminForm>
      </div>

      {/* ARAMA VE TABLO BÖLÜMÜ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-4 h-[55vh]">
        <div className="mb-4 relative w-full md:w-1/3 z-50">
          <AutocompleteSearch
            label="Vardiya Ara"
            placeholder="Vardiya adı yazın..."
            value={arama}
            onChange={handleSearchInputChange}
            suggestions={suggestions}
            onSelect={(item) => {
              setArama(item.value);
              setSuggestions([]);
            }}
          />
        </div>

        <div className="p-2 text-sm font-bold text-slate-700 bg-slate-50 border-t border-x border-slate-200 rounded-t-lg">
          Kayıtlı Vardiyalar ({filteredShifts.length} Kayıt)
        </div>

        <div className="flex-1 w-full h-full">
          <CustomDataGrid
            rowData={filteredShifts}
            columnDefs={colDefs}
            exportFileName="GKS_Vardiyalar"
            getRowId={(params) => params.data.ID}
          />
        </div>
      </div>

      <ConfirmAction isOpen={Boolean(confirmation)} title="Vardiya Durumunu Değiştir" pending={pending} error={message.type === 'error' ? message.text : ''} onClose={() => setConfirmation(null)} onConfirm={confirmStatus}>
        <p><strong>{confirmation?.name}</strong> vardiyası {confirmation?.durum ? 'aktifleştirilecek.' : 'pasife alınacak.'}</p>
        <p>Mevcut personel atamalarının ve geçmiş günlerin ayarları korunur.</p>
      </ConfirmAction>
    </div>
  );
}

export default Shifts;
