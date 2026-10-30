import { readSession } from '../utils/session';
import { useState } from 'react';
import api from '../api/axios';
import { usePendingAction } from '../hooks/usePendingAction';
import AlertMessage from '../components/AlertMessage';
import PageHeader from '../components/ui/PageHeader';

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
    <div className="max-w-xl space-y-6">
      <PageHeader title="Hesap Ayarları" description="Panel şifrenizi değiştirin. Değişiklikten sonra tüm oturumlarınız kapanır." />
      <section aria-label="Şifre değiştir" className="card">

      <form onSubmit={handleSubmit} aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-5">
          <div>
            <label className="field-label" htmlFor="settings-field-1">Kullanıcı Adı</label>
            <input id="settings-field-1"
              type="text"
              name="username" readOnly autoComplete="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="Kullanıcı adınız"
              className="field"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="settings-field-2">Mevcut Şifre</label>
            <input id="settings-field-2"
              type="password"
              name="eskiSifre" autoComplete="current-password"
              value={formData.eskiSifre}
              onChange={handleChange}
              required
              className="field"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="settings-field-3">Yeni Şifre</label>
            <input id="settings-field-3"
              type="password"
              name="yeniSifre" autoComplete="new-password" minLength={10} maxLength={72} aria-describedby="password-help"
              value={formData.yeniSifre}
              onChange={handleChange}
              required
              className="field"
            />
          </div>
          <p id="password-help" className="field-hint">Yeni şifre en az 10 karakter olmalıdır. Türkçe karakterler dahil UTF-8 uzunluğu en fazla 72 bayt olabilir. Değişiklikten sonra yeniden giriş yapmanız gerekir.</p>

          <button
            type="submit"
            className="btn btn-primary w-full"
          >
            {pending ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
          </button>
        </fieldset>
      </form>

      <div className="mt-6">
        <AlertMessage message={message} type="error" />
      </div>
      </section>
    </div>
  );
}

export default Settings;
