import { businessDate } from '../utils/dates';
import { useState, useMemo } from 'react';
import api from '../api/axios';
import { fetchAllUsers } from '../api/lists';
import { useLiveList } from '../hooks/useLiveList';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import AlertMessage from '../components/AlertMessage';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/Modal';

const DOOR_EVENTS = ['doors_updated'];
const SHIFT_EVENTS = ['shifts_updated'];
const USER_EVENTS = ['users_updated'];
const loadUsers = async ({ signal }) => ({ data: await fetchAllUsers({ signal }) });

function BulkOperations() {
  const [hedefTuru, setHedefTuru] = useState('Departman');
  const [hedefDeger, setHedefDeger] = useState('');

  
  const [islemTuru, setIslemTuru] = useState('vardiya'); 
  const [vardiyaId, setVardiyaId] = useState('');
  const shifts = useLiveList('/shifts', SHIFT_EVENTS);
  
  const doors = useLiveList('/doors', DOOR_EVENTS);
  const [selectedDoors, setSelectedDoors] = useState([]);

  const [durumHedefi, setDurumHedefi] = useState(0); 
  const [exitData, setExitData] = useState({ 
    cikis_tarihi: businessDate(),
    cikis_nedeni: '' 
  });
  
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const users = useLiveList(loadUsers, USER_EVENTS);
  const allShifts = shifts.rows.filter(s => s.Durum);
  const allDoors = doors.rows.filter(d => d.Durum !== false);
  const rehire = islemTuru === 'durum' && durumHedefi === 1;
  const targetStatus = rehire ? 'PASİF' : 'AKTİF';
  const dataLoading = users.loading || (islemTuru === 'vardiya' && shifts.loading) || (islemTuru === 'yetki' && doors.loading);
  const dataError = users.error || (islemTuru === 'vardiya' && shifts.error) || (islemTuru === 'yetki' && doors.error);
  const suggestions = useMemo(() => {
    if (!hedefDeger || hedefTuru === 'Tumu') return [];
    const grouped = new Map();
    for (const user of users.rows) {
      if (Boolean(user.Durum) === rehire) continue;
      const key = hedefTuru === 'Departman' ? user.Departman : user.Sirket;
      if (!key?.toLocaleLowerCase('tr-TR').includes(hedefDeger.toLocaleLowerCase('tr-TR'))) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(user.Ad_Soyad);
    }
    return [...grouped].slice(0, 5).map(([key, names]) => ({
      label: key, value: key, subLabel: 'Örnek: ' + names.slice(0, 2).join(', ')
    }));
  }, [users.rows, rehire, hedefTuru, hedefDeger]);

  const handleDoorSelection = (doorId) => {
    setSelectedDoors(prev => prev.includes(doorId) ? prev.filter(id => id !== doorId) : [...prev, doorId]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || dataLoading || dataError) return;
    
    if (hedefTuru !== 'Tumu' && !hedefDeger.trim()) {
      setMessage({ text: 'Lütfen bir hedef adı (Departman/Şirket) giriniz.', type: 'error' });
      return;
    }

    let islemAdi = islemTuru === 'vardiya' ? 'vardiyası' : (islemTuru === 'yetki' ? 'kapı yetkileri' : 'sistem giriş durumları');
    const hedefMetni = hedefTuru === 'Tumu' ? `SİSTEMDEKİ TÜM ${targetStatus}` : `"${hedefDeger}" isimli ${hedefTuru === 'Departman' ? 'departmandaki' : 'şirketteki/taşerondaki'} TÜM ${targetStatus}`;
    const uyariMesaji = `DİKKAT: ${hedefMetni} personellerin ${islemAdi} güncellenecektir. Onaylıyor musunuz?`;
    
    const target = { hedef_turu: hedefTuru, hedef_deger: hedefDeger.trim() };
    const operations = {
      vardiya: { path: '/users/bulk/shift', payload: { ...target, vardiya_id: vardiyaId } },
      yetki: { path: '/users/bulk/doors', payload: { ...target, doorIds: [...selectedDoors] } },
      durum: { path: '/users/bulk/status', payload: { ...target, durum: durumHedefi, ...exitData } }
    };
    const detail = islemTuru === 'vardiya'
      ? (vardiyaId ? 'Vardiya: ' + allShifts.find(s => String(s.ID) === String(vardiyaId))?.Vardiya_Adi : 'Mevcut vardiya atamaları kaldırılacak.')
      : islemTuru === 'yetki'
        ? (selectedDoors.length ? 'İzin verilecek kapılar: ' + allDoors.filter(d => selectedDoors.includes(d.ID)).map(d => d.Kapi_Adi).join(', ') : 'Mevcut tüm kapı yetkileri kaldırılacak.')
        : (rehire ? 'Yeni çalışma dönemi bugün başlar. Bugünkü çıkış geri alınırsa aynı dönem yeniden açılır.' : 'Çıkış tarihi: ' + exitData.cikis_tarihi);
    setMessage({ text: '', type: '' });
    setConfirmation({ ...operations[islemTuru], message: uyariMesaji, detail });
  };

  const confirmOperation = async () => {
    if (!confirmation || loading || dataLoading || dataError) return;
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      const response = await api.post(confirmation.path, confirmation.payload);
      setMessage({ text: response.data.message, type: 'success' });
      setConfirmation(null);
      setHedefDeger('');
      setVardiyaId('');
      setSelectedDoors([]);
      setExitData({ cikis_tarihi: businessDate(), cikis_nedeni: '' });
      users.refresh();
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'Toplu işlem başarısız oldu.', type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Toplu İşlemler" description="Bir departmandaki, şirketteki ya da tüm personelin vardiya, kapı yetkisi veya çalışma durumunu tek işlemde değiştirin. Uygulamadan önce özet onayı istenir." />

      <AlertMessage message={message.text} type={message.type} />
      {dataLoading && <p role="status" className="text-sm text-muted">İşlem için gerekli listeler yükleniyor…</p>}
      {dataError && <div role="alert" className="text-sm text-danger">
        {dataError} <button type="button" className="underline font-bold" onClick={() => { users.refresh(); doors.refresh(); shifts.refresh(); }}>Tekrar dene</button>
      </div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <fieldset disabled={loading || Boolean(confirmation)} className="space-y-6">
          <div className="bg-surface-2 p-6 rounded-xl border border-line">
            <h2 className="text-lg font-semibold text-ink mb-4 flex items-center">
              <span className="w-8 h-8 rounded-full bg-info-soft text-info flex items-center justify-center mr-3 text-sm">1</span>
              Hedef Kitleyi Seçin
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="field-label" htmlFor="bulkoperations-field-1">Filtreleme Türü</label>
                <select id="bulkoperations-field-1"
                  className="field"
                  value={hedefTuru} 
                  onChange={(e) => { setHedefTuru(e.target.value); setHedefDeger(''); }}
                >
                  <option value="Tumu">{rehire ? 'Tüm Pasif Personeller' : 'Tüm Aktif Personeller'}</option>
                  <option value="Departman">Departmana Göre</option>
                  <option value="Sirket">Şirket / Taşerona Göre</option>
                </select>
              </div>
              
              {hedefTuru !== 'Tumu' && (
                <div className="relative z-20">
                   <AutocompleteSearch 
                     label={hedefTuru === 'Departman' ? 'Departman Adı' : 'Şirket / Taşeron Adı'}
                     placeholder={`${hedefTuru === 'Departman' ? 'Departman' : 'Şirket'} adını yazın…`}
                     value={hedefDeger}
                     onChange={e => setHedefDeger(e.target.value)}
                     suggestions={suggestions}
                     onSelect={(item) => {
                       setHedefDeger(item.value);
                     }}
                     required={true}
                   />
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-2 p-6 rounded-xl border border-line relative z-10">
            <h2 className="text-lg font-semibold text-ink mb-4 flex items-center">
              <span className="w-8 h-8 rounded-full bg-info-soft text-info flex items-center justify-center mr-3 text-sm">2</span>
              Yapılacak İşlemi Seçin
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              <div>
                <label className="field-label" htmlFor="bulkoperations-field-2">İşlem Türü</label>
                <select id="bulkoperations-field-2" className="field" value={islemTuru} onChange={(e) => setIslemTuru(e.target.value)}>
                  <option value="vardiya">Toplu Vardiya Atama / Değiştirme</option>
                  <option value="yetki">Toplu Kapı Yetkisi Verme</option>
                  <option value="durum">Toplu Durum (İşten Çıkış / İşe Alım)</option>
                </select>
              </div>

              {islemTuru === 'vardiya' && (
                <div className="animate-fade-in-up">
                  <label className="field-label" htmlFor="bulkoperations-field-3">Atanacak Vardiya</label>
                  <select id="bulkoperations-field-3" className="field" value={vardiyaId} onChange={(e) => setVardiyaId(e.target.value)}>
                    <option value="">-- Tüm Vardiyaları İptal Et (Sıfırla) --</option>
                    {allShifts.map(shift => <option key={shift.ID} value={shift.ID}>{shift.Vardiya_Adi}</option>)}
                  </select>
                </div>
              )}

              {islemTuru === 'yetki' && (
                <div className="animate-fade-in-up col-span-1 md:col-span-2 mt-2">
                  <p id="bulk-doors" className="field-label">İzin verilecek kapılar</p>
                  <p className="field-hint mb-2">Hiç kapı seçilmezse hedefteki personelin mevcut tüm kapı yetkileri kaldırılır.</p>
                  <div role="group" aria-labelledby="bulk-doors" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-surface p-4 border border-line rounded-xl max-h-60 overflow-y-auto">
                    {allDoors.map(door => (
                      <label key={door.ID} className="flex items-center p-2 hover:bg-surface-2 cursor-pointer rounded transition-colors border border-transparent hover:border-line">
                        <input type="checkbox" className="w-5 h-5 accent-[var(--color-accent)]" checked={selectedDoors.includes(door.ID)} onChange={() => handleDoorSelection(door.ID)} />
                        <span className="ml-3 text-sm font-bold text-ink">{door.Kapi_Adi}</span>
                      </label>
                    ))}
                    {allDoors.length === 0 && <div className="text-sm text-muted col-span-full">Aktif kapı bulunamadı.</div>}
                  </div>
                </div>
              )}

              {islemTuru === 'durum' && (
                <div className="animate-fade-in-up space-y-4">
                  <div>
                    <label className="field-label" htmlFor="bulkoperations-field-4">Hedef Durum</label>
                    <select id="bulkoperations-field-4" className="field font-bold" value={durumHedefi} onChange={(e) => setDurumHedefi(Number(e.target.value))}>
                      <option value={0}>Toplu İşten Çıkarma / Pasife Alma</option>
                      <option value={1}>Toplu İşe Alım / Aktifleştirme</option>
                    </select>
                  </div>
                  {durumHedefi === 0 && (
                    <div className="grid grid-cols-1 gap-4 bg-danger-soft p-4 rounded-xl border border-danger-line">
                      <div><label className="field-label" htmlFor="bulkoperations-field-5">Toplu Çıkış Tarihi *</label><input id="bulkoperations-field-5" type="date" value={exitData.cikis_tarihi} onChange={(e) => setExitData({...exitData, cikis_tarihi: e.target.value})} required className="field" /></div>
                      <div><label className="field-label" htmlFor="bulkoperations-field-6">Toplu Çıkış Nedeni (Opsiyonel)</label><textarea id="bulkoperations-field-6" rows="2" value={exitData.cikis_nedeni} onChange={(e) => setExitData({...exitData, cikis_nedeni: e.target.value})} placeholder="Örn: Proje Bitişi" className="field resize-none"></textarea></div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-line">
            <button type="submit" disabled={loading || dataLoading || Boolean(dataError)} className={`btn px-6 py-3 ${islemTuru === 'durum' && durumHedefi === 0 ? 'btn-danger' : 'btn-primary'}`}>
              {loading ? 'İşleniyor…' : 'Toplu İşlemi Başlat'}
            </button>
          </div>

          </fieldset>
        </form>
      </div>
      <Modal isOpen={Boolean(confirmation)} onClose={() => { if (!loading) setConfirmation(null); }} title="Toplu İşlemi Onayla">
        <p className="text-sm text-ink mb-3">{confirmation?.message}</p>
        <p className="text-sm font-bold text-ink mb-4">{confirmation?.detail}</p>
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        {(dataLoading || dataError) && <p role="status" className="text-sm mb-3">{dataError || 'Listeler güncelleniyor…'}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={loading} onClick={() => setConfirmation(null)} className="btn btn-secondary">Vazgeç</button>
          <button type="button" disabled={loading || dataLoading || Boolean(dataError)} onClick={confirmOperation} className="btn btn-danger">{loading ? 'İşleniyor…' : 'Onayla ve Uygula'}</button>
        </div>
      </Modal>
    </div>
  );
}

export default BulkOperations;
