import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { socket } from '../api/socket';
import AlertMessage from '../components/AlertMessage';
import PlanCanvas from '../components/floorplan/PlanCanvas';
import PlanRunner from '../components/floorplan/PlanRunner';
import { usePendingAction } from '../hooks/usePendingAction';
import { readSession } from '../utils/session';
import { demoSettings } from '../utils/demo';
import { AREA_COLORS, AREA_TYPES, MAX_AREAS, areaName, fromServer, isLinked, newArea, relink, replaceArea, toServer } from '../utils/floorPlan';

const EMPTY = { areas: [], doors: [] };
const LIVE_EVENTS = ['floorplan_updated', 'doors_updated', 'connect'];
const WIDE = '(min-width: 768px)';

function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const change = () => setWide(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return wide;
}

function FloorPlan() {
  const session = readSession();
  const wide = useWideScreen();
  // Running writes card reads: only in a personal copy or a local test setup.
  const simulation = session?.role === 'admin' && (!!session.sandbox || import.meta.env.VITE_ENABLE_SIMULATION === 'true');
  const [mode, setMode] = useState('design');
  const [unsent, setUnsent] = useState(false);
  const running = simulation && mode === 'run';
  const editable = session?.role === 'admin' && wide && !running;
  const [plan, setPlan] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [state, setState] = useState({ loading: true, error: '' });
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState(null);
  const [placing, setPlacing] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { pending, run } = usePendingAction();
  const nextRef = useRef(0);

  const savedBody = useMemo(() => JSON.stringify(toServer(saved)), [saved]);
  const dirty = JSON.stringify(toServer(plan)) !== savedBody;
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const load = useCallback(signal => api.get('/kat-plani', { signal }).then(({ data }) => {
      const model = fromServer(data);
      setPlan(model); setSaved(model); setStale(false); setPlacing(null);
      setSelected(current => {
        if (current?.kind === 'door' && model.doors.some(door => door.id === current.key)) return current;
        if (current?.kind === 'area' && model.areas.some(area => area.ref === current.key)) return current;
        return null;
      });
      setState({ loading: false, error: '' });
    }).catch(error => {
      if (!signal?.aborted) setState({ loading: false, error: error.response?.data?.message || 'Kat planı yüklenemedi.' });
    }), []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    // Live changes never overwrite unsaved edits; the user decides.
    const refresh = () => { if (dirtyRef.current) setStale(true); else load(); };
    LIVE_EVENTS.forEach(event => socket.on(event, refresh));
    return () => { controller.abort(); LIVE_EVENTS.forEach(event => socket.off(event, refresh)); };
  }, [load]);

  useEffect(() => {
    if (!dirty && !unsent) return;
    const warn = event => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, unsent]);

  const changeAreas = change => setPlan(current => {
    const areas = change(current.areas);
    return { areas, doors: relink(areas, current.doors) };
  });
  const changeDoor = (id, change) => setPlan(current => ({ ...current, doors: current.doors.map(door => door.id === id ? { ...door, ...change } : door) }));
  const updateArea = next => setPlan(current => replaceArea(current, next));
  const addArea = () => {
    const area = newArea(plan.areas, `n${++nextRef.current}`);
    changeAreas(areas => [...areas, area]);
    setSelected({ kind: 'area', key: area.ref });
  };
  const removeArea = ref => { changeAreas(areas => areas.filter(area => area.ref !== ref)); setSelected(null); };
  const place = (id, spot) => {
    changeDoor(id, { ...spot, placed: true });
    setPlacing(null); setSelected({ kind: 'door', key: id }); setMessage({ text: '', type: '' });
  };

  const unlinked = plan.doors.filter(door => !isLinked(door));
  const unnamed = plan.areas.some(area => !area.name.trim());
  const save = () => run(async () => {
    setMessage({ text: '', type: '' });
    try {
      await api.put('/kat-plani', toServer(plan));
      setMessage({ text: 'Kat planı kaydedildi.', type: 'success' });
      await load();
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Kat planı kaydedilemedi.', type: 'error' }); }
  });
  const applyTemplate = () => run(async () => {
    setMessage({ text: '', type: '' });
    try {
      const { data } = await api.post('/kat-plani/sablon');
      setMessage({ text: data.message, type: 'success' });
      await load();
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Şablon uygulanamadı.', type: 'error' }); }
  });
  const discard = () => { setPlan(saved); setSelected(null); setPlacing(null); setStale(false); load(); };

  const area = selected?.kind === 'area' ? plan.areas.find(item => item.ref === selected.key) : null;
  const door = selected?.kind === 'door' ? plan.doors.find(item => item.id === selected.key) : null;
  const unplaced = plan.doors.filter(item => !item.placed);
  const placingDoor = plan.doors.find(item => item.id === placing);
  const input = 'w-full border border-line-strong rounded-lg px-3 py-2 text-sm disabled:bg-surface-2';

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Tesis Tasarımı</h1>
        <p className="text-muted text-sm mt-1">Bölgeleri çizin ve kapıları bölge sınırlarına yerleştirin. Bir kapı iki bölgeyi ya da bir bölgeyi bina dışıyla bağlar; geçiş simülasyonu bu planı kullanır.</p>
      </div>

      {simulation && <div role="tablist" aria-label="Kat planı modu" className="flex gap-2">
        {[['design', 'Tasarla'], ['run', 'Çalıştır']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value}
          disabled={value === 'run' ? dirty || !!placing : unsent} title={value === 'run' && dirty ? 'Önce planı kaydedin.' : value === 'design' && unsent ? 'Önce bekleyen okutmalar gönderilsin.' : undefined}
          onClick={() => { setMode(value); setSelected(null); setMessage({ text: '', type: '' }); }}
          className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${mode === value ? 'bg-primary text-white' : 'bg-surface border border-line-strong text-ink'}`}>{label}</button>)}
        {dirty && <span className="self-center text-xs text-muted">Çalıştırmak için önce planı kaydedin.</span>}
      </div>}

      {!wide && !running && session?.role === 'admin' && <p className="rounded-xl bg-surface-3 text-ink px-4 py-3 text-sm">Plan düzenleme geniş ekranda yapılır; bu ekranda plan yalnız görüntülenir.</p>}
      {session?.role !== 'admin' && demoSettings().demo && <p className="rounded-xl bg-warning-soft text-ink px-4 py-3 text-sm">Salt okunur görünüm. Planı düzenlemek için giriş ekranından kişisel simülasyon alanı başlatın.</p>}
      {stale && <div role="status" className="rounded-xl bg-warning-soft border border-warning-line text-ink px-4 py-3 text-sm flex flex-wrap items-center gap-3">
        <span className="flex-1">Kat planı veya kapılar başka bir oturumda değişti. Kaydetmeden önce güncel planı yükleyin.</span>
        <button type="button" onClick={discard} className="rounded-lg bg-amber-900 text-white px-3 py-1 font-bold">Değişiklikleri bırak ve yükle</button>
      </div>}
      <AlertMessage message={message.text} type={message.type} />

      {editable && <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !!placing || plan.areas.length >= MAX_AREAS} onClick={addArea} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">Bölge ekle</button>
        {!saved.areas.length && !dirty && <button type="button" disabled={pending || state.loading} onClick={applyTemplate} className="px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-bold disabled:opacity-50">Ofis şablonunu uygula</button>}
        <span className="flex-1" />
        {dirty && <span className="text-sm text-warning font-bold">Kaydedilmemiş değişiklikler var</span>}
        <button type="button" disabled={pending || !dirty} onClick={discard} className="px-4 py-2 rounded-lg bg-surface-3 text-ink text-sm font-bold disabled:opacity-50">Geri al</button>
        <button type="button" disabled={pending || !dirty || stale || unlinked.length > 0 || unnamed} onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50">{pending ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>}
      {placingDoor && <div role="status" className="rounded-xl bg-info-soft border border-info-line text-info px-4 py-3 text-sm flex flex-wrap items-center gap-3">
        <span className="flex-1"><strong>{placingDoor.name}</strong> için bir bölge kenarına tıklayın. Kapı en yakın sınıra oturur.</span>
        <button type="button" onClick={() => setPlacing(null)} className="rounded-lg border border-cyan-700/40 px-3 py-1 font-bold">Vazgeç</button>
      </div>}

      {running && !state.loading && !state.error && <PlanRunner plan={saved} onUnsentChange={setUnsent} />}
      {state.loading && <p role="status">Kat planı yükleniyor…</p>}
      {state.error && <div role="alert" className="text-danger font-bold flex gap-3 items-center">{state.error}
        <button type="button" onClick={() => { setState({ loading: true, error: '' }); load(); }} className="rounded-lg bg-primary text-white px-3 py-1 text-sm">Tekrar dene</button></div>}

      {!running && !state.loading && !state.error && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
          {!plan.areas.length && <p className="px-5 pt-4 text-sm text-muted">{editable ? 'Plan boş. Hazır ofis şablonuyla başlayabilir veya bölge ekleyebilirsiniz.' : 'Henüz kat planı çizilmemiş.'}</p>}
          <div className="overflow-auto max-h-[70vh]">
            <PlanCanvas areas={plan.areas} doors={plan.doors} selected={selected} editable={editable} placing={placing}
              onSelect={setSelected} onAreaChange={updateArea} onDoorMove={(id, spot) => changeDoor(id, spot)} onPlace={place}
              onInvalidPlace={() => setMessage({ text: 'Kapı yalnız bir bölgenin kenarına yerleştirilebilir.', type: 'error' })} />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 border-t border-line text-xs text-muted">
            {AREA_TYPES.map(type => <li key={type} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border" style={{ background: AREA_COLORS[type].fill, borderColor: AREA_COLORS[type].stroke }} />{type}</li>)}
            <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-primary" />Aktif kapı</li>
            <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-slate-400" />Pasif kapı</li>
          </ul>
        </div>

        <aside className="space-y-4">
          {editable && (unlinked.length > 0 || unnamed) && <section role="alert" className="rounded-2xl bg-danger-soft border border-danger-line p-4 text-sm text-danger font-bold space-y-1">
            {unlinked.length > 0 && <p>Bölge sınırında olmayan kapılar: {unlinked.map(item => item.name).join(', ')}. Kapıyı bir sınıra taşıyın veya plandan kaldırın.</p>}
            {unnamed && <p>Her bölgenin bir adı olmalıdır.</p>}
          </section>}
          {area && <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-3" aria-label="Seçili bölge">
            <h3 className="font-bold text-ink">Bölge</h3>
            <label className="block text-sm font-bold text-muted">Ad
              <input className={input} value={area.name} maxLength={100} disabled={!editable} onChange={event => updateArea({ ...area, name: event.target.value })} />
            </label>
            <label className="block text-sm font-bold text-muted">Tür
              <select className={input} value={area.type} disabled={!editable} onChange={event => updateArea({ ...area, type: event.target.value })}>
                {AREA_TYPES.map(type => <option key={type}>{type}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">Konum {area.x}, {area.y} · Boyut {area.w} × {area.h}</p>
            {editable && <p className="text-xs text-muted">Sürükleyerek taşıyın, sağ alt köşeden boyutlandırın. Klavye: ok tuşları taşır, Shift + ok boyutlandırır.</p>}
            {editable && <button type="button" onClick={() => removeArea(area.ref)} className="px-3 py-1 rounded-lg bg-danger-soft text-danger text-sm font-bold">Bölgeyi sil</button>}
          </section>}

          {door && <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-2 text-sm" aria-label="Seçili kapı">
            <h3 className="font-bold text-ink">{door.name}</h3>
            <p className="text-muted">{door.type} · {door.active ? 'Aktif' : 'Pasif'}</p>
            <p className="text-muted">{door.placed ? (isLinked(door) ? <>Bağlantı: <strong>{areaName(plan.areas, door.a)} ↔ {areaName(plan.areas, door.b)}</strong></> : <strong className="text-danger">Bölge sınırında değil</strong>) : 'Plana yerleştirilmedi.'}</p>
            <p className="text-muted">Yetkili aktif personel: <strong>{door.permitted}</strong></p>
            {session?.role === 'admin' && <p className="text-xs text-muted">Yetkileri <Link className="text-info underline" to="/personel/toplu">Toplu İşlemler</Link> veya <Link className="text-info underline" to="/personel/duzenleme">Personel Düzenleme</Link> üzerinden düzenleyin.</p>}
            {editable && door.placed && <button type="button" onClick={() => { changeDoor(door.id, { placed: false, x: null, y: null, a: null, b: null }); }} className="px-3 py-1 rounded-lg bg-danger-soft text-danger font-bold">Plandan kaldır</button>}
          </section>}

          <section className="bg-surface rounded-2xl shadow-sm border border-line p-5 space-y-3" aria-label="Yerleştirilmemiş kapılar">
            <h3 className="font-bold text-ink">Yerleştirilmemiş kapılar ({unplaced.length})</h3>
            {!unplaced.length && <p className="text-sm text-muted">Tüm kapılar planda.</p>}
            <ul className="space-y-2 max-h-80 overflow-auto">
              {unplaced.map(item => <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0"><span className="font-bold text-ink break-words">{item.name}</span><span className="block text-xs text-muted">{item.type}{item.active ? '' : ' · Pasif'}</span></span>
                {editable && <button type="button" disabled={!plan.areas.length} onClick={() => { setPlacing(item.id); setSelected({ kind: 'door', key: item.id }); }} className={`px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-50 ${placing === item.id ? 'bg-cyan-700 text-white' : 'bg-info-soft text-info'}`}>Yerleştir</button>}
              </li>)}
            </ul>
            {editable && !plan.areas.length && unplaced.length > 0 && <p className="text-xs text-muted">Kapı yerleştirmek için önce bölge ekleyin.</p>}
          </section>
        </aside>
      </div>}
    </div>
  );
}

export default FloorPlan;
