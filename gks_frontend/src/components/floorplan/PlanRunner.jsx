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

export default function PlanRunner({ plan }) {
  const [form, setForm] = useState(() => ({ tarih: defaultDay(), gec: 10, devamsiz: 5, hatali: 5 }));
  // The engine mutates the simulation object; `frame` triggers the redraw.
  const [current, setCurrent] = useState(null);
  const [, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
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
      setPerson(null); setDoor(null);
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

  // Queued reads go to the server in batches; failures pause the run and
  // keep the batch for the next attempt.
  useEffect(() => {
    if (!current) return;
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
        setRunning(false);
        setError((err.response?.data?.message || 'Okutmalar sunucuya gönderilemedi.') + ' Simülasyon duraklatıldı; devam ettiğinizde yeniden gönderilir.');
      } finally { sending.current = false; redraw(); }
    }, SEND_EVERY);
    return () => clearInterval(timer);
  }, [current, redraw]);

  const selectedPerson = current?.people.find(item => item.id === person);
  const selectedDoor = plan.doors.find(item => item.id === door);
  const done = current && finished(current);
  const pending = current?.outbox.length || 0;
  const mismatches = current?.feed.filter(entry => entry.server !== undefined && entry.server !== entry.ok).length || 0;
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {current && <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="text-2xl font-black tabular-nums text-slate-800" aria-live="off">{clockLabel(current.clock)}</span>
          <span className="text-xs text-slate-500 mr-auto">{new Date(current.clock).toISOString().slice(0, 10)}</span>
          <button type="button" disabled={done} onClick={() => setRunning(value => !value)} className={`${button} bg-slate-900 text-white`}>{running ? 'Duraklat' : 'Devam'}</button>
          <div role="group" aria-label="Hız" className="flex rounded-lg border border-slate-300 overflow-hidden">
            {SPEEDS.map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}
              className={`px-3 py-2 text-sm font-bold ${speed === value ? 'bg-cyan-600 text-white' : 'bg-white text-slate-700'}`}>{value}×</button>)}
          </div>
          <button type="button" disabled={done} onClick={() => { step(current, 30 * MINUTE); redraw(); }} className={`${button} bg-slate-200 text-slate-800`}>+30 dk</button>
        </div>}
        <div className="overflow-auto max-h-[70vh]">
          <PlanCanvas areas={plan.areas} doors={plan.doors} selected={door ? { kind: 'door', key: door } : null} editable={false} placing={null}
            onSelect={value => setDoor(value?.kind === 'door' ? value.key : null)} onAreaChange={() => {}} onDoorMove={() => {}} onPlace={() => {}} onInvalidPlace={() => {}}>
            {overlay}
          </PlanCanvas>
        </div>
        <p className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">1× = saniyede 1 dakika. Kişiye tıklayıp ardından bir kapı seçerek elle geçiş deneyebilirsiniz. Yeşil halka onaylanan, kırmızı reddedilen okutmadır.</p>
      </div>

      <aside className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold p-3">{error}</p>}
        <form onSubmit={start} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3" aria-label="Simülasyon ayarları">
          <h3 className="font-bold text-slate-800">{current ? 'Yeni gün' : 'Gün ayarları'}</h3>
          <label className="block text-sm font-bold text-slate-600">Tarih
            <input type="date" required className={input} value={form.tarih} onChange={event => setForm({ ...form, tarih: event.target.value })} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[['gec', 'Geç kalma'], ['devamsiz', 'Devamsızlık'], ['hatali', 'Hatalı okutma']].map(([key, label]) => (
              <label key={key} className="block text-xs font-bold text-slate-600">{label} %
                <input type="number" min="0" max="50" required className={input} value={form[key]} onChange={event => setForm({ ...form, [key]: Math.min(50, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
            ))}
          </div>
          <button type="submit" disabled={preparing || !plan.areas.length} className={`${button} w-full bg-blue-600 text-white`}>{preparing ? 'Plan hazırlanıyor…' : current ? 'Bu günü başlat' : 'Simülasyonu başlat'}</button>
          <p className="text-xs text-slate-500">Okutmalar seçilen güne gerçek geçiş kaydı olarak yazılır ve puantaja yansır. Aynı günü tekrar çalıştırmak kayıtları çoğaltır.</p>
        </form>

        {current && <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-2 text-sm" aria-label="Simülasyon durumu">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-slate-500">İçeride</dt><dd className="text-xl font-black text-slate-800">{inside(current)}</dd></div>
            <div><dt className="text-xs text-slate-500">Onaylanan</dt><dd className="text-xl font-black text-green-700">{current.counts.ok}</dd></div>
            <div><dt className="text-xs text-slate-500">Reddedilen</dt><dd className="text-xl font-black text-red-700">{current.counts.denied}</dd></div>
          </dl>
          <p className="text-xs text-slate-500">{current.people.length} kişi planlı{current.absent.length ? ` · gelmeyen: ${current.absent.map(item => `${item.name} (${item.reason})`).join(', ')}` : ''}</p>
          {pending > 0 && <p className="text-xs text-amber-700 font-bold">Gönderilmeyi bekleyen okutma: {pending}</p>}
          {mismatches > 0 && <p className="text-xs text-red-700 font-bold">{mismatches} okutmada sunucu kararı tahminden farklı (veri bu sırada değişmiş olabilir).</p>}
          {done && !pending && <div className="rounded-xl bg-green-50 border border-green-200 p-3 space-y-1">
            <p className="font-bold text-green-800">Gün tamamlandı.</p>
            <p className="flex flex-wrap gap-x-3"><Link className="text-blue-700 underline" to={`/puantaj?tarih=${new Date(current.day).toISOString().slice(0, 10)}`}>Bu günün puantajı</Link>
              <Link className="text-blue-700 underline" to="/mesailer">Mesai onayları</Link><Link className="text-blue-700 underline" to="/loglar/gecis">Geçiş logları</Link></p>
          </div>}
        </section>}

        {current && (selectedPerson || selectedDoor) && <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-2 text-sm" aria-label="Elle işlem">
          <h3 className="font-bold text-slate-800">Elle işlem</h3>
          {selectedPerson && <p>Kişi: <strong>{selectedPerson.name}</strong> · {selectedPerson.node === OUTSIDE ? 'Bina dışında' : areaName(plan.areas, selectedPerson.node)}</p>}
          {selectedDoor && <p>Kapı: <strong>{selectedDoor.name}</strong> ({selectedDoor.active ? 'aktif' : 'pasif'})</p>}
          {!selectedDoor && <p className="text-xs text-slate-500">Geçirmek için plandan bir kapı seçin.</p>}
          {!selectedPerson && <p className="text-xs text-slate-500">Bir kişiyi geçirmek için plandaki kişiye tıklayın.</p>}
          <div className="flex flex-wrap gap-2">
            {selectedPerson && selectedDoor && <button type="button" disabled={done} onClick={() => { setHint(manualPass(current, selectedPerson.id, selectedDoor.id) || ''); redraw(); }} className={`${button} bg-cyan-50 text-cyan-800`}>Bu kapıdan geçir</button>}
            {selectedDoor && <button type="button" disabled={done} onClick={() => { unknownCard(current, selectedDoor.id); redraw(); }} className={`${button} bg-red-50 text-red-700`}>Tanımsız kart okut</button>}
          </div>
          {hint && <p role="status" className="text-xs text-amber-700 font-bold">{hint}</p>}
        </section>}

        {current && <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-2" aria-label="Canlı olay akışı">
          <h3 className="font-bold text-slate-800 text-sm">Canlı akış</h3>
          <ol className="space-y-1 max-h-72 overflow-auto text-xs">
            {current.feed.slice(0, 40).map(entry => <li key={entry.id} className="flex gap-2">
              <span className="tabular-nums text-slate-500">{clockLabel(entry.at)}</span>
              <span className={`font-bold ${entry.ok ? 'text-green-700' : 'text-red-700'}`}>{entry.ok ? '✓' : '✕'}</span>
              <span className="flex-1 min-w-0 break-words">{entry.name} · {entry.doorName}{entry.ok ? '' : ` — ${entry.reason}`}
                {entry.server === undefined ? <span className="text-slate-400"> · gönderiliyor</span> : entry.server !== entry.ok ? <span className="text-red-700 font-bold"> · sunucu: {entry.serverReason}</span> : null}</span>
            </li>)}
            {!current.feed.length && <li className="text-slate-500">Henüz okutma yok.</li>}
          </ol>
          {current.notes.length > 0 && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-bold">Hareketler ({current.notes.length})</summary>
            <ul className="mt-1 space-y-0.5 max-h-48 overflow-auto">{current.notes.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        </section>}
      </aside>
    </div>
  );
}
