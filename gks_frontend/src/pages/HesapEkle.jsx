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
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-ink">Yönetici Hesapları</h1>

      {/* 1. KISIM: YENİ HESAP EKLEME FORMU */}
      <div className="bg-surface p-8 rounded-2xl shadow-xl border border-line">
        <h2 className="text-2xl font-bold text-ink tracking-tight mb-6">Yeni Hesap Oluştur</h2>

        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="hesapekle-field-1">Kullanıcı Adı</label>
            <input id="hesapekle-field-1" type="text" name="username" maxLength={50} autoComplete="off" value={formData.username} onChange={handleChange} required placeholder="Örn: ahmet_guvenlik" className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent outline-none transition-all shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="hesapekle-field-2">Şifre</label>
            <input id="hesapekle-field-2" type="password" name="password" minLength={10} maxLength={72} autoComplete="new-password" value={formData.password} onChange={handleChange} required className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent outline-none transition-all shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="hesapekle-field-3">Yetki Seviyesi</label>
            <select id="hesapekle-field-3" name="rol" value={formData.rol} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent outline-none transition-all shadow-sm bg-surface">
              <option value="user">Sınırlı Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md">
              {pending ? 'Kaydediliyor…' : 'Hesabı Kaydet'}
            </button>
          </div>
        </AdminForm>

        {message && (
          <div role={isSuccess ? 'status' : 'alert'} className={`mt-6 p-4 rounded-xl text-sm font-bold text-center border ${isSuccess ? 'bg-success-soft text-success border-success-line' : 'bg-danger-soft text-danger border-danger-line'}`}>
            {message}
          </div>
        )}
      </div>

      {/* 2. KISIM: KAYITLI HESAPLAR TABLOSU */}
      <div className="bg-surface p-8 rounded-2xl shadow-xl border border-line">
        <h2 className="text-2xl font-bold text-ink tracking-tight mb-6">Sistemdeki Hesaplar</h2>

        {loading && <p role="status">Hesaplar yükleniyor…</p>}
        {listError && <p role="alert" className="text-danger mb-3">{listError} <button type="button" onClick={hesaplariGetir} className="underline">Tekrar dene</button></p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <th className="py-4 px-6 text-sm font-bold text-muted">ID</th>
                <th className="py-4 px-6 text-sm font-bold text-muted">Kullanıcı Adı</th>
                <th className="py-4 px-6 text-sm font-bold text-muted">Rol</th>
                <th className="py-4 px-6 text-sm font-bold text-muted text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {hesaplar.map((hesap) => (
                <tr key={hesap.ID} className="border-b border-line hover:bg-surface-2 transition-colors">
                  <td className="py-4 px-6 font-semibold text-ink">#{hesap.ID}</td>
                  <td className="py-4 px-6 font-medium text-ink">{hesap.Kullanici_Adi}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${hesap.Rol === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-info-soft text-info'}`}>
                      {hesap.Rol === 'admin' ? 'YÖNETİCİ' : 'KULLANICI'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      disabled={pending || Boolean(confirmation)} onClick={() => handleDelete(hesap)}
                      className="text-danger hover:text-danger font-bold text-sm bg-danger-soft hover:bg-danger-soft px-3 py-2 rounded-lg transition-colors"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !listError && hesaplar.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-muted">Sistemde henüz hesap bulunmuyor.</td>
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
