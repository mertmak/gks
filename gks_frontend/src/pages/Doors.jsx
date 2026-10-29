import { useLiveList } from '../hooks/useLiveList';
import AdminForm from '../components/AdminForm';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import { usePendingAction } from '../hooks/usePendingAction';

const UPDATE_EVENTS = ['doors_updated'];

function Doors() {
  const { rows: doors, loading, error: listError, refresh: fetchDoors } = useLiveList('/doors', UPDATE_EVENTS);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { pending, run } = usePendingAction();
  const [confirmation, setConfirmation] = useState(null);

  // ARAMA VE OTOMATİK TAMAMLAMA STATE'LERİ
  const [arama, setArama] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // DÜZENLEME (EDIT) VE EKLEME STATE'LERİ
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ kapi_adi: '', departman: '', konum: '', kapi_turu: 'İç Geçiş' });

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setArama(value);

    if (value.length >= 2) {
      const lowerVal = value.toLowerCase();
      // Halihazırda çekilmiş olan kapılar içinde (frontend'de) filtreleme yapıyoruz
      const matchedDoors = doors.filter(door => door.Kapi_Adi.toLowerCase().includes(lowerVal));

      const formattedSuggestions = matchedDoors.map(door => ({
         label: door.Kapi_Adi,
         subLabel: `Tür: ${door.Kapi_Turu} | Departman: ${door.Departman}`,
         value: door.Kapi_Adi,
         originalData: door
      }));
      setSuggestions(formattedSuggestions.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (door) => {
    setArama(door.Kapi_Adi);
    setSuggestions([]);
  };

  // Tabloda sadece aranan kapıları göstermek için
  const filteredDoors = useMemo(() => {
    if (!arama) return doors;
    return doors.filter(door => door.Kapi_Adi.toLowerCase().includes(arama.toLowerCase()));
  }, [arama, doors]);

  // --- FORM İŞLEMLERİ ---
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmation) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        if (isEditing) {
          await api.put(`/doors/${editId}`, formData);
          setMessage({ text: 'Kapı başarıyla güncellendi.', type: 'success' });
        } else {
          await api.post('/doors', formData);
          setMessage({ text: 'Yeni kapı sisteme eklendi.', type: 'success' });
        }

        setFormData({ kapi_adi: '', departman: '', konum: '', kapi_turu: 'İç Geçiş' });
        setIsEditing(false);
        setEditId(null);
        fetchDoors();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const handleEditClick = (door) => {
    if (pending || confirmation) return;
    setIsEditing(true);
    setEditId(door.ID);
    setFormData({
      kapi_adi: door.Kapi_Adi || '',
      departman: door.Departman || '',
      konum: door.Konum || '',
      kapi_turu: door.Kapi_Turu || 'İç Geçiş'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = (door) => {
    if (pending || confirmation) return;
    const isActive = door.Durum == null ? true : door.Durum;
    setMessage({ text: '', type: '' });
    setConfirmation({ id: door.ID, name: door.Kapi_Adi, durum: isActive ? 0 : 1 });
  };

  const confirmStatus = async () => {
    if (!confirmation) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.patch(`/doors/${confirmation.id}/status`, { durum: confirmation.durum });
        setMessage({ text: confirmation.durum ? 'Kapı aktifleştirildi.' : 'Kapı pasife alındı.', type: 'success' });
        setConfirmation(null);
        fetchDoors();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({ kapi_adi: '', departman: '', konum: '', kapi_turu: 'İç Geçiş' });
    setMessage({ text: '', type: '' });
  };

  // --- AG GRID SÜTUN AYARLARI ---
  const colDefs = [
    { field: 'ID', headerName: 'ID', width: 90 },
    { field: 'Kapi_Adi', headerName: 'Kapı Adı', flex: 1, minWidth: 200 },
    {
      field: 'Kapi_Turu',
      headerName: 'Kapı Türü',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params) => {
        const val = params.value || 'İç Geçiş';
        const color = val.includes('Giriş') ? 'text-info' : val.includes('Çıkış') ? 'text-warning' : 'text-muted';
        return <span className={`font-bold ${color}`}>{val}</span>;
      }
    },
    { field: 'Departman', headerName: 'Departman', flex: 1, minWidth: 150 },
    { field: 'Konum', headerName: 'Konum', flex: 1, minWidth: 150 },
    {
      field: 'Durum',
      headerName: 'Durum',
      valueFormatter: ({ value }) => (value ?? true) ? 'Aktif' : 'Pasif',
      width: 100,
      cellRenderer: (params) => {
        const isActive = params.value === undefined || params.value === null ? true : params.value;
        return isActive
          ? <span className="px-2 py-1 bg-success-soft text-success text-xs rounded-full font-bold">Aktif</span>
          : <span className="px-2 py-1 bg-danger-soft text-danger text-xs rounded-full font-bold">Pasif</span>;
      }
    },
    {
      headerName: 'İşlemler',
      width: 200,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const isActive = params.data.Durum === undefined || params.data.Durum === null ? true : params.data.Durum;

        return (
          <div className="space-x-2 mt-1">
            <button
              disabled={pending || Boolean(confirmation)} onClick={() => handleEditClick(params.data)}
              className="px-3 py-1 bg-info-soft text-info font-bold rounded text-xs hover:bg-info-soft transition-colors"
            >
              Düzenle
            </button>
            <button
              disabled={pending || Boolean(confirmation)} onClick={() => handleToggleStatus(params.data)}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${isActive ? 'bg-danger-soft text-danger hover:bg-danger-soft' : 'bg-success-soft text-success hover:bg-success-soft'}`}
            >
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
        <h1 className="text-2xl font-bold text-ink tracking-tight">Geçiş Noktaları</h1>
        <p className="text-muted text-sm mt-1">Sistemdeki geçiş noktalarını (kapıları) buradan ekleyebilir, düzenleyebilir veya durumlarını değiştirebilirsiniz.</p>
      </div>

      {/* EKLEME / DÜZENLEME FORMU */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line">
        <h2 className="text-xl font-bold text-ink mb-4">
          {isEditing ? 'Kapı Bilgilerini Düzenle' : 'Yeni Kapı Ekle'}
        </h2>

      {loading && <p role="status">Liste yükleniyor…</p>}
      {listError && <p role="alert" className="text-danger">{listError} <button type="button" onClick={fetchDoors} className="underline">Tekrar dene</button></p>}
      <AlertMessage message={message.text} type={message.type} />

        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="doors-field-1">Kapı Adı *</label>
            <input id="doors-field-1"
              type="text"
              name="kapi_adi" maxLength={100}
              value={formData.kapi_adi}
              onChange={handleChange}
              placeholder="Örn: Ana Giriş Turnikesi"
              required
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-accent outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="doors-field-2">Kapı Türü (İşlevi) *</label>
            <select id="doors-field-2"
              name="kapi_turu"
              value={formData.kapi_turu}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-accent outline-none transition-all"
            >
              <option value="İç Geçiş">İç Geçiş (Standart Kapı)</option>
              <option value="Ana Giriş">Ana Giriş (Mesai Başlar)</option>
              <option value="Ana Çıkış">Ana Çıkış (Mesai Biter)</option>
              <option value="Yemekhane Giriş">Yemekhane Giriş</option>
              <option value="Yemekhane Çıkış">Yemekhane Çıkış</option>
              <option value="Mola / Sigara Alanı">Mola / Sigara Alanı</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="doors-field-3">Bağlı Olduğu Departman *</label>
            <input id="doors-field-3"
              type="text"
              name="departman" maxLength={100}
              value={formData.departman}
              onChange={handleChange}
              placeholder="Örn: Bilgi İşlem"
              required
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-accent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="doors-field-4">Fiziksel Konum *</label>
            <input id="doors-field-4"
              type="text"
              name="konum" maxLength={100}
              value={formData.konum}
              onChange={handleChange}
              placeholder="Örn: A Blok Zemin Kat"
              required
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-accent outline-none transition-all"
            />
          </div>

          <div className="md:col-span-4 flex justify-end space-x-3 mt-2">
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="px-6 py-2 bg-surface-3 font-bold text-ink rounded-lg hover:bg-line transition-colors"
              >
                İptal Et
              </button>
            )}
            <button
              type="submit"
              className={`px-6 py-2 font-bold rounded-lg text-white transition-colors ${isEditing ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary hover:bg-primary-hover'}`}
            >
              {pending ? 'Kaydediliyor…' : isEditing ? 'Bilgileri Güncelle' : 'Sisteme Kaydet'}
            </button>
          </div>
        </AdminForm>
      </div>

      {/* ARAMA VE TABLO BÖLÜMÜ */}
      <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden flex flex-col p-4 h-[60vh]">

        {/* YENİ ORTAK ARAMA KUTUSU */}
        <div className="mb-4 relative w-full md:w-1/3 z-50">
          <AutocompleteSearch
            label="Kapı Ara"
            placeholder="Kapı adı yazın..."
            value={arama}
            onChange={handleSearchInputChange}
            suggestions={suggestions}
            onSelect={(item) => {
              handleSuggestionClick(item.originalData);
            }}
          />
        </div>

        <div className="p-2 text-sm font-bold text-ink bg-surface-2 border-t border-x border-line rounded-t-lg">
          Kayıtlı Kapılar ({filteredDoors.length} Kayıt)
        </div>

        {/* YENİ ORTAK TABLO BİLEŞENİ */}
        <div className="flex-1 w-full h-full">
          <CustomDataGrid
            rowData={filteredDoors}
            columnDefs={colDefs}
            exportFileName="GKS_Gecis_Noktalari"
            getRowId={(params) => params.data.ID}
          />
        </div>
      </div>

      <ConfirmAction isOpen={Boolean(confirmation)} title="Kapı Durumunu Değiştir" pending={pending} error={message.type === 'error' ? message.text : ''} onClose={() => setConfirmation(null)} onConfirm={confirmStatus}>
        <p><strong>{confirmation?.name}</strong> kapısı {confirmation?.durum ? 'aktifleştirilecek.' : 'pasife alınacak.'}</p>
        {confirmation?.durum === 0 && <p>Bu kapıya ait tüm personel geçiş yetkileri kaldırılır. Kapıyı tekrar aktifleştirmek bu yetkileri geri getirmez.</p>}
      </ConfirmAction>
    </div>
  );
}

export default Doors;
