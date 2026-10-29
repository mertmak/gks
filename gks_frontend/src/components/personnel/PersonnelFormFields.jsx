import { useId } from 'react';
/**
 * Personel ekleme ve düzenleme formlarında ortak kullanılan alan grubu.
 * formData ve değiştirici fonksiyonlar prop olarak alınır.
 */
function PersonnelFormFields({ formData, onChange, onNumericChange }) {
  const id = useId();
  return (
    <>
      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-1'}>T.C. Kimlik No (11 Hane) *</label>
        <input id={id + '-1'}           type="text" maxLength="11" minLength="11"
          name="tc" value={formData.tc || ''}
          onChange={onNumericChange} required
          placeholder="11 haneli sayı"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none font-mono"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-2'}>Ad Soyad *</label>
        <input id={id + '-2'}           type="text" name="ad_soyad" value={formData.ad_soyad || ''}
          onChange={onChange} required
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-3'}>Kurum Sicil No (5 Hane) *</label>
        <input id={id + '-3'}           type="text" maxLength="5" minLength="5"
          name="sicil" value={formData.sicil || ''}
          onChange={onNumericChange} required
          placeholder="5 haneli sayı"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none font-mono"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-4'}>RFID Kart No (11 Hane)</label>
        <input id={id + '-4'}           type="text" maxLength="11" minLength="11"
          name="rfid" value={formData.rfid || ''}
          onChange={onNumericChange}
          placeholder="11 haneli sayı"
          className="w-full px-3 py-2 border rounded-lg bg-surface-2 focus:ring-2 focus:ring-accent outline-none font-mono"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-5'}>Şirket / Taşeron</label>
        <input id={id + '-5'}           type="text" name="sirket" value={formData.sirket || ''}
          onChange={onChange}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-6'}>Departman</label>
        <input id={id + '-6'}           type="text" name="departman" value={formData.departman || ''}
          onChange={onChange}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-muted mb-1" htmlFor={id + '-7'}>İşe Giriş Tarihi</label>
        <input id={id + '-7'}           type="date" name="ise_giris" value={formData.ise_giris || ''}
          onChange={onChange}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent outline-none"
        />
      </div>
    </>
  );
}

export default PersonnelFormFields;
