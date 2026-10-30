import { useId } from 'react';

// Shared by the add/edit forms on Personel Listesi and Personel Düzenleme.
function PersonnelFormFields({ formData, onChange, onNumericChange }) {
  const id = useId();
  const digits = (n, name, label, required, hint) => (
    <div>
      <label className="field-label" htmlFor={id + name}>{label}{required && ' *'}</label>
      <input id={id + name} type="text" inputMode="numeric" pattern={`[0-9]{${n}}`} maxLength={n} minLength={n}
        name={name} value={formData[name] || ''} onChange={onNumericChange} required={required}
        aria-describedby={id + name + '-hint'} className="field font-mono" />
      <p id={id + name + '-hint'} className="field-hint">{hint}</p>
    </div>
  );
  const text = (name, label, required) => (
    <div>
      <label className="field-label" htmlFor={id + name}>{label}{required && ' *'}</label>
      <input id={id + name} type="text" name={name} maxLength={100} value={formData[name] || ''} onChange={onChange} required={required} className="field" />
    </div>
  );
  return (
    <>
      {digits(11, 'tc', 'T.C. Kimlik No', true, '11 rakam. Yalnız uzunluk denetlenir (veriler sentetiktir).')}
      {text('ad_soyad', 'Ad Soyad', true)}
      {digits(5, 'sicil', 'Kurum Sicil No', true, '5 rakam.')}
      {digits(11, 'rfid', 'RFID Kart No', false, '11 rakam. Boş bırakılırsa kart atanmamış sayılır.')}
      {text('sirket', 'Şirket / Taşeron')}
      {text('departman', 'Departman')}
      {text('gorev', 'Görev')}
      <div>
        <label className="field-label" htmlFor={id + 'ise_giris'}>İşe Giriş Tarihi</label>
        <input id={id + 'ise_giris'} type="date" name="ise_giris" value={formData.ise_giris || ''} onChange={onChange} className="field" />
      </div>
    </>
  );
}

export default PersonnelFormFields;
