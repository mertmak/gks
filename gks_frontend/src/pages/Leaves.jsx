import { useLatestRequest } from '../hooks/useLatestRequest';
import { useLiveList } from '../hooks/useLiveList';
import { businessDate } from '../utils/dates';
import AdminForm from '../components/AdminForm';
import PageHeader from '../components/ui/PageHeader';
import { canWrite } from '../utils/session';
import { useEffect, useState } from 'react';
import api from '../api/axios';
import { listRows } from '../api/lists';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import CustomDataGrid from '../components/CustomDataGrid';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import { usePendingAction } from '../hooks/usePendingAction';
import LeaveBalances from '../components/LeaveBalances';

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
    aciklama: '',
    durum: 'Onaylandı'
  });
  const [note, setNote] = useState('');

  // Annual leave request: show the remaining entitlement and the working days this range uses.
  const balanceKey = selectedUser && formData.izin_turu === 'Yıllık İzin' && formData.baslangic && formData.bitis >= formData.baslangic
    ? `${selectedUser.ID}|${formData.baslangic}|${formData.bitis}` : '';
  const [balance, setBalance] = useState({ key: '', data: null, error: '' });
  useEffect(() => {
    if (!balanceKey) return undefined;
    const [user_id, baslangic, bitis] = balanceKey.split('|');
    const controller = new AbortController();
    api.get('/leaves/balances', { params: { user_id, baslangic, bitis }, signal: controller.signal })
      .then(response => setBalance({ key: balanceKey, data: response.data[0], error: '' }))
      .catch(() => { if (!controller.signal.aborted) setBalance({ key: balanceKey, data: null, error: 'İzin bakiyesi alınamadı.' }); });
    return () => controller.abort();
  }, [balanceKey]);
  const shownBalance = balanceKey && balance.key === balanceKey ? balance : null;

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
        setMessage({ text: formData.durum === 'Bekliyor' ? 'İzin talebi onaya gönderildi.' : 'İzin başarıyla kaydedildi.', type: 'success' });

        // Formu sıfırla
        setFormData({ izin_turu: 'Yıllık İzin', baslangic: businessDate(), bitis: businessDate(), aciklama: '', durum: 'Onaylandı' });
        setSelectedUser(null);
        setArama('');
        fetchLeaves();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'İzin eklenirken hata oluştu.', type: 'error' });
      }
    });
  };

  // action: 'Sil', 'Onaylandı' or 'Reddedildi'
  const openConfirmation = (leave, action) => {
    if (loading || confirmation) return;
    setMessage({ text: '', type: '' });
    setNote('');
    setConfirmation({ ...leave, action });
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const { ID, action } = confirmation;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        const response = action === 'Sil' ? await api.delete(`/leaves/${ID}`) : await api.put(`/leaves/${ID}/durum`, { durum: action, aciklama: note });
        setMessage({ text: response.data.message, type: 'success' });
        setConfirmation(null);
        fetchLeaves();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'İşlem başarısız.', type: 'error' });
      }
    });
  };
  const pendingCount = leaves.filter(row => row.Durum === 'Bekliyor').length;
  const confirmTitles = { Sil: ['İzin Kaydını Sil', 'İzni Sil'], Onaylandı: ['İzni Onayla', 'Onayla'], Reddedildi: ['İzni Reddet', 'Reddet'] };
  const [confirmTitle, confirmLabel] = confirmTitles[confirmation?.action] || confirmTitles.Sil;

  const colDefs = [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 120 },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 150, cellClass: 'font-bold text-ink' },
    { field: 'Departman', headerName: 'Departman', width: 130 },
    {
      field: 'Izin_Turu',
      headerName: 'İzin Türü',
      width: 150,
      cellRenderer: (params) => (
        <span className={`badge ${params.value === 'Raporlu' ? 'bg-danger-soft text-danger border-danger-line' : 'bg-info-soft text-info border-info-line'}`}>
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
    {
      field: 'Durum', headerName: 'Onay Durumu', width: 140,
      cellRenderer: ({ value }) => <span className={`badge ${value === 'Bekliyor' ? 'bg-warning-soft text-ink' : value === 'Reddedildi' ? 'bg-danger-soft text-danger border-danger-line' : 'bg-success-soft text-success'}`}>{value}</span>
    },
    { headerName: 'Kayıt Kontrolü', width: 170, valueGetter: ({ data }) => data.Cakisma_Var ? 'İzin Çakışması' : '—' },
    { field: 'Aciklama', headerName: 'Açıklama', flex: 1, minWidth: 150 },
    ...(canWrite() ? [{
      headerName: 'İşlemler', width: 250, pinned: 'right', sortable: false, filter: false,
      cellRenderer: ({ data }) => {
        const busy = loading || Boolean(confirmation);
        return <div className="flex gap-2">
          {data.Durum === 'Bekliyor' && <>
            <button type="button" disabled={busy} onClick={() => openConfirmation(data, 'Onaylandı')} className="btn btn-sm btn-primary">Onayla</button>
            <button type="button" disabled={busy} onClick={() => openConfirmation(data, 'Reddedildi')} className="btn btn-sm btn-secondary">Reddet</button>
          </>}
          <button type="button" disabled={busy} onClick={() => openConfirmation(data, 'Sil')} className="btn btn-sm bg-danger-soft text-danger">İptal Et</button>
        </div>;
      }
    }] : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="İzin ve Rapor Girişi" description="Yıllık izin, sağlık raporu, mazeret ve ücretsiz izin kayıtları. Onaylı izinler puantajda o günlerin durumunu belirler." />

      {leaves.some(row => row.Cakisma_Var) && <p role="alert" className="p-3 bg-warning-soft text-ink rounded-lg">Çakışan onaylı veya bekleyen izinler var. İlgili personelin tarih aralıklarını inceleyip hatalı kaydı kaldırın. Aynı gündeki birden fazla onaylı izin puantajda “İzin Çakışması” olarak gösterilir.</p>}
      <AlertMessage message={message.text} type={message.type} />

      {canWrite() && <section aria-labelledby="leave-form-title" className="card">
        <h2 id="leave-form-title" className="text-lg font-semibold text-ink mb-4">Yeni İzin Girişi</h2>
        <AdminForm onSubmit={handleSubmit} disabled={loading || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">

          <div className="md:col-span-1 relative z-20">
            <AutocompleteSearch
              label="Personel Ara *"
              placeholder="İsim veya sicil yazın…"
              value={arama}
              onChange={handleSearchInputChange}
              suggestions={suggestions}
              onSelect={(item) => {
                handleSelectUser(item.originalData);
              }}
              required={!selectedUser}
            />
            {searchError && <p role="alert" className="text-sm text-danger">{searchError}</p>}
          </div>

          <div>
            <label className="field-label" htmlFor="leaves-field-1">İzin Türü *</label>
            <select id="leaves-field-1" name="izin_turu" value={formData.izin_turu} onChange={handleChange} className="field">
              <option value="Yıllık İzin">Yıllık İzin</option>
              <option value="Raporlu">Sağlık Raporu</option>
              <option value="Mazeret İzni">Mazeret İzni</option>
              <option value="Ücretsiz İzin">Ücretsiz İzin</option>
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="leaves-field-2">Başlangıç Tarihi *</label>
            <input id="leaves-field-2" type="date" name="baslangic" value={formData.baslangic} onChange={handleChange} required className="field" />
          </div>

          <div>
            <label className="field-label" htmlFor="leaves-field-3">Bitiş Tarihi *</label>
            <input id="leaves-field-3" type="date" name="bitis" min={formData.baslangic} value={formData.bitis} onChange={handleChange} required className="field" />
          </div>

          {balanceKey && <div className="md:col-span-4 text-sm" aria-live="polite">
            {!shownBalance ? <p className="text-muted">İzin bakiyesi hesaplanıyor…</p>
              : shownBalance.error ? <p className="text-danger">{shownBalance.error}</p>
              : <>
                <p className="text-ink">Kalan yıllık izin: <strong>{shownBalance.data.Kalan} gün</strong> (hak edilen {shownBalance.data.Hak_Edilen}, kullanılan {shownBalance.data.Kullanilan}{shownBalance.data.Bekleyen ? `, onay bekleyen ${shownBalance.data.Bekleyen}` : ''}). Bu talep <strong>{shownBalance.data.Talep_Gun} iş günü</strong>.</p>
                {shownBalance.data.Talep_Gun > shownBalance.data.Kalan && <p role="alert" className="mt-2 p-3 bg-warning-soft text-ink rounded-lg">Talep, kalan yıllık izin hakkını {shownBalance.data.Talep_Gun - shownBalance.data.Kalan} gün aşıyor. Kayıt yine de yapılabilir (avans izin).</p>}
              </>}
          </div>}

          <div>
            <label className="field-label" htmlFor="leaves-field-5">Kayıt Durumu</label>
            <select id="leaves-field-5" name="durum" value={formData.durum} onChange={handleChange} className="field">
              <option value="Onaylandı">Onaylı</option>
              <option value="Bekliyor">Onaya gönder</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="field-label" htmlFor="leaves-field-4">Açıklama (Opsiyonel)</label>
            <input id="leaves-field-4" type="text" name="aciklama" maxLength={255} value={formData.aciklama} onChange={handleChange} placeholder="İzin sebebi, rapor numarası vb." className="field" />
          </div>

          <div className="flex items-end h-full">
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'İşleniyor…' : 'İzni Kaydet'}
            </button>
          </div>
        </AdminForm>
      </section>}

      <section aria-labelledby="leave-list-title" className="card p-4 flex flex-col h-[60vh]">
        <h2 id="leave-list-title" className="p-2 text-sm font-semibold text-ink">{listLoading ? 'İzinler yükleniyor…' : `Kayıtlı izinler (${leaves.length})${pendingCount ? ` · ${pendingCount} onay bekliyor` : ''}`}</h2>
        {listError && <p role="alert" className="text-danger mb-2">{listError} <button type="button" onClick={fetchLeaves} className="underline">Tekrar dene</button></p>}
        <CustomDataGrid
          rowData={leaves}
          columnDefs={colDefs}
          exportFileName="GKS_Izinler"
          getRowId={(params) => params.data.ID}
        />
      </section>
      <LeaveBalances />
      <ConfirmAction isOpen={Boolean(confirmation)} title={confirmTitle} pending={loading} error={message.type === 'error' ? message.text : ''} onClose={() => setConfirmation(null)} onConfirm={confirmAction} confirmLabel={confirmLabel} confirmClassName={confirmation?.action === 'Onaylandı' ? 'btn-primary' : 'btn-danger'}>
        <p><strong>{confirmation?.Ad_Soyad}</strong> · {confirmation?.Izin_Turu}</p>
        <p>{confirmation?.Baslangic_Tarihi?.slice(0, 10)} – {confirmation?.Bitis_Tarihi?.slice(0, 10)}</p>
        {confirmation?.action === 'Sil' ? <p>Bu izin kaydı silinecek ve ilgili günlerin puantaj hesabı yeniden değerlendirilecek.</p> : <>
          <p>{confirmation?.action === 'Onaylandı' ? 'Onaylanan izin puantajda ve yıllık izin bakiyesinde kullanılmış sayılır.' : 'Reddedilen izin günleri serbest kalır; kayıt geçmiş için saklanır.'}</p>
          <div><label className="field-label" htmlFor="leave-decision-note">Karar notu (opsiyonel)</label><input id="leave-decision-note" type="text" maxLength={255} value={note} onChange={e => setNote(e.target.value)} className="field" placeholder="Denetim kaydına yazılır" /></div>
        </>}
      </ConfirmAction>
    </div>
  );
}

export default Leaves;
