import { useState } from 'react';
import { useLiveList } from '../hooks/useLiveList';
import { usePendingAction } from '../hooks/usePendingAction';
import ConfirmAction from '../components/ConfirmAction';
import AdminForm from '../components/AdminForm';
import api from '../api/axios';

const UPDATE_EVENTS = ['new_system_log'];

function HesapEkle() {
  const [formData, setFormData] = useState({ username: '', password: '', rol: 'user' });
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const { rows: hesaplar, loading, error: listError, refresh: hesaplariGetir } = useLiveList('/hesaplar', UPDATE_EVENTS);
  const { pending, run } = usePendingAction();
  const [confirmation, setConfirmation] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmation) return;
    await run(async () => {
      setMessage('');
      try {
        const response = await api.post('/hesap-ekle', formData);
        setIsSuccess(true);
        setMessage(response.data.message);
        setFormData({ username: '', password: '', rol: 'user' });
        hesaplariGetir(); // Yeni hesap eklendiğinde tabloyu hemen güncelle
      } catch (err) {
        setIsSuccess(false);
        setMessage(err.response?.data?.message || 'Hesap oluşturulurken bir hata oluştu.');
      }
    });
  };

  const handleDelete = (account) => {
    if (pending || confirmation) return;
    setMessage('');
    setConfirmation(account);
  };

  const confirmDelete = async () => {
    if (!confirmation) return;
    await run(async () => {
      setMessage('');
      try {
        const response = await api.delete(`/hesap-sil/${confirmation.ID}`);
        setMessage(response.data.message);
        setIsSuccess(true);
        setConfirmation(null);
        hesaplariGetir();
      } catch (err) {
        setIsSuccess(false);
        setMessage(err.response?.data?.message || 'Silme işlemi başarısız.');
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-10">

      {/* 1. KISIM: YENİ HESAP EKLEME FORMU */}
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-6">Yeni Hesap Oluştur</h2>

        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="hesapekle-field-1">Kullanıcı Adı</label>
            <input id="hesapekle-field-1" type="text" name="username" maxLength={50} autoComplete="off" value={formData.username} onChange={handleChange} required placeholder="Örn: ahmet_guvenlik" className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="hesapekle-field-2">Şifre</label>
            <input id="hesapekle-field-2" type="password" name="password" minLength={10} maxLength={72} autoComplete="new-password" value={formData.password} onChange={handleChange} required className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="hesapekle-field-3">Yetki Seviyesi</label>
            <select id="hesapekle-field-3" name="rol" value={formData.rol} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-sm bg-white">
              <option value="user">Sınırlı Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md">
              {pending ? 'Kaydediliyor…' : 'Hesabı Kaydet'}
            </button>
          </div>
        </AdminForm>

        {message && (
          <div role={isSuccess ? 'status' : 'alert'} className={`mt-6 p-4 rounded-xl text-sm font-bold text-center border ${isSuccess ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message}
          </div>
        )}
      </div>

      {/* 2. KISIM: KAYITLI HESAPLAR TABLOSU */}
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-6">Sistemdeki Hesaplar</h2>

        {loading && <p role="status">Hesaplar yükleniyor…</p>}
        {listError && <p role="alert" className="text-red-700 mb-3">{listError} <button type="button" onClick={hesaplariGetir} className="underline">Tekrar dene</button></p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-6 text-sm font-bold text-slate-600">ID</th>
                <th className="py-4 px-6 text-sm font-bold text-slate-600">Kullanıcı Adı</th>
                <th className="py-4 px-6 text-sm font-bold text-slate-600">Rol</th>
                <th className="py-4 px-6 text-sm font-bold text-slate-600 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {hesaplar.map((hesap) => (
                <tr key={hesap.ID} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-800">#{hesap.ID}</td>
                  <td className="py-4 px-6 font-medium text-slate-700">{hesap.Kullanici_Adi}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${hesap.Rol === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {hesap.Rol === 'admin' ? 'YÖNETİCİ' : 'KULLANICI'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      disabled={pending || Boolean(confirmation)} onClick={() => handleDelete(hesap)}
                      className="text-red-500 hover:text-red-700 font-bold text-sm bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !listError && hesaplar.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-slate-500">Sistemde henüz hesap bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmAction isOpen={Boolean(confirmation)} title="Panel Hesabını Sil" pending={pending} error={!isSuccess ? message : ''} onClose={() => setConfirmation(null)} onConfirm={confirmDelete} confirmLabel="Hesabı Sil">
        <p><strong>{confirmation?.Kullanici_Adi}</strong> hesabı kalıcı olarak silinecek ve panele erişimi sonlandırılacak.</p>
      </ConfirmAction>
    </div>
  );
}

export default HesapEkle;
