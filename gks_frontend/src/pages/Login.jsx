import { useState } from 'react';
import api from '../api/axios';
import { usePendingAction } from '../hooks/usePendingAction';

function Login({ setAuth, demo, sandbox = null, notice = null }) {
  const { pending, run } = usePendingAction();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState(notice?.tone === 'success' ? notice.text : '');
  const [warningMsg, setWarningMsg] = useState(notice?.tone === 'warning' ? notice.text : '');

  // YENİ: Sistemin ilk kez kurulup kurulmadığını kontrol eden state
  const [isSetupMode, setIsSetupMode] = useState(false);

  const handleAction = async (e) => {
    e.preventDefault();
    await run(async () => {
      setError('');
      setSuccessMsg('');
      setWarningMsg('');

      try {
        if (isSetupMode) {
          // İLK KURULUM (ADMIN OLUŞTURMA) İŞLEMİ
          const response = await api.post('/ilk-kurulum', { username, password });
          if (response.data.success) {
            setSuccessMsg('Sistem başarıyla kuruldu! Şimdi giriş yapabilirsiniz.');
            setIsSetupMode(false); // Kurulum bitince normal giriş moduna dön
            setUsername('');
            setPassword('');
          }
        } else {
          // NORMAL GİRİŞ İŞLEMİ
          const response = await api.post('/login', { username, password });
          if (response.data.success) {
            localStorage.setItem('token', response.data.token);
            setAuth(true);
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Bir hata oluştu!');
      }
    });
  };

  const enterDemo = () => run(async () => {
    setError('');
    setWarningMsg('');
    try {
      const {data} = await api.post('/demo-login');
      localStorage.setItem('token', data.token);setAuth(true);
    } catch (error) {setError(error.response?.data?.message || 'Demo şu anda açılamıyor.');}
  });
  const enterSandbox = () => run(async () => {
    setError('');
    setWarningMsg('');
    try {
      const {data} = await api.post('/sandbox');
      localStorage.setItem('token', data.token);setAuth(true);
    } catch (error) {setError(error.response?.data?.message || 'Simülasyon alanı şu anda açılamıyor.');}
  });
  if (demo) return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="max-w-lg bg-white p-8 rounded-2xl shadow-lg space-y-5">
        <h1 className="text-3xl font-black text-slate-800">GKS Demo</h1>
        <p>Personel, vardiya ve puantaj uygulamasını sentetik verilerle inceleyin. Demo salt okunurdur; fiziksel cihaz bağlantısı içermez.</p>
        <button disabled={pending} onClick={enterDemo} className="w-full rounded-xl bg-slate-900 text-white p-3 font-bold">{pending ? 'Demo açılıyor…' : 'Demoyu İncele'}</button>
        {sandbox && <div className="border-t border-slate-200 pt-5 space-y-3">
          <p className="text-sm text-slate-600">Kendi kopyanızda personel, kapı, vardiya ve izin ekleyin, veri üretin; puantajı sonuçlarla görün. Kopya yalnız size açıktır ve {sandbox} dakika sonra silinir.</p>
          <button disabled={pending} onClick={enterSandbox} className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 p-3 font-bold">{pending ? 'Hazırlanıyor…' : 'Kendi Simülasyon Alanını Başlat'}</button>
        </div>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {warningMsg && <p role="status" className="text-amber-800 text-sm font-bold text-center bg-amber-50 py-3 rounded-xl border border-amber-200">{warningMsg}</p>}
      </section>
    </main>
  );
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 transition-all duration-300">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            GKS <span className={isSetupMode ? "text-orange-500" : "text-cyan-500"}>
              {isSetupMode ? "KURULUM" : "GİRİŞ"}
            </span>
          </h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">
            {isSetupMode
              ? "Sistemi başlatmak için ilk yönetici hesabını oluşturun."
              : "Yönetim paneline erişmek için yetkilendirme gerekiyor."}
          </p>
        </div>

        <form onSubmit={handleAction} aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {isSetupMode ? "Yeni Yönetici Kullanıcı Adı" : "Kullanıcı Adı"}
              </label>
              <input
                type="text" aria-label="Kullanıcı Adı" autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder={isSetupMode ? "Örn: admin" : ""}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {isSetupMode ? "Yeni Yönetici Şifresi" : "Şifre"}
              </label>
              <input
                type="password" aria-label="Şifre" autoComplete={isSetupMode ? "new-password" : "current-password"} minLength={isSetupMode ? 10 : undefined} maxLength={isSetupMode ? 72 : 200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
              />
            </div>

            {/* Mesaj Alanları */}
            {error && <p role="alert" className="text-red-600 text-sm font-bold text-center bg-red-50 py-3 rounded-xl border border-red-100">{error}</p>}
            {warningMsg && <p role="status" className="text-amber-800 text-sm font-bold text-center bg-amber-50 py-3 rounded-xl border border-amber-200">{warningMsg}</p>}
            {successMsg && <p role="status" className="text-green-600 text-sm font-bold text-center bg-green-50 py-3 rounded-xl border border-green-100">{successMsg}</p>}

            <button
              type="submit"
              className={`w-full text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg mt-4 ${
                isSetupMode ? 'bg-orange-600 hover:bg-orange-700' : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {pending ? 'İşleniyor…' : isSetupMode ? 'Sistemi Başlat ve Kaydet' : 'Sisteme Giriş Yap'}
            </button>
          </fieldset>
        </form>

        {/* Mod Değiştirme Butonu */}
        {import.meta.env.VITE_ENABLE_SETUP === 'true' && <div className="mt-8 text-center border-t border-slate-100 pt-6">
          <button
            type="button" disabled={pending}
            onClick={() => {
              setIsSetupMode(!isSetupMode);
              setError('');
              setSuccessMsg('');
            }}
            className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors"
          >
            {isSetupMode ? "← Normal Giriş Ekranına Dön" : "Sistem yeni mi kuruldu? İlk kurulumu yap."}
          </button>
        </div>}

      </div>
    </div>
  );
}

export default Login;
