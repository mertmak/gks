import { useLatestRequest } from '../hooks/useLatestRequest';
import { usePagedList } from '../hooks/usePagedList';
import { readSession } from '../utils/session';
import { businessDate } from '../utils/dates';
import AdminForm from '../components/AdminForm';
import { useState } from 'react';
import api from '../api/axios';

import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import Modal from '../components/Modal';
import PageHeader from '../components/ui/PageHeader';
import PersonnelFormFields from '../components/personnel/PersonnelFormFields';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import { usePendingAction } from '../hooks/usePendingAction';

function Users() {
  const suggestionRequest = useLatestRequest();
  const detailRequest = useLatestRequest();
  const { pending, run } = usePendingAction();
  const [detailLoading, setDetailLoading] = useState(false);
  const [rehireUser, setRehireUser] = useState(null);
  const departmentRequest = useLatestRequest();
  const quickRequest = useLatestRequest();
  const isAdmin = readSession()?.role === 'admin';
  const [filters, setFilters] = useState({ durum: 'tumu', departman: '', arama: '' });
  const [initialFilters] = useState(filters);
  const { rows: users, pagination, error: listError, loading, search, goToPage, refresh: fetchUsers } = usePagedList('/users', 'users_updated', initialFilters);

  const [suggestions, setSuggestions] = useState([]);
  const [deptSuggestions, setDeptSuggestions] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });

  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ ad_soyad: '', rfid: '', tc: '', sicil: '', sirket: '', departman: '', gorev: '', ise_giris: '' });

  const [showExitModal, setShowExitModal] = useState(false);
  const [exitUser, setExitUser] = useState(null);
  const [exitData, setExitData] = useState({ cikis_tarihi: businessDate(), cikis_nedeni: '' });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authData, setAuthData] = useState({ user: null, allDoors: [], selectedDoors: [] });

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftData, setShiftData] = useState({ user: null, allShifts: [], selectedShiftId: '' });

  const [quickSearch, setQuickSearch] = useState('');
  const [quickSuggestions, setQuickSuggestions] = useState([]);
  const [quickSelectedUser, setQuickSelectedUser] = useState(null);

  const [showBulkShiftModal, setShowBulkShiftModal] = useState(false);
  const [bulkShiftData, setBulkShiftData] = useState({ hedef_turu: 'Departman', hedef_deger: '', vardiya_id: '', allShifts: [] });

  const handleSearchInputChange = async (e) => {
    const value = e.target.value;
    suggestionRequest.cancel();
    setSuggestions([]);
    setFilters({ ...filters, arama: value });
    if (value.length >= 2) {
      try {
        const response = await suggestionRequest.run(signal => api.get('/users', { params: { arama: value, limit: 5 }, signal }));
        if (!response) return;
        const users = response.data?.data ?? response.data;
        const formattedSuggestions = users.map(user => ({
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

  const handleDeptSearchChange = async (e) => {
    const value = e.target.value;
    departmentRequest.cancel();
    setDeptSuggestions([]);
    setFilters({ ...filters, departman: value });
    if (value.length >= 2) {
      try {
        const response = await departmentRequest.run(signal => api.get('/users', { params: { departman: value, limit: 100 }, signal }));
        if (!response) return;
        const usersData = response.data?.data ?? response.data;
        const uniqueDepts = [...new Set(usersData.map(u => u.Departman).filter(d => d && d.trim() !== ''))];

        const formattedDepts = uniqueDepts.map(dept => ({
           label: dept,
           value: dept
        }));
        setDeptSuggestions(formattedDepts.slice(0, 5));
      } catch { /* İstek başarısızsa mevcut seçim korunur. */ }
    } else {
      setDeptSuggestions([]);
    }
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    setSuggestions([]);
    setDeptSuggestions([]);
    await search(filters);
  };

  const handleNumericChange = (e) => {
    const { name, value } = e.target;
    const onlyNums = value.replace(/[^0-9]/g, '');
    setFormData({ ...formData, [name]: onlyNums });
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleExitChange = (e) => setExitData({ ...exitData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });

      if (formData.tc.length !== 11) return setMessage({ text: 'HATA: TC Kimlik No tam 11 haneli olmalıdır.', type: 'error' });
      if (formData.sicil.length !== 5) return setMessage({ text: 'HATA: Sicil No tam 5 haneli olmalıdır.', type: 'error' });
      if (formData.rfid && formData.rfid.length !== 11) return setMessage({ text: 'HATA: RFID Kart No tam 11 haneli olmalıdır.', type: 'error' });

      try {
        if (isEditing) {
          await api.put(`/users/${editId}`, formData);
          setMessage({ text: 'Personel başarıyla güncellendi.', type: 'success' });
        } else {
          await api.post('/users', formData);
          setMessage({ text: 'Yeni personel başarıyla kaydedildi.', type: 'success' });
        }
        setFormData({ ad_soyad: '', rfid: '', tc: '', sicil: '', sirket: '', departman: '', gorev: '', ise_giris: '' });
        setIsEditing(false);
        setEditId(null);
        setShowAddEditModal(false);

        if (quickSelectedUser) setQuickSelectedUser(null);
        fetchUsers();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const handleEditClick = (user) => {
    if (pending) return;
    detailRequest.cancel();
    setDetailLoading(false);
    setMessage({ text: '', type: '' });
    setIsEditing(true);
    setEditId(user.ID);
    setFormData({
      ad_soyad: user.Ad_Soyad || '', rfid: user.RFID_Kart_No?.includes('KART_YOK') ? '' : (user.RFID_Kart_No || ''), tc: user.TC_Kimlik || '', sicil: user.Sicil_No || '', sirket: user.Sirket || '', departman: user.Departman || '', gorev: user.Gorev || '', ise_giris: user.Ise_Giris_Tarihi ? user.Ise_Giris_Tarihi.split('T')[0] : ''
    });
    setShowAddEditModal(true);
  };

  const handleToggleStatus = (user) => {
    if (pending) return;
    detailRequest.cancel();
    setDetailLoading(false);
    setMessage({ text: '', type: '' });
    if (user.Durum) {
      setExitUser(user);
      setExitData({ cikis_tarihi: businessDate(), cikis_nedeni: '' });
      setShowExitModal(true);
    } else setRehireUser(user);
  };

  const confirmRehire = async () => {
    if (!rehireUser) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.patch(`/users/${rehireUser.ID}/status`, { durum: 1 });
        setMessage({ text: 'Personel aktifleştirildi.', type: 'success' });
        setRehireUser(null);
        fetchUsers();
        setQuickSelectedUser(null);
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'Durum güncellenemedi.', type: 'error' });
      }
    });
  };

  const handleExitSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.patch(`/users/${exitUser.ID}/status`, { durum: 0, cikis_tarihi: exitData.cikis_tarihi, cikis_nedeni: exitData.cikis_nedeni, ad_soyad: exitUser.Ad_Soyad, sicil: exitUser.Sicil_No });
        setMessage({ text: 'Personel pasife alındı.', type: 'success' });
        setShowExitModal(false);
        setExitData({ cikis_tarihi: businessDate(), cikis_nedeni: '' });
        fetchUsers();
        setQuickSelectedUser(null);
      } catch (error) { setMessage({ text: error.response?.data?.message || 'İşten çıkış işlemi başarısız oldu.', type: 'error' }); }
    });
  };

  const cancelEdit = () => {
    if (pending) return;
    setIsEditing(false);
    setEditId(null);
    setFormData({ ad_soyad: '', rfid: '', tc: '', sicil: '', sirket: '', departman: '', gorev: '', ise_giris: '' });
    setMessage({ text: '', type: '' });
    setShowAddEditModal(false);
  };

  const handleAuthClick = async (user) => {
    if (pending) return;
    setMessage({ text: '', type: '' });
    setDetailLoading(true);
    try {
      const results = await detailRequest.run(signal => Promise.all([api.get('/doors', { signal }), api.get(`/users/${user.ID}/doors`, { signal })]));
      if (!results) return;
      const [doorsRes, authRes] = results;
      const activeDoors = doorsRes.data.filter(d => d.Durum !== false);
      const activeDoorIds = activeDoors.map(d => d.ID);
      const selectedActiveDoors = authRes.data.filter(doorId => activeDoorIds.includes(doorId));
      setAuthData({ user: user, allDoors: activeDoors, selectedDoors: selectedActiveDoors });
      setShowAuthModal(true);
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Yetki bilgileri alınırken hata oluştu.', type: 'error' }); }
    setDetailLoading(false);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.post(`/users/${authData.user.ID}/doors`, { doorIds: authData.selectedDoors });
        setMessage({ text: `${authData.user.Ad_Soyad} için yetkiler güncellendi.`, type: 'success' });
        setShowAuthModal(false);
      } catch (error) { setMessage({ text: error.response?.data?.message || 'Yetkiler kaydedilemedi.', type: 'error' }); }
    });
  };

  const handleShiftClick = async (user) => {
    if (pending) return;
    setMessage({ text: '', type: '' });
    setDetailLoading(true);
    try {
      const results = await detailRequest.run(signal => Promise.all([api.get('/shifts', { signal }), api.get(`/users/${user.ID}/shift`, { signal })]));
      if (!results) return;
      const [shiftsRes, currentShiftRes] = results;
      const activeShifts = shiftsRes.data.filter(shift => shift.Durum);
      setShiftData({ user: user, allShifts: activeShifts, selectedShiftId: currentShiftRes.data.vardiya_id || '' });
      setShowShiftModal(true);
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Vardiya bilgileri alınırken hata oluştu.', type: 'error' }); }
    setDetailLoading(false);
  };

  const handleShiftSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.post(`/users/${shiftData.user.ID}/shift`, { vardiya_id: shiftData.selectedShiftId });
        setMessage({ text: `${shiftData.user.Ad_Soyad} için vardiya ataması yapıldı.`, type: 'success' });
        setShowShiftModal(false);
      } catch (error) { setMessage({ text: error.response?.data?.message || 'Vardiya ataması kaydedilemedi.', type: 'error' }); }
    });
  };

  const handleQuickSearchChange = async (e) => {
    const value = e.target.value;
    detailRequest.cancel();
    setDetailLoading(false);
    quickRequest.cancel();
    setQuickSuggestions([]);
    setQuickSearch(value);
    setQuickSelectedUser(null);
    if (value.length >= 2) {
      try {
        const response = await quickRequest.run(signal => api.get('/users', { params: { arama: value, limit: 8 }, signal }));
        if (!response) return;
        const usersArr = response.data?.data ?? response.data;
        const formattedSuggestions = usersArr.map(user => ({
           label: user.Ad_Soyad,
           subLabel: `Sicil: ${user.Sicil_No} | ${user.Departman || 'Departman Yok'}`,
           value: user.Ad_Soyad,
           originalData: user
        }));
        setQuickSuggestions(formattedSuggestions.slice(0, 5));
      } catch { /* İstek başarısızsa mevcut seçim korunur. */ }
    } else {
      setQuickSuggestions([]);
    }
  };

  const openBulkShiftModal = async () => {
    if (pending) return;
    setMessage({ text: '', type: '' });
    setDetailLoading(true);
    try {
      const shiftsRes = await detailRequest.run(signal => api.get('/shifts', { signal }));
      if (!shiftsRes) return;
      const activeShifts = shiftsRes.data.filter(shift => shift.Durum);
      setBulkShiftData({ ...bulkShiftData, allShifts: activeShifts, hedef_deger: '', vardiya_id: '' });
      setShowBulkShiftModal(true);
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Sistemdeki vardiyalar çekilemedi.', type: 'error' }); }
    setDetailLoading(false);
  };

  const handleBulkShiftSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        const res = await api.post('/users/bulk/shift', {
          hedef_turu: bulkShiftData.hedef_turu,
          hedef_deger: bulkShiftData.hedef_deger,
          vardiya_id: bulkShiftData.vardiya_id
        });
        setMessage({ text: res.data.message, type: 'success' });
        setShowBulkShiftModal(false);
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'Toplu işlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const colDefs = [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 120, filter: true },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 180, filter: true },
    { field: 'Departman', headerName: 'Departman', flex: 1, minWidth: 160, filter: true },
    {
      field: 'Durum', headerName: 'Durum', width: 100,
      valueFormatter: ({ value }) => value ? 'Aktif' : 'Pasif',
      cellRenderer: (params) => params.value
        ? <span className="badge bg-success-soft text-success border-success-line">Aktif</span>
        : <span className="badge bg-danger-soft text-danger border-danger-line">Pasif</span>
    },
    {
      headerName: 'İşlemler', width: 320, sortable: false, filter: false,
      cellRenderer: (params) => (
        <div className="flex gap-2 h-full items-center">
          <button disabled={pending || detailLoading} onClick={() => handleEditClick(params.data)} className="btn btn-sm bg-info-soft text-info">Düzenle</button>
          <button disabled={pending || detailLoading} onClick={() => handleAuthClick(params.data)} className="btn btn-sm bg-accent-soft text-accent">Yetkiler</button>
          <button disabled={pending || detailLoading} onClick={() => handleShiftClick(params.data)} className="btn btn-sm bg-warning-soft text-warning">Vardiya</button>
          <button disabled={pending || detailLoading} onClick={() => handleToggleStatus(params.data)} className={`btn btn-sm ${params.data.Durum ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
            {params.data.Durum ? 'İşten Çıkar' : 'İşe Al'}
          </button>
        </div>
      )
    }
  ];


  return (
    <div className="space-y-6 relative mt-4">

      <PageHeader title="Personel Listesi" description="Personeli durum, departman veya ad/sicil/T.C. ile arayın. Yönetici hesabı tablodan düzenleme, yetki, vardiya ve işten çıkış işlemlerini yapar.">
        {isAdmin && <button disabled={pending}
          onClick={() => {
            detailRequest.cancel();
            setDetailLoading(false);
            setMessage({ text: '', type: '' });
            setEditId(null);
            setIsEditing(false);
            setFormData({ ad_soyad: '', rfid: '', tc: '', sicil: '', sirket: '', departman: '', gorev: '', ise_giris: '' });
            setShowAddEditModal(true);
          }}
          className="btn btn-primary"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          Yeni Personel Ekle
        </button>}
      </PageHeader>

      {/* --- MODALLAR --- */}

      <Modal isOpen={showAddEditModal} onClose={cancelEdit} title={isEditing ? 'Personel Düzenle' : 'Yeni Personel Kaydı'} maxWidth="max-w-4xl">
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <AdminForm disabled={pending} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <PersonnelFormFields formData={formData} onChange={handleChange} onNumericChange={handleNumericChange} />

          <div className="md:col-span-4 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={cancelEdit} className="btn btn-secondary">İptal</button>
            <button type="submit" className="btn btn-primary">
              {pending ? 'Kaydediliyor…' : isEditing ? 'Bilgileri Güncelle' : 'Kaydet'}
            </button>
          </div>
        </AdminForm>
      </Modal>

      <Modal isOpen={showExitModal} onClose={() => { if (!pending) setShowExitModal(false); }} title="İşten Çıkış / Pasife Al" maxWidth="max-w-md">
        <p className="text-sm mb-3">{exitUser?.Ad_Soyad} · {exitUser?.Sicil_No}</p>
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <AdminForm disabled={pending} onSubmit={handleExitSubmit} className="space-y-4">
          <div><label className="field-label" htmlFor="users-field-8">İşten Çıkış Tarihi *</label><input id="users-field-8" type="date" name="cikis_tarihi" min={exitUser?.Ise_Giris_Tarihi?.slice(0, 10)} max={businessDate()} value={exitData.cikis_tarihi} onChange={handleExitChange} required className="field" /></div>
          <div><label className="field-label" htmlFor="users-field-9">Çıkış Nedeni (Opsiyonel)</label><textarea id="users-field-9" name="cikis_nedeni" maxLength={255} value={exitData.cikis_nedeni} onChange={handleExitChange} rows="3" className="field resize-none"></textarea></div>
          <div className="flex flex-wrap justify-end gap-3 mt-6"><button type="button" onClick={() => setShowExitModal(false)} className="btn btn-secondary">İptal</button><button type="submit" className="btn btn-danger">Onayla ve Kapat</button></div>
        </AdminForm>
      </Modal>

      <Modal isOpen={showAuthModal} onClose={() => { if (!pending) setShowAuthModal(false); }} title="Kapı Geçiş Yetkileri" maxWidth="max-w-md">
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <p className="text-sm text-muted mb-4"><span className="font-bold">{authData.user?.Ad_Soyad}</span> için izinli kapıları seçin.</p>
        <p className="text-sm text-muted mb-4">Hiç kapı seçmezseniz mevcut tüm geçiş yetkileri kaldırılır.</p>
        <AdminForm disabled={pending} onSubmit={handleAuthSubmit}>
          <div className="max-h-60 overflow-y-auto border border-line rounded-lg p-2 mb-4 bg-surface-2">
            {authData.allDoors.map(door => (
              <label key={door.ID} className="flex items-center p-3 hover:bg-surface cursor-pointer border-b border-line last:border-0 rounded transition-colors">
                <input type="checkbox" className="w-5 h-5 accent-[var(--color-accent)]" checked={authData.selectedDoors.includes(door.ID)} onChange={() => {
                    setAuthData(prev => ({...prev, selectedDoors: prev.selectedDoors.includes(door.ID) ? prev.selectedDoors.filter(id => id !== door.ID) : [...prev.selectedDoors, door.ID]}));
                }}/>
                <span className="ml-3 text-sm font-bold text-ink">{door.Kapi_Adi}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-3 mt-6"><button type="button" onClick={() => setShowAuthModal(false)} className="btn btn-secondary">İptal</button><button type="submit" className="btn btn-primary">Kaydet</button></div>
        </AdminForm>
      </Modal>

      <Modal isOpen={showShiftModal} onClose={() => { if (!pending) setShowShiftModal(false); }} title="Bireysel Vardiya Ataması" maxWidth="max-w-md">
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <p className="text-sm text-muted mb-4"><span className="font-bold">{shiftData.user?.Ad_Soyad}</span> adlı personelin vardiyasını belirleyin.</p>
        <p className="text-sm text-muted mb-4">Yeni atama bugünden geçerlidir. Boş seçim mevcut vardiya atamasını iptal eder; önceki günler korunur.</p>
        <AdminForm disabled={pending} onSubmit={handleShiftSubmit}>
          <select aria-label="Atanacak Vardiya" className="field" value={shiftData.selectedShiftId} onChange={(e) => setShiftData({...shiftData, selectedShiftId: e.target.value})}>
            <option value="">-- Vardiya Atanmamış --</option>
            {shiftData.allShifts.map(shift => <option key={shift.ID} value={shift.ID}>{shift.Vardiya_Adi}</option>)}
          </select>
          <div className="flex flex-wrap justify-end gap-3 mt-6"><button type="button" onClick={() => setShowShiftModal(false)} className="btn btn-secondary">İptal</button><button type="submit" className="btn btn-primary">Vardiyayı Kaydet</button></div>
        </AdminForm>
      </Modal>

      <Modal isOpen={showBulkShiftModal} onClose={() => { if (!pending) setShowBulkShiftModal(false); }} title="Toplu Vardiya Atama" maxWidth="max-w-md">
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <p className="text-sm text-muted mb-4">Tam eşleşen departman veya şirketteki aktif personelin vardiyası bugünden itibaren değişir. Boş vardiya seçimi mevcut atamaları iptal eder; önceki günler korunur.</p>
        <AdminForm disabled={pending} onSubmit={handleBulkShiftSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="users-field-10">Hedef Türü</label>
              <select id="users-field-10" className="field" value={bulkShiftData.hedef_turu} onChange={(e) => setBulkShiftData({...bulkShiftData, hedef_turu: e.target.value})}>
                <option value="Departman">Departman'a Göre</option>
                <option value="Sirket">Şirket / Taşeron'a Göre</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="users-field-11">Hedef Adı (Tam Eşleşme)</label>
              <input id="users-field-11" type="text" placeholder="Örn: Bilgi İşlem" className="field" value={bulkShiftData.hedef_deger} onChange={(e) => setBulkShiftData({...bulkShiftData, hedef_deger: e.target.value})} required />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="users-field-12">Atanacak Vardiya</label>
            <select id="users-field-12" className="field" value={bulkShiftData.vardiya_id} onChange={(e) => setBulkShiftData({...bulkShiftData, vardiya_id: e.target.value})}>
              <option value="">-- Vardiyaları İptal Et --</option>
              {bulkShiftData.allShifts.map(shift => <option key={shift.ID} value={shift.ID}>{shift.Vardiya_Adi}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowBulkShiftModal(false)} className="btn btn-secondary">İptal</button>
            <button type="submit" className="btn btn-primary">Toplu İşlemi Başlat</button>
          </div>
        </AdminForm>
      </Modal>

      <AlertMessage message={message.text} type={message.type} />
      {detailLoading && <p role="status">Seçilen personelin bilgileri yükleniyor…</p>}
      {/* --- HIZLI İŞLEM PANELİ --- */}
      {isAdmin && <section aria-label="Hızlı işlem" className="card flex flex-col md:flex-row gap-6 md:items-end z-30 relative">
        <div className="flex-1">
          <AutocompleteSearch
            label="Hızlı İşlem (İsim veya Sicil No Ara)"
            placeholder="Kişiyi bulun, işlemi seçin"
            value={quickSearch}
            onChange={handleQuickSearchChange}
            suggestions={quickSuggestions}
            onSelect={(item) => {
              quickRequest.cancel();
              setQuickSelectedUser(item.originalData);
              setQuickSearch(item.value);
              setQuickSuggestions([]);
            }}
          />
        </div>

        {quickSelectedUser && (
          <div className="flex flex-wrap items-center gap-2 pb-1">
             <button disabled={pending || detailLoading} onClick={() => handleEditClick(quickSelectedUser)} className="btn bg-info-soft text-info">Düzenle</button>
             <button disabled={pending || detailLoading} onClick={() => handleAuthClick(quickSelectedUser)} className="btn bg-accent-soft text-accent">Yetkiler</button>
             <button disabled={pending || detailLoading} onClick={() => handleShiftClick(quickSelectedUser)} className="btn bg-warning-soft text-warning">Vardiya</button>
             <button disabled={pending || detailLoading} onClick={() => handleToggleStatus(quickSelectedUser)} className={`btn ${quickSelectedUser.Durum ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                {quickSelectedUser.Durum ? 'Pasife Al' : 'İşe Al'}
             </button>
          </div>
        )}

        <div className="border-t md:border-t-0 md:border-l border-line pt-4 md:pt-0 md:pl-6 pb-1">
           <button disabled={pending || detailLoading} onClick={openBulkShiftModal} className="btn btn-primary w-full md:w-auto">
              Toplu Vardiya Ata
           </button>
        </div>
      </section>}

      <form onSubmit={handleFetchData} className="card grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative z-20">
        <div>
          <label className="field-label" htmlFor="users-field-13">Durum Filtresi</label>
          <select id="users-field-13"
            value={filters.durum}
            onChange={(e) => setFilters({...filters, durum: e.target.value})}
            className="field"
          >
            <option value="tumu">Tüm Personeller</option>
            <option value="1">Sadece Aktif (Çalışan)</option>
            <option value="0">Sadece Pasif (İşten Çıkan)</option>
          </select>
        </div>

        <div className="relative">
          <AutocompleteSearch
            label="Departman"
            placeholder="Örn: Bilgi İşlem"
            value={filters.departman}
            onChange={handleDeptSearchChange}
            suggestions={deptSuggestions}
            onSelect={(item) => {
              setFilters({...filters, departman: item.value});
              setDeptSuggestions([]);
            }}
          />
        </div>

        <div className="relative">
          <AutocompleteSearch
            label="Ad Soyad / Sicil No / TC"
            placeholder="Ad, sicil veya T.C."
            value={filters.arama}
            onChange={handleSearchInputChange}
            suggestions={suggestions}
            onSelect={(item) => {
              setFilters({...filters, arama: item.value});
              setSuggestions([]);
            }}
          />
        </div>

        <div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
             {loading ? 'Aranıyor…' : 'Personelleri Listele'}
          </button>
        </div>
      </form>

      {listError && <p role="alert" className="text-danger">{listError} <button type="button" onClick={fetchUsers} className="underline">Tekrar dene</button></p>}
      <section aria-label="Personel" className="card p-2 flex flex-col h-[60vh]">
        <p className="p-2 text-sm font-semibold text-ink">{loading ? 'Yükleniyor…' : `${pagination.total ?? users.length} personel`}</p>
        <CustomDataGrid
          rowData={users}
          serverPagination={pagination}
          onPageChange={goToPage}
          columnDefs={colDefs}
          exportFileName="GKS_Personel"
          getRowId={(params) => params.data.ID}
        />
      </section>
      <ConfirmAction isOpen={Boolean(rehireUser)} title="Personeli İşe Al" pending={pending} error={message.type === 'error' ? message.text : ''} onClose={() => setRehireUser(null)} onConfirm={confirmRehire}>
        <p><strong>{rehireUser?.Ad_Soyad}</strong> ({rehireUser?.Sicil_No}) tekrar aktifleştirilecek.</p>
        <p>Aynı gün yapılan çıkış geri alınır; önceki bir çıkıştan sonra yeniden işe alım bugünden başlar. Önceki çalışma dönemi korunur.</p>
      </ConfirmAction>
    </div>
  );
}

export default Users;
