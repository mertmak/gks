import { useState } from 'react';
import { useLiveList } from '../hooks/useLiveList';
import { usePendingAction } from '../hooks/usePendingAction';
import ConfirmAction from '../components/ConfirmAction';
import AdminForm from '../components/AdminForm';
import PageHeader from '../components/ui/PageHeader';
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
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Yönetici Hesapları" description="Panele giriş yapan hesaplar. Yönetici değişiklik yapabilir; sınırlı kullanıcı yalnız görüntüler. Bu hesaplar personel kayıtlarından ayrıdır." />

      <section aria-labelledby="account-form-title" className="card">
        <h2 id="account-form-title" className="text-lg font-semibold text-ink mb-4">Yeni Hesap Oluştur</h2>

        <AdminForm onSubmit={handleSubmit} disabled={pending || Boolean(confirmation)} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="field-label" htmlFor="hesapekle-field-1">Kullanıcı Adı</label>
            <input id="hesapekle-field-1" type="text" name="username" maxLength={50} autoComplete="off" value={formData.username} onChange={handleChange} required placeholder="Örn: ahmet_guvenlik" className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="hesapekle-field-2">Şifre</label>
            <input id="hesapekle-field-2" type="password" name="password" minLength={10} maxLength={72} autoComplete="new-password" value={formData.password} onChange={handleChange} required className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="hesapekle-field-3">Yetki Seviyesi</label>
            <select id="hesapekle-field-3" name="rol" value={formData.rol} onChange={handleChange} className="field">
              <option value="user">Sınırlı Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn btn-primary w-full">
              {pending ? 'Kaydediliyor…' : 'Hesabı Kaydet'}
            </button>
          </div>
        </AdminForm>

        {message && (
          <div role={isSuccess ? 'status' : 'alert'} className={`mt-6 p-4 rounded-xl text-sm font-bold text-center border ${isSuccess ? 'bg-success-soft text-success border-success-line' : 'bg-danger-soft text-danger border-danger-line'}`}>
            {message}
          </div>
        )}
      </section>

      <section aria-labelledby="account-list-title" className="card">
        <h2 id="account-list-title" className="text-lg font-semibold text-ink mb-4">Sistemdeki Hesaplar</h2>

        {loading && <p role="status">Hesaplar yükleniyor…</p>}
        {listError && <p role="alert" className="text-danger mb-3">{listError} <button type="button" onClick={hesaplariGetir} className="underline">Tekrar dene</button></p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <th scope="col" className="py-3 px-4 text-sm font-semibold text-muted">ID</th>
                <th scope="col" className="py-3 px-4 text-sm font-semibold text-muted">Kullanıcı Adı</th>
                <th scope="col" className="py-3 px-4 text-sm font-semibold text-muted">Rol</th>
                <th scope="col" className="py-3 px-4 text-sm font-semibold text-muted text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {hesaplar.map((hesap) => (
                <tr key={hesap.ID} className="border-b border-line hover:bg-surface-2 transition-colors">
                  <td className="py-3 px-4 font-semibold text-ink">#{hesap.ID}</td>
                  <td className="py-3 px-4 font-medium text-ink">{hesap.Kullanici_Adi}</td>
                  <td className="py-3 px-4">
                    <span className={`badge ${hesap.Rol === 'admin' ? 'bg-accent-soft text-accent border-accent' : 'bg-info-soft text-info border-info-line'}`}>
                      {hesap.Rol === 'admin' ? 'Yönetici' : 'Sınırlı kullanıcı'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      disabled={pending || Boolean(confirmation)} onClick={() => handleDelete(hesap)}
                      className="btn btn-sm bg-danger-soft text-danger"
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
      </section>

      <ConfirmAction isOpen={Boolean(confirmation)} title="Panel Hesabını Sil" pending={pending} error={!isSuccess ? message : ''} onClose={() => setConfirmation(null)} onConfirm={confirmDelete} confirmLabel="Hesabı Sil">
        <p><strong>{confirmation?.Kullanici_Adi}</strong> hesabı kalıcı olarak silinecek ve panele erişimi sonlandırılacak.</p>
      </ConfirmAction>
    </div>
  );
}

export default HesapEkle;
