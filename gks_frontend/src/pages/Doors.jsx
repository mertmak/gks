import { useLiveList } from '../hooks/useLiveList';
import AdminForm from '../components/AdminForm';
import PageHeader from '../components/ui/PageHeader';
import { canWrite } from '../utils/session';
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
    document.getElementById('doors-field-1')?.focus();
  };

  const handleToggleStatus = (door) => {
    if (pending || confirmation) return;
    const isActive = door.Durum !== false;
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
        return <span className={`font-semibold ${color}`}>{val}</span>;
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
        return params.value !== false
          ? <span className="badge bg-success-soft text-success border-success-line">Aktif</span>
          : <span className="badge bg-danger-soft text-danger border-danger-line">Pasif</span>;
      }
    },
    {
      headerName: 'İşlemler',
      width: 200,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const isActive = params.data.Durum !== false;

        return (
          <div className="flex gap-2 h-full items-center">
            <button
              disabled={pending || Boolean(confirmation)} onClick={() => handleEditClick(params.data)}
              className="btn btn-sm bg-info-soft text-info"
            >
              Düzenle
            </button>
            <button
              disabled={pending || Boolean(confirmation)} onClick={() => handleToggleStatus(params.data)}
              className={`btn btn-sm ${isActive ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}
            >
              {isActive ? 'Pasife Al' : 'Aktifleştir'}
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Geçiş Noktaları" description={canWrite() ? 'Kapıları ekleyin, düzenleyin ve durumlarını değiştirin. Planda yerleştirme Tesis Tasarımı sayfasındadır.' : 'Sistemdeki kapılar, türleri ve durumları.'} />

      <AlertMessage message={message.text} type={message.type} />

      {canWrite() && <section aria-labelledby="door-form-title" className="card">
        <h2 id="door-form-title" className="text-lg font-semibold text-ink mb-4">
          {isEditing ? 'Kapı Bilgilerini Düzenle' : 'Yeni Kapı Ekle'}
        </h2>
        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="field-label" htmlFor="doors-field-1">Kapı Adı *</label>
            <input id="doors-field-1" type="text" name="kapi_adi" maxLength={100} value={formData.kapi_adi} onChange={handleChange} placeholder="Örn: Ana Giriş Turnikesi" required className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="doors-field-2">Kapı Türü (İşlevi) *</label>
            <select id="doors-field-2" name="kapi_turu" value={formData.kapi_turu} onChange={handleChange} className="field">
              <option value="İç Geçiş">İç Geçiş (Standart Kapı)</option>
              <option value="Ana Giriş">Ana Giriş (Mesai Başlar)</option>
              <option value="Ana Çıkış">Ana Çıkış (Mesai Biter)</option>
              <option value="Yemekhane Giriş">Yemekhane Giriş</option>
              <option value="Yemekhane Çıkış">Yemekhane Çıkış</option>
              <option value="Mola / Sigara Alanı">Mola / Sigara Alanı</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="doors-field-3">Bağlı Olduğu Departman *</label>
            <input id="doors-field-3" type="text" name="departman" maxLength={100} value={formData.departman} onChange={handleChange} placeholder="Örn: Bilgi İşlem" required className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="doors-field-4">Fiziksel Konum *</label>
            <input id="doors-field-4" type="text" name="konum" maxLength={100} value={formData.konum} onChange={handleChange} placeholder="Örn: A Blok Zemin Kat" required className="field" />
          </div>
          <div className="md:col-span-4 flex flex-wrap justify-end gap-3">
            {isEditing && <button type="button" onClick={cancelEdit} className="btn btn-secondary">İptal Et</button>}
            <button type="submit" className="btn btn-primary">
              {pending ? 'Kaydediliyor…' : isEditing ? 'Bilgileri Güncelle' : 'Sisteme Kaydet'}
            </button>
          </div>
        </AdminForm>
      </section>}

      <section aria-label="Kayıtlı kapılar" className="card p-4 flex flex-col h-[60vh]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-3">
          <div className="w-full md:w-1/3 relative z-20">
            <AutocompleteSearch
              label="Kapı Ara"
              placeholder="Kapı adı yazın…"
              value={arama}
              onChange={handleSearchInputChange}
              suggestions={suggestions}
              onSelect={(item) => handleSuggestionClick(item.originalData)}
            />
          </div>
          <p className="text-sm font-semibold text-ink">{loading ? 'Liste yükleniyor…' : `${filteredDoors.length} kapı`}</p>
        </div>
        {listError && <p role="alert" className="text-danger mb-2">{listError} <button type="button" onClick={fetchDoors} className="underline">Tekrar dene</button></p>}
        <CustomDataGrid
          rowData={filteredDoors}
          columnDefs={colDefs}
          exportFileName="GKS_Gecis_Noktalari"
          getRowId={(params) => params.data.ID}
        />
      </section>

      <ConfirmAction isOpen={Boolean(confirmation)} title="Kapı Durumunu Değiştir" pending={pending} error={message.type === 'error' ? message.text : ''} onClose={() => setConfirmation(null)} onConfirm={confirmStatus}>
        <p><strong>{confirmation?.name}</strong> kapısı {confirmation?.durum ? 'aktifleştirilecek.' : 'pasife alınacak.'}</p>
        {confirmation?.durum === 0 && <p>Bu kapıya ait tüm personel geçiş yetkileri kaldırılır. Kapıyı tekrar aktifleştirmek bu yetkileri geri getirmez.</p>}
      </ConfirmAction>
    </div>
  );
}

export default Doors;
