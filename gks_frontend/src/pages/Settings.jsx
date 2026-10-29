import { readSession } from '../utils/session';
import { useState } from 'react';
import api from '../api/axios';
import { usePendingAction } from '../hooks/usePendingAction';
import AlertMessage from '../components/AlertMessage';

function Settings() {
  const [formData, setFormData] = useState({
    username: readSession()?.kullanici_adi || '',
    eskiSifre: '',
    yeniSifre: ''
  });
  const { pending, run } = usePendingAction();
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage('');

      try {
        // Backend'deki şifre değiştirme ucuna verileri yolluyoruz
        await api.post('/sifre-degistir', formData);

        // Başarılı olursa formu temizle
        setFormData({ username: readSession()?.kullanici_adi || '', eskiSifre: '', yeniSifre: '' });
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('gks:logout', { detail: { reason: 'password-changed' } }));
      } catch (err) {
        setMessage(err.response?.data?.message || 'Şifre değiştirilirken bir hata oluştu.');
      }
    });
  };

  return (
    <div className="max-w-xl mx-auto bg-surface p-8 rounded-2xl shadow-xl border border-line mt-10">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-6">Hesap Ayarları</h1>

      <form onSubmit={handleSubmit} aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="settings-field-1">Kullanıcı Adı</label>
            <input id="settings-field-1"
              type="text"
              name="username" readOnly autoComplete="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="Kullanıcı adınız"
              className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="settings-field-2">Mevcut Şifre</label>
            <input id="settings-field-2"
              type="password"
              name="eskiSifre" autoComplete="current-password"
              value={formData.eskiSifre}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2" htmlFor="settings-field-3">Yeni Şifre</label>
            <input id="settings-field-3"
              type="password"
              name="yeniSifre" autoComplete="new-password" minLength={10} maxLength={72} aria-describedby="password-help"
              value={formData.yeniSifre}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all shadow-sm"
            />
          </div>
          <p id="password-help" className="text-sm text-muted">Yeni şifre en az 10 karakter olmalıdır. Türkçe karakterler dahil UTF-8 uzunluğu en fazla 72 bayt olabilir. Değişiklikten sonra yeniden giriş yapmanız gerekir.</p>

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg mt-2"
          >
            {pending ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
          </button>
        </fieldset>
      </form>

      <div className="mt-6">
        <AlertMessage message={message} type="error" />
      </div>
    </div>
  );
}

export default Settings;
