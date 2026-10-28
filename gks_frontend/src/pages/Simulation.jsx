import { useState } from 'react';
import { useLiveList } from '../hooks/useLiveList';
import { businessDate } from '../utils/dates';
import Modal from '../components/Modal';
import api from '../api/axios';
import AlertMessage from '../components/AlertMessage';
import { readSession } from '../utils/session';
import { defaultTemplateShift } from '../utils/shifts';

const SHIFT_EVENTS = ['shifts_updated'];

function Simulation() {
  const shiftList = useLiveList('/shifts', SHIFT_EVENTS);
  const shifts = shiftList.rows.filter(s => s.Durum === 1 || s.Durum === true);
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const today = businessDate();
  const tenDaysAgo = new Date(today + 'T00:00:00Z');
  tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);

  const [formData, setFormData] = useState({
    userAction: 'keep',    
    doorAction: 'keep',    
    logAction: 'append',
    kapiSayisi: 5,
    personelSayisi: 20,
    vardiyaId: '',
    startDateStr: tenDaysAgo.toISOString().split('T')[0],
    endDateStr: today,
    
    veriKaynagi: 'otomatik', 
    customIsimler: '',
    customSoyisimler: '',
    customDepartmanlar: '',
    customKapilar: ''
  });


  const selectedShiftId = formData.vardiyaId || defaultTemplateShift(shifts)?.ID || '';

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || shiftList.loading || shiftList.error) return;
    if (!selectedShiftId || !shifts.some(s => String(s.ID) === String(selectedShiftId))) {
      setMessage({ text: 'Lütfen aktif bir vardiya seçin.', type: 'error' }); return;
    }
    const start = new Date(formData.startDateStr + 'T00:00:00Z');
    const end = new Date(formData.endDateStr + 'T00:00:00Z');
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start || (end-start)/86400000 >= 31) {
      setMessage({ text: 'Başlangıç ve bitiş dahil en fazla 31 günlük geçerli bir aralık seçin.', type: 'error' }); return;
    }
    const payload = { ...formData, vardiyaId: selectedShiftId };
    if (payload.veriKaynagi === 'otomatik') {
      payload.customIsimler = ''; payload.customSoyisimler = '';
      payload.customDepartmanlar = ''; payload.customKapilar = '';
    }
    setMessage({ text: '', type: '' });
    setConfirmation({ payload, shiftName: shifts.find(s => String(s.ID) === String(selectedShiftId)).Vardiya_Adi });
  };

  const confirmSimulation = async () => {
    if (!confirmation || loading || shiftList.loading || shiftList.error) return;
    setLoading(true); setMessage({ text: '', type: '' });
    try {
      const response = await api.post('/seeder/run', confirmation.payload);
      setMessage({ text: response.data.message, type: 'success' });
      setConfirmation(null);
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
    } finally {
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-8 mt-8 animate-fade-in-up pb-10">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Gelişmiş Veri Simülatörü</h2>
        <p className="text-slate-500 text-sm mt-1">{readSession()?.sandbox
          ? 'Kişisel simülasyon alanınıza sentetik personel, kapı ve geçiş kayıtları ekleyin (en fazla 50 personel, 10 kapı, 14 gün). Sonuçları Puantaj ve Mesai sayfalarında görebilirsiniz.'
          : 'Ayrı yerel test veritabanına sentetik personel, kapı ve geçiş kayıtları ekleyin. Public demo seed komutundan bağımsızdır.'}</p>
      </div>

      <AlertMessage message={message.text} type={message.type} />
      {shiftList.loading && <p role="status">Vardiyalar yükleniyor...</p>}
      {shiftList.error && <div role="alert">{shiftList.error} <button type="button" onClick={shiftList.refresh} className="underline">Tekrar dene</button></div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        
        <fieldset disabled={loading || Boolean(confirmation)} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center border-b border-slate-100 pb-4">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 text-sm">1</span>
            Veritabanı Müdahale Ayarları
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="simulation-userAction">Personel İşlemi</label>
              <select id="simulation-userAction" name="userAction" value={formData.userAction} onChange={handleChange} className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="keep">Mevcut Personelleri Kullan (Değiştirme)</option>
                <option value="append">Sisteme Yeni Personeller İlave Et (+Ekle)</option>
              </select>
              {formData.userAction !== 'keep' && (
                <div className="mt-4 flex items-center bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 w-full px-2">Kaç kişi üretilecek?</span>
                  <input type="number" aria-label="Üretilecek personel sayısı" name="personelSayisi" value={formData.personelSayisi} onChange={handleChange} min="1" max="100" className="w-24 px-3 py-1 border rounded focus:ring-2 outline-none" />
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="simulation-doorAction">Kapı & Yetki İşlemi</label>
              <select id="simulation-doorAction" name="doorAction" value={formData.doorAction} onChange={handleChange} className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="keep">Mevcut Kapıları Kullan</option>
                <option value="append">Yeni Kapılar İlave Et (+Ekle)</option>
              </select>
              {formData.doorAction !== 'keep' && (
                <div className="mt-4 flex items-center bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 w-full px-2">Kaç kapı üretilecek?</span>
                  <input type="number" aria-label="Üretilecek kapı sayısı" name="kapiSayisi" value={formData.kapiSayisi} onChange={handleChange} min="1" max="50" className="w-24 px-3 py-1 border rounded focus:ring-2 outline-none" />
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-2 font-bold">* Aktif personellere eksik Ana Giriş / Ana Çıkış kapı yetkileri eklenir; mevcut yetkiler korunur.</p>
            </div>

            <div className="md:col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100">
              <label className="block text-sm font-bold text-blue-900 mb-2" htmlFor="simulation-logAction">Geçiş Logları İşlemi</label>
              <select id="simulation-logAction" name="logAction" value={formData.logAction} onChange={handleChange} className="w-full px-4 py-3 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50">
                <option value="append">Seçili Tarihte Eski Loglara İlave Et</option>
              </select>
              <p className="text-[10px] text-blue-700 mt-2 font-bold">* Geç kalma, erken çıkış, fazla mesai ve örnek başarısız okutmalar rastgele üretilir. Tekrar çalıştırmak ek kayıt oluşturur.</p>
            </div>
          </div>
        </div>

        {/* ADIM 2: VERİ KAYNAĞI ÖZELLEŞTİRME */}
        {(formData.userAction !== 'keep' || formData.doorAction !== 'keep') && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in-up">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center border-b border-slate-100 pb-4">
              <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3 text-sm">2</span>
              Veri Havuzu Seçimi
            </h3>
            
            <div className="mb-6 flex space-x-4 border-b border-slate-100 pb-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="veriKaynagi" value="otomatik" checked={formData.veriKaynagi === 'otomatik'} onChange={handleChange} className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-slate-700 text-sm">Genişletilmiş Otomatik Verileri Kullan</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="veriKaynagi" value="ozel" checked={formData.veriKaynagi === 'ozel'} onChange={handleChange} className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-slate-700 text-sm">Kendi Özel Listemi Girmek İstiyorum</span>
              </label>
            </div>

            {formData.veriKaynagi === 'ozel' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
                {formData.userAction !== 'keep' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="simulation-customIsimler">İsim Listesi (Virgülle Ayırın)</label>
                      <textarea id="simulation-customIsimler" name="customIsimler" value={formData.customIsimler} onChange={handleChange} placeholder="Örn: Aslı, Kenan, Berk..." rows="2" className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="simulation-customSoyisimler">Soyisim Listesi (Virgülle Ayırın)</label>
                      <textarea id="simulation-customSoyisimler" name="customSoyisimler" value={formData.customSoyisimler} onChange={handleChange} placeholder="Örn: Güler, Koç, Şen..." rows="2" className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"></textarea>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="simulation-customDepartmanlar">Departman Listesi (Virgülle Ayırın)</label>
                      <input id="simulation-customDepartmanlar" type="text" name="customDepartmanlar" value={formData.customDepartmanlar} onChange={handleChange} placeholder="Örn: Ar-Ge, Pazarlama, Yönetim..." className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                    </div>
                  </>
                )}
                
                {formData.doorAction !== 'keep' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="simulation-customKapilar">Kapılar ve Türleri (Virgülle Ayırın)</label>
                    <textarea id="simulation-customKapilar" name="customKapilar" value={formData.customKapilar} onChange={handleChange} placeholder="Örn: Zemin Giriş - Ana Giriş, Arge Odası - İç Geçiş, Yemekhane - Yemekhane Giriş..." rows="2" className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"></textarea>
                    <p className="text-[10px] text-slate-400 mt-1">Özel tür belirtmek için "Kapı Adı - Kapı Türü" formatını kullanabilirsiniz. Tür belirtilmezse otomatik "İç Geçiş" sayılır.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ZAMAN VE VARDİYA AYARLARI */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center border-b border-slate-100 pb-4">
            <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mr-3 text-sm">{(formData.userAction !== 'keep' || formData.doorAction !== 'keep') ? '3' : '2'}</span>
            Zaman ve Vardiya Ayarları
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="simulation-vardiyaId">Geçiş Saatleri İçin Vardiya Şablonu</label>
              <select id="simulation-vardiyaId" name="vardiyaId" value={selectedShiftId} onChange={handleChange} className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-bold text-slate-700">
                {!shifts.length && <option value="">Aktif vardiya bulunamadı</option>}
                {shifts.map(s => <option key={s.ID} value={s.ID}>{s.Vardiya_Adi} (ID: {s.ID})</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-2">Geçişler seçili şablona göre üretilir. Yalnız hiç vardiya geçmişi olmayan personele atama yapılır; mevcut atamalar değiştirilmez ve farklı saatler kullanabilir.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="simulation-startDateStr">Başlangıç Tarihi</label>
              <input id="simulation-startDateStr" type="date" name="startDateStr" value={formData.startDateStr} onChange={handleChange} required className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="simulation-endDateStr">Bitiş Tarihi</label>
              <input id="simulation-endDateStr" type="date" name="endDateStr" value={formData.endDateStr} onChange={handleChange} required className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
            </div>
          </div>
        </div>

        {/* BAŞLAT BUTONU */}
        <div className="flex justify-end mt-4">
          <button type="submit" disabled={loading || shiftList.loading || Boolean(shiftList.error) || shifts.length === 0} className="px-10 py-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-lg rounded-xl transition-all shadow-xl disabled:opacity-50 flex items-center">
            {loading ? 'Simülasyon İşleniyor...' : 'Gelişmiş Simülasyonu Başlat'}
          </button>
        </div>

        </fieldset>
      </form>
      <Modal isOpen={Boolean(confirmation)} onClose={() => { if (!loading) setConfirmation(null); }} title="Simülasyonu Onayla">
        <p className="text-sm mb-3">{confirmation?.payload.startDateStr}–{confirmation?.payload.endDateStr} tarihleri için {confirmation?.shiftName} saatleriyle sentetik geçişler eklenecek.</p>
        <p className="text-sm mb-4">Yeni personel: {confirmation?.payload.userAction === 'append' ? confirmation.payload.personelSayisi : 0}. Yeni kapı: {confirmation?.payload.doorAction === 'append' ? confirmation.payload.kapiSayisi : 0}. Mevcut kayıtlar silinmez.</p>
        <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
        <div className="flex justify-end gap-3">
          <button type="button" disabled={loading} onClick={() => setConfirmation(null)} className="px-4 py-2 bg-slate-200 rounded-lg">Vazgeç</button>
          <button type="button" disabled={loading || shiftList.loading || Boolean(shiftList.error)} onClick={confirmSimulation} className="px-4 py-2 bg-slate-900 text-white rounded-lg disabled:opacity-50">{loading ? 'İşleniyor...' : 'Onayla ve Üret'}</button>
        </div>
      </Modal>
    </div>
  );
}

export default Simulation;
