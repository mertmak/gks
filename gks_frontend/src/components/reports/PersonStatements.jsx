import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const hours = dk => Math.round(dk / 6) / 10;
const day = v => v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : '';
const time = v => v ? v.slice(11, 16) : '';
const nextDay = (row, v) => v && v.slice(0, 10) !== row.TarihStr ? ' (+1)' : '';
const WEEKDAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const TOTALS = [
  ['Çalışılan gün', r => r.Calisilan_Gun], ['Devamsız', r => r.Devamsiz_Gun], ['İzinli', r => r.Izinli_Gun],
  ['Hafta tatili', r => r.Hafta_Tatili], ['Resmi tatil', r => r.Resmi_Tatil], ['Geç kalma', r => `${r.Gec_Kalma_Sayisi} kez · ${r.Gec_Kalma_Dk} dk`],
  ['Erken çıkış', r => `${r.Erken_Cikma_Dk} dk`], ['Çalışma', r => `${hours(r.Calisma_Dk)} saat`], ['Onaylı fazla mesai', r => `${hours(r.Fazla_Mesai_Dk)} saat`],
];

// One printed page per person: daily rows, period totals and signature boxes.
// Rendered into <body> so the print stylesheet can hide the rest of the app while it prints.
export default function PersonStatements({ result, userIds, onDone }) {
  useEffect(() => {
    document.body.classList.add('printing-statements');
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    // Let React paint the pages before the print dialog snapshots them.
    const timer = setTimeout(() => window.print(), 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-statements');
    };
  }, [onDone]);

  const people = result.ozet.filter(p => userIds.includes(p.User_ID));
  return createPortal(
    <div className="statements">
      {people.map(person => {
        const rows = result.gunler.filter(r => r.User_ID === person.User_ID);
        return <section key={person.User_ID} className="statement">
          <header className="statement-head">
            <h1>Aylık Puantaj Dökümü</h1>
            <p>{day(result.baslangic)} – {day(result.bitis)}</p>
            <dl>
              <dt>Ad Soyad</dt><dd>{person.Ad_Soyad}</dd>
              <dt>Sicil No</dt><dd>{person.Sicil_No}</dd>
              <dt>Departman</dt><dd>{person.Departman || '—'}</dd>
            </dl>
          </header>
          <table>
            <thead><tr><th>Tarih</th><th>Gün</th><th>Vardiya</th><th>Giriş</th><th>Çıkış</th><th>Durum</th><th>Geç (dk)</th><th>Erken (dk)</th><th>F. Mesai (dk)</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.TarihStr}>
              <td>{day(r.TarihStr)}</td><td>{WEEKDAY[new Date(`${r.TarihStr}T00:00:00Z`).getUTCDay()]}</td><td>{r.Vardiya_Adi || '—'}</td>
              <td>{time(r.Ilk_Giris)}</td><td>{time(r.Son_Cikis)}{nextDay(r, r.Son_Cikis)}</td><td>{r.Durum}</td>
              <td>{r.Gec_Kalma_Dk || ''}</td><td>{r.Erken_Cikma_Dk || ''}</td><td>{r.Fazla_Mesai_Dk || ''}</td>
            </tr>)}</tbody>
          </table>
          <dl className="statement-totals">{TOTALS.map(([label, get]) => <div key={label}><dt>{label}</dt><dd>{get(person)}</dd></div>)}</dl>
          <div className="statement-signatures">
            <div>Personel<br />Ad Soyad / İmza</div>
            <div>Birim Yöneticisi<br />Ad Soyad / İmza</div>
            <div>İnsan Kaynakları<br />Ad Soyad / İmza</div>
          </div>
        </section>;
      })}
    </div>,
    document.body,
  );
}
