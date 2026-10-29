import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import PlanCanvas from './PlanCanvas';
import { businessDate, shiftDateDays } from '../../utils/dates';
import { demoSettings } from '../../utils/demo';
import { areaName } from '../../utils/floorPlan';
import { OUTSIDE, SPEEDS, clockLabel, createSimulation, finished, inside, manualPass, settleReads, step, takeReads, unknownCard } from '../../utils/simEngine';

const MINUTE = 60000;
const SEND_EVERY = 600; // ms; the server allows 120 read requests a minute
// Numbered names ("Demo Personel 07") show their number, others their initials.
const initials = name => name.match(/(\d{1,2})\s*$/)?.[1] || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');
// The demo's data ends on its reference day; simulate the next one.
const defaultDay = () => demoSettings().demo ? shiftDateDays(demoSettings().referenceDate, 1) : businessDate();

export default function PlanRunner({ plan, onUnsentChange }) {
  const [form, setForm] = useState(() => ({ tarih: defaultDay(), gec: 10, devamsiz: 5, hatali: 5 }));
  // The engine mutates the simulation object; `frame` triggers the redraw.
  const [current, setCurrent] = useState(null);
  const [, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  // A failed send stops sending until the user retries.
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState('');
  const [person, setPerson] = useState(null);
  const [door, setDoor] = useState(null);
  const sending = useRef(false);
  const redraw = useCallback(() => setFrame(value => value + 1), []);

  const start = async event => {
    event.preventDefault();
    setPreparing(true); setError(''); setHint('');
    try {
      const { data } = await api.get('/simulasyon/plan', { params: { tarih: form.tarih, gec: form.gec, devamsiz: form.devamsiz } });
      setCurrent(createSimulation(plan, data, { misread: form.hatali / 100 }));
      setPerson(null); setDoor(null); setFailed(false);
      setRunning(true); redraw();
    } catch (err) { setError(err.response?.data?.message || 'Simülasyon planı alınamadı.'); }
    finally { setPreparing(false); }
  };

  // Animation: the clock advances by real time × speed, redrawn ~15 times a second.
  useEffect(() => {
    if (!running || !current) return;
    let last = performance.now(), drawn = 0, frame;
    const loop = now => {
      step(current, Math.min(1000, now - last) / 1000 * speed * MINUTE);
      last = now;
      if (now - drawn > 66) { drawn = now; redraw(); }
      if (finished(current)) { setRunning(false); redraw(); return; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, current, redraw]);

  // Queued reads go to the server in batches; a failure pauses the run and
  // keeps the batch until the user retries.
  useEffect(() => {
    if (!current || failed) return;
    const timer = setInterval(async () => {
      if (!current.outbox.length || sending.current) return;
      sending.current = true;
      const { batch, body } = takeReads(current);
      try {
        const { data } = await api.post('/simulasyon/okutma', body);
        settleReads(current, batch, data.sonuclar);
        setError('');
      } catch (err) {
        current.outbox.unshift(...batch);
        setRunning(false); setFailed(true);
        setError((err.response?.data?.message || 'Okutmalar sunucuya gönderilemedi.') + ' Simülasyon duraklatıldı; "Yeniden dene" ile tekrar gönderilir. Yeni gün başlatırsanız gönderilmeyen okutmalar atılır.');
      } finally { sending.current = false; redraw(); }
    }, SEND_EVERY);
    return () => clearInterval(timer);
  }, [current, failed, redraw]);

  const selectedPerson = current?.people.find(item => item.id === person);
  const selectedDoor = plan.doors.find(item => item.id === door);
  const done = current && finished(current);
  const pending = current?.outbox.length || 0;
  // Unsent reads would be lost by a new day or by leaving the run tab.
  const unsent = pending > 0 && !failed;
  useEffect(() => { onUnsentChange?.(unsent); }, [unsent, onUnsentChange]);
  const mismatches = current?.feed.filter(entry => entry.server !== undefined && entry.server !== entry.ok).length || 0;
  const input = 'w-full border border-line-strong rounded-lg px-3 py-2 text-sm';
  const button = 'px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50';

  const overlay = current && <g>
    {current.flashes.map((flash, i) => {
      const target = plan.doors.find(item => item.id === flash.doorId);
      return target && <circle key={i} cx={target.x} cy={target.y} r="20" fill="none" stroke={flash.ok ? '#16a34a' : '#dc2626'} strokeWidth="5" opacity="0.8" pointerEvents="none" />;
    })}
    {current.people.filter(item => item.node !== OUTSIDE || item.legs.length).map(item => (
      <g key={item.id} transform={`translate(${item.x} ${item.y})`} className="cursor-pointer"
        onPointerDown={event => { event.stopPropagation(); setPerson(item.id); }}>
        <title>{item.name}</title>
        <circle r="10" fill={item.id === person ? '#0891b2' : item.legs.length ? '#2563eb' : '#334155'} stroke="#fff" strokeWidth="2" />
        <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="700" fill="#fff" pointerEvents="none">{initials(item.name)}</text>
      </g>
    ))}
  </g>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
        {current && <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
          <span className="text-2xl font-black tabular-nums text-ink" aria-live="off">{clockLabel(current.clock)}</span>
          <span className="text-xs text-muted mr-auto">{new Date(current.clock).toISOString().slice(0, 10)}</span>
          <button type="button" disabled={done && !failed} onClick={() => { setFailed(false); setRunning(value => !value); }} className={`${button} bg-primary text-white`}>{failed ? 'Yeniden dene' : running ? 'Duraklat' : 'Devam'}</button>
          <div role="group" aria-label="Hız" className="flex rounded-lg border border-line-strong overflow-hidden">
            {SPEEDS.map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}
              className={`px-3 py-2 text-sm font-bold ${speed === value ? 'bg-cyan-700 text-white' : 'bg-surface text-ink'}`}>{value}×</button>)}
          </div>
          <button type="button" disabled={done} onClick={() => { step(current, 30 * MINUTE); redraw(); }} className={`${button} bg-surface-3 text-ink`}>+30 dk</button>
        </div>}
        <div className="overflow-auto max-h-[70vh]">
          <PlanCanvas areas={plan.areas} doors={plan.doors} selected={door ? { kind: 'door', key: door } : null} editable={false} placing={null}
            onSelect={value => setDoor(value?.kind === 'door' ? value.key : null)} onAreaChange={() => {}} onDoorMove={() => {}} onPlace={() => {}} onInvalidPlace={() => {}}>
            {overlay}
          </PlanCanvas>
        </div>
        <p className="px-4 py-2 border-t border-line text-xs text-muted">1× = saniyede 1 dakika. Kişiye tıklayıp ardından bir kapı seçerek elle geçiş deneyebilirsiniz. Yeşil halka onaylanan, kırmızı reddedilen okutmadır.</p>
      </div>

      <aside className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-danger-soft border border-danger-line text-danger text-sm font-bold p-3">{error}</p>}
        <form onSubmit={start} className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-3" aria-label="Simülasyon ayarları">
          <h2 className="font-bold text-ink">{current ? 'Yeni gün' : 'Gün ayarları'}</h2>
          <label className="block text-sm font-bold text-muted">Tarih
            <input type="date" required className={input} value={form.tarih} onChange={event => setForm({ ...form, tarih: event.target.value })} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[['gec', 'Geç kalma'], ['devamsiz', 'Devamsızlık'], ['hatali', 'Hatalı okutma']].map(([key, label]) => (
              <label key={key} className="block text-xs font-bold text-muted">{label} %
                <input type="number" min="0" max="50" required className={input} value={form[key]} onChange={event => setForm({ ...form, [key]: Math.min(50, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
            ))}
          </div>
          <button type="submit" disabled={preparing || !plan.areas.length || unsent} className={`${button} w-full bg-blue-600 text-white`}>{preparing ? 'Plan hazırlanıyor…' : current ? 'Bu günü başlat' : 'Simülasyonu başlat'}</button>
          {unsent && <p className="text-xs text-warning">Bekleyen okutmalar gönderilince yeni gün başlatılabilir.</p>}
          <p className="text-xs text-muted">Okutmalar seçilen güne gerçek geçiş kaydı olarak yazılır ve puantaja yansır. Aynı günü tekrar çalıştırmak kayıtları çoğaltır.</p>
        </form>

        {current && <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-2 text-sm" aria-label="Simülasyon durumu">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-muted">İçeride</dt><dd className="text-xl font-black text-ink">{inside(current)}</dd></div>
            <div><dt className="text-xs text-muted">Onaylanan</dt><dd className="text-xl font-black text-success">{current.counts.ok}</dd></div>
            <div><dt className="text-xs text-muted">Reddedilen</dt><dd className="text-xl font-black text-danger">{current.counts.denied}</dd></div>
          </dl>
          <p className="text-xs text-muted">{current.people.length} kişi planlı{current.absent.length ? ` · gelmeyen: ${current.absent.map(item => `${item.name} (${item.reason})`).join(', ')}` : ''}</p>
          {pending > 0 && <p className="text-xs text-warning font-bold">Gönderilmeyi bekleyen okutma: {pending}</p>}
          {mismatches > 0 && <p className="text-xs text-danger font-bold">{mismatches} okutmada sunucu kararı tahminden farklı (veri bu sırada değişmiş olabilir).</p>}
          {done && !pending && <div className="rounded-xl bg-success-soft border border-success-line p-3 space-y-1">
            <p className="font-bold text-success">Gün tamamlandı.</p>
            <p className="flex flex-wrap gap-x-3"><Link className="text-info underline" to={`/puantaj?tarih=${new Date(current.day).toISOString().slice(0, 10)}`}>Bu günün puantajı</Link>
              <Link className="text-info underline" to="/mesailer">Mesai onayları</Link><Link className="text-info underline" to="/gecis-hareketleri">Geçiş hareketleri</Link></p>
          </div>}
        </section>}

        {current && (selectedPerson || selectedDoor) && <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-2 text-sm" aria-label="Elle işlem">
          <h2 className="font-bold text-ink">Elle işlem</h2>
          {selectedPerson && <p>Kişi: <strong>{selectedPerson.name}</strong> · {selectedPerson.node === OUTSIDE ? 'Bina dışında' : areaName(plan.areas, selectedPerson.node)}</p>}
          {selectedDoor && <p>Kapı: <strong>{selectedDoor.name}</strong> ({selectedDoor.active ? 'aktif' : 'pasif'})</p>}
          {!selectedDoor && <p className="text-xs text-muted">Geçirmek için plandan bir kapı seçin.</p>}
          {!selectedPerson && <p className="text-xs text-muted">Bir kişiyi geçirmek için plandaki kişiye tıklayın.</p>}
          <div className="flex flex-wrap gap-2">
            {selectedPerson && selectedDoor && <button type="button" disabled={done} onClick={() => { setHint(manualPass(current, selectedPerson.id, selectedDoor.id) || ''); redraw(); }} className={`${button} bg-info-soft text-info`}>Bu kapıdan geçir</button>}
            {selectedDoor && <button type="button" disabled={done} onClick={() => { unknownCard(current, selectedDoor.id); redraw(); }} className={`${button} bg-danger-soft text-danger`}>Tanımsız kart okut</button>}
          </div>
          {hint && <p role="status" className="text-xs text-warning font-bold">{hint}</p>}
        </section>}

        {current && <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-2" aria-label="Canlı olay akışı">
          <h2 className="font-bold text-ink text-sm">Canlı akış</h2>
          <ol className="space-y-1 max-h-72 overflow-auto text-xs">
            {current.feed.slice(0, 40).map(entry => <li key={entry.id} className="flex gap-2">
              <span className="tabular-nums text-muted">{clockLabel(entry.at)}</span>
              <span className={`font-bold ${entry.ok ? 'text-success' : 'text-danger'}`}>{entry.ok ? '✓' : '✕'}</span>
              <span className="flex-1 min-w-0 break-words">{entry.name} · {entry.doorName}{entry.ok ? '' : ` — ${entry.reason}`}
                {entry.server === undefined ? <span className="text-muted"> · gönderiliyor</span> : entry.server !== entry.ok ? <span className="text-danger font-bold"> · sunucu: {entry.serverReason}</span> : null}</span>
            </li>)}
            {!current.feed.length && <li className="text-muted">Henüz okutma yok.</li>}
          </ol>
          {current.notes.length > 0 && <details className="text-xs text-muted"><summary className="cursor-pointer font-bold">Hareketler ({current.notes.length})</summary>
            <ul className="mt-1 space-y-0.5 max-h-48 overflow-auto">{current.notes.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        </section>}
      </aside>
    </div>
  );
}
