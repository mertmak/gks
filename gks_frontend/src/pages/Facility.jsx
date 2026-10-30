import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { socket } from '../api/socket';
import AlertMessage from '../components/AlertMessage';
import ConfirmAction from '../components/ConfirmAction';
import PlanCanvas from '../components/floorplan/PlanCanvas';
import PlanRunner from '../components/floorplan/PlanRunner';
import FloorTabs from '../components/floorplan/FloorTabs';
import BulkGenerator from '../components/facility/BulkGenerator';
import { usePendingAction } from '../hooks/usePendingAction';
import { readSession } from '../utils/session';
import { demoSettings } from '../utils/demo';
import {
  AREA_COLORS, AREA_TYPES, MAX_AREAS, MAX_FLOORS, ONE_WAY, VERTICAL, addFloor, areaProblem, areasOn, floorsInOrder, fromServer,
  isLinked, moveFloor, newArea, partners, passages, relink, removeFloor, replaceArea, toServer, unplace,
} from '../utils/floorPlan';

const EMPTY = fromServer({});
const LIVE_EVENTS = ['floorplan_updated', 'doors_updated', 'connect'];
const WIDE = '(min-width: 768px)';
const TABS = [['tasarla', 'Tasarla'], ['canli', 'Canlı Simülasyon'], ['uretici', 'Toplu Veri Üretici']];
const TOOLS = [['select', 'Seç ve taşı'], ['draw', 'Bölge çiz'], ['door', 'Kapı ekle']];
const TOOL_HINTS = {
  draw: 'Köşeleri tıklayarak çizin. İlk köşeye tıklayın, çift tıklayın veya Enter ile kapatın; Esc iptal eder.',
  door: 'Yeni kapı için bir bölge kenarına tıklayın. Kapı en yakın sınıra oturur.',
};
const WAY_LABELS = { Çift: 'İki yönde açık', 'A→B': 'Yalnız A → B', 'B→A': 'Yalnız B → A' };

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

function Facility() {
  const session = readSession();
  const admin = session?.role === 'admin';
  const wide = useWideScreen();
  // Simulations write card reads: only in a personal copy or a local test setup.
  const simulation = admin && (!!session.sandbox || import.meta.env.VITE_ENABLE_SIMULATION === 'true');
  const [params, setParams] = useSearchParams();
  const tab = simulation && TABS.some(([value]) => value === params.get('sekme')) ? params.get('sekme') : 'tasarla';
  const [unsent, setUnsent] = useState(false);
  const designing = tab === 'tasarla';
  const editable = admin && wide && designing;
  const [plan, setPlan] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [state, setState] = useState({ loading: true, error: '' });
  const [stale, setStale] = useState(false);
  const [floorChoice, setFloor] = useState(null);
  const [tool, setTool] = useState('select');
  const [selected, setSelected] = useState(null);
  const [placing, setPlacing] = useState(null);
  const [newDoor, setNewDoor] = useState(null);
  const [floorToRemove, setFloorToRemove] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const { pending, run } = usePendingAction();
  const nextRef = useRef(0);
  // Doors created here stay placed across reloads until the plan is saved:
  // the server's doors_updated event may arrive before the create response.
  const created = useRef(new Map());
  const withCreated = model => ({ ...model, doors: model.doors.map(door => created.current.has(door.id) && !door.placed ? { ...door, ...created.current.get(door.id) } : door) });
  const newRef = prefix => `${prefix}${++nextRef.current}`;

  const savedBody = useMemo(() => JSON.stringify(toServer(saved)), [saved]);
  const dirty = JSON.stringify(toServer(plan)) !== savedBody;
  const latest = useRef({ dirty: false, savedBody });
  useEffect(() => { latest.current = { dirty, savedBody }; }, [dirty, savedBody]);
  const floor = plan.floors.some(item => item.ref === floorChoice) ? floorChoice : floorsInOrder(plan.floors)[0].ref;

  const load = useCallback(signal => api.get('/kat-plani', { signal }).then(({ data }) => {
      const model = fromServer(data);
      setPlan(withCreated(model)); setSaved(model); setStale(false); setPlacing(null); setNewDoor(null);
      setSelected(current => {
        if (current?.kind === 'door' && model.doors.some(door => door.id === current.key)) return current;
        if (current?.kind === 'area' && model.areas.some(area => area.ref === current.key)) return current;
        return null;
      });
      setState({ loading: false, error: '' });
    }).catch(error => {
      if (!signal?.aborted) setState({ loading: false, error: error.response?.data?.message || 'Tesis planı yüklenemedi.' });
    }), []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    // Live changes never overwrite unsaved edits. A change that leaves the
    // saved plan as it was (a new door, this page's own door) is not a conflict.
    const refresh = () => {
      if (!latest.current.dirty) { load(); return; }
      api.get('/kat-plani').then(({ data }) => {
        if (JSON.stringify(toServer(fromServer(data))) !== latest.current.savedBody) setStale(true);
      }).catch(() => setStale(true));
    };
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
    return { ...current, areas, doors: relink(areas, current.doors) };
  });
  const changeDoor = (id, change) => setPlan(current => ({ ...current, doors: current.doors.map(door => door.id === id ? { ...door, ...change } : door) }));
  const updateArea = next => setPlan(current => replaceArea(current, next));
  const addArea = area => { changeAreas(areas => [...areas, area]); setSelected({ kind: 'area', key: area.ref }); };
  const removeArea = key => { changeAreas(areas => areas.filter(area => area.ref !== key)); setSelected(null); };
  const updateFloor = (key, change) => setPlan(current => ({ ...current, floors: current.floors.map(item => item.ref === key ? { ...item, ...change } : item) }));
  const dropFloor = key => { setPlan(current => removeFloor(current, key)); setSelected(null); setFloorToRemove(null); };
  const chooseTool = value => { setTool(value); setPlacing(null); setNewDoor(null); if (value !== 'select') setSelected(null); };
  const showFloor = key => { setFloor(key); setSelected(null); setPlacing(null); setNewDoor(null); };

  const pickSpot = spot => {
    setMessage({ text: '', type: '' });
    if (placing) {
      changeDoor(placing, { ...spot, placed: true, floor });
      setSelected({ kind: 'door', key: placing }); setPlacing(null);
    } else setNewDoor({ spot, name: `Kapı ${plan.doors.length + 1}`, oneWay: 'Çift', grant: simulation });
  };
  const createDoor = event => {
    event.preventDefault();
    const { spot, name, oneWay, grant } = newDoor;
    const [inward] = passages(areasOn(plan.areas, floor), { ...spot, oneWay });
    run(async () => {
      try {
        // The door type is only the fallback meaning; on the plan the areas decide.
        const { data } = await api.post('/doors', { kapi_adi: name.trim(), kapi_turu: inward.meaning, ...(grant ? { yetki_ver: true } : {}) });
        const door = { id: data.id, name: name.trim(), type: inward.meaning, active: true, permitted: grant ? null : 0, oneWay, floor, placed: true, ...spot };
        const { placed, x, y, a, b, floor: on, oneWay: way } = door;
        created.current.set(door.id, { placed, x, y, a, b, floor: on, oneWay: way });
        const known = list => list.some(item => item.id === door.id);
        setPlan(current => known(current.doors) ? withCreated(current) : { ...current, doors: [...current.doors, door] });
        setSaved(current => known(current.doors) ? current : { ...current, doors: [...current.doors, unplace(door)] });
        setNewDoor(null); setTool('select'); setSelected({ kind: 'door', key: door.id });
        setMessage({ text: `${door.name} oluşturuldu. Plana yerleşmesi için planı kaydedin.`, type: 'success' });
      } catch (error) { setMessage({ text: error.response?.data?.message || 'Kapı oluşturulamadı.', type: 'error' }); }
    });
  };

  const unlinked = plan.doors.filter(door => !isLinked(door));
  const unnamed = plan.areas.some(area => !area.name.trim()) || plan.floors.some(item => !item.kat_adi.trim());
  const broken = plan.areas.filter(area => areaProblem(area));
  const blocked = unlinked.length > 0 || unnamed || broken.length > 0;
  const save = () => run(async () => {
    setMessage({ text: '', type: '' });
    try {
      await api.put('/kat-plani', toServer(plan));
      created.current.clear();
      setMessage({ text: 'Tesis planı kaydedildi.', type: 'success' });
      await load();
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Tesis planı kaydedilemedi.', type: 'error' }); }
  });
  const applyTemplate = sablon => run(async () => {
    setMessage({ text: '', type: '' });
    try {
      const { data } = await api.post('/kat-plani/sablon', { sablon });
      setMessage({ text: data.message, type: 'success' });
      await load();
    } catch (error) { setMessage({ text: error.response?.data?.message || 'Şablon uygulanamadı.', type: 'error' }); }
  });
  const discard = () => { created.current.clear(); setPlan(saved); setSelected(null); setPlacing(null); setNewDoor(null); setStale(false); load(); };
  const openTab = value => { setParams(value === 'tasarla' ? {} : { sekme: value }, { replace: true }); setSelected(null); setPlacing(null); setNewDoor(null); setMessage({ text: '', type: '' }); };

  const floorAreas = areasOn(plan.areas, floor);
  const floorDoors = plan.doors.filter(item => item.placed && item.floor === floor);
  const currentFloor = plan.floors.find(item => item.ref === floor);
  const ordered = floorsInOrder(plan.floors);
  const area = selected?.kind === 'area' ? plan.areas.find(item => item.ref === selected.key) : null;
  const door = selected?.kind === 'door' ? plan.doors.find(item => item.id === selected.key) : null;
  const unplaced = plan.doors.filter(item => !item.placed);
  const placingDoor = plan.doors.find(item => item.id === placing);
  const groups = [...new Set(plan.areas.filter(item => item.type === VERTICAL && item.group.trim()).map(item => item.group.trim()))];
  const floorName = key => plan.floors.find(item => item.ref === key)?.kat_adi || '?';
  const input = 'w-full border border-line-strong rounded-lg px-3 py-2 text-sm disabled:bg-surface-2';
  const button = 'px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50';
  const card = 'bg-surface rounded-2xl shadow-sm border border-line p-5';

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Tesis Tasarımı</h1>
        <p className="text-muted text-sm mt-1">Katları ve bölgeleri çizin, kapıları bölge sınırlarına yerleştirin. Bir kapı aynı kattaki iki bölgeyi ya da bir bölgeyi bina dışıyla bağlar; puantaj, geçişin hangi bölgeden hangisine olduğuna bakar.</p>
      </div>

      {simulation && <div role="tablist" aria-label="Tesis Tasarımı bölümleri" className="flex flex-wrap gap-2">
        {TABS.map(([value, label]) => {
          const locked = value === 'canli' ? dirty || !!placing : tab === 'canli' && unsent;
          return <button key={value} type="button" role="tab" aria-selected={tab === value} disabled={tab !== value && locked}
            title={tab !== value && locked ? (value === 'canli' ? 'Önce planı kaydedin.' : 'Önce bekleyen okutmalar gönderilsin.') : undefined}
            onClick={() => openTab(value)}
            className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${tab === value ? 'bg-primary text-white' : 'bg-surface border border-line-strong text-ink'}`}>{label}</button>;
        })}
        {dirty && designing && <span className="self-center text-xs text-muted">Canlı simülasyon için önce planı kaydedin.</span>}
      </div>}

      {tab === 'uretici' && <BulkGenerator />}

      {tab !== 'uretici' && <>
        {!wide && designing && admin && <p className="rounded-xl bg-surface-3 text-ink px-4 py-3 text-sm">Plan düzenleme geniş ekranda yapılır; bu ekranda plan yalnız görüntülenir.</p>}
        {!admin && demoSettings().demo && <p className="rounded-xl bg-warning-soft text-ink px-4 py-3 text-sm">Salt okunur görünüm. Planı düzenlemek için giriş ekranından kişisel simülasyon alanı başlatın.</p>}
        {stale && <div role="status" className="rounded-xl bg-warning-soft border border-warning-line text-ink px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1">Tesis planı başka bir oturumda değişti. Kaydetmeden önce güncel planı yükleyin.</span>
          <button type="button" onClick={discard} className="rounded-lg bg-amber-900 text-white px-3 py-1 font-bold">Değişiklikleri bırak ve yükle</button>
        </div>}
        <AlertMessage message={message.text} type={message.type} />
        {state.loading && <p role="status">Tesis planı yükleniyor…</p>}
        {state.error && <div role="alert" className="text-danger font-bold flex gap-3 items-center">{state.error}
          <button type="button" onClick={() => { setState({ loading: true, error: '' }); load(); }} className="rounded-lg bg-primary text-white px-3 py-1 text-sm">Tekrar dene</button></div>}
      </>}

      {tab === 'canli' && !state.loading && !state.error && <PlanRunner plan={saved} floor={floor} onUnsentChange={setUnsent} />}

      {designing && !state.loading && !state.error && <>
        {editable && <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Araç" className="flex rounded-lg border border-line-strong overflow-hidden">
            {TOOLS.map(([value, label]) => <button key={value} type="button" aria-pressed={tool === value} disabled={pending || (value === 'draw' && plan.areas.length >= MAX_AREAS) || (value === 'door' && !floorAreas.length)}
              onClick={() => chooseTool(value)} className={`px-3 py-2 text-sm font-bold disabled:opacity-50 ${tool === value ? 'bg-cyan-700 text-white' : 'bg-surface text-ink'}`}>{label}</button>)}
          </div>
          <button type="button" disabled={pending || !!placing || plan.areas.length >= MAX_AREAS} onClick={() => addArea(newArea(floorAreas, newRef('n'), floor))} className={`${button} bg-primary text-white`}>Dikdörtgen bölge</button>
          {!saved.areas.length && !dirty && <>
            <button type="button" disabled={pending} onClick={() => applyTemplate('ofis')} className={`${button} bg-surface-3 text-ink`}>Ofis şablonu</button>
            <button type="button" disabled={pending} onClick={() => applyTemplate('fabrika')} className={`${button} bg-surface-3 text-ink`}>Fabrika şablonu</button>
          </>}
          <span className="flex-1" />
          {dirty && <span className="text-sm text-warning font-bold">Kaydedilmemiş değişiklikler var</span>}
          <button type="button" disabled={pending || !dirty} onClick={discard} className={`${button} bg-surface-3 text-ink`}>Geri al</button>
          <button type="button" disabled={pending || !dirty || stale || blocked} onClick={save} className={`${button} bg-blue-600 text-white`}>{pending ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>}
        {editable && TOOL_HINTS[tool] && !placing && <p role="status" className="rounded-xl bg-info-soft border border-info-line text-info px-4 py-3 text-sm">{TOOL_HINTS[tool]}</p>}
        {placingDoor && <div role="status" className="rounded-xl bg-info-soft border border-info-line text-info px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1"><strong>{placingDoor.name}</strong> için {currentFloor.kat_adi} planında bir bölge kenarına tıklayın. Kapı en yakın sınıra oturur.</span>
          <button type="button" onClick={() => setPlacing(null)} className="rounded-lg border border-cyan-700/40 px-3 py-1 font-bold">Vazgeç</button>
        </div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
            {(editable || plan.floors.length > 1) && <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              <FloorTabs floors={plan.floors} current={floor} onSelect={showFloor} />
              {editable && <button type="button" disabled={plan.floors.length >= MAX_FLOORS} onClick={() => { const key = newRef('f'); setPlan(current => addFloor(current, key)); showFloor(key); }}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-info-soft text-info disabled:opacity-50">Kat ekle</button>}
            </div>}
            {!plan.areas.length && <p className="px-5 pt-4 text-sm text-muted">{editable ? 'Plan boş. Hazır bir şablonla başlayabilir, bölge çizebilir veya dikdörtgen bölge ekleyebilirsiniz.' : 'Henüz tesis planı çizilmemiş.'}</p>}
            <div className="overflow-auto max-h-[70vh]">
              <PlanCanvas areas={floorAreas} doors={floorDoors} selected={selected} editable={editable} tool={tool} placing={placing}
                onSelect={setSelected} onAreaChange={updateArea} onDoorMove={(id, spot) => changeDoor(id, spot)} onPlace={pickSpot}
                onInvalidPlace={() => setMessage({ text: 'Kapı yalnız bir bölgenin kenarına yerleştirilebilir.', type: 'error' })}
                onDraw={points => { addArea({ id: null, ref: newRef('n'), floor, name: `Bölge ${floorAreas.length + 1}`, type: 'Diğer', group: '', points }); setTool('select'); }}
                onCancel={() => { setPlacing(null); setNewDoor(null); if (tool !== 'select') setTool('select'); }} />
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 border-t border-line text-xs text-muted">
              {AREA_TYPES.map(type => <li key={type} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border" style={{ background: AREA_COLORS[type].fill, borderColor: AREA_COLORS[type].stroke }} />{type}</li>)}
              <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-primary" />Aktif kapı</li>
              <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-slate-400" />Pasif kapı</li>
              <li>1: tek yönlü kapı</li>
            </ul>
          </div>

          <aside className="space-y-4">
            {editable && blocked && <section role="alert" className="rounded-2xl bg-danger-soft border border-danger-line p-4 text-sm text-danger font-bold space-y-1">
              {unlinked.length > 0 && <p>Bölge sınırında olmayan kapılar: {unlinked.map(item => item.name).join(', ')}. Kapıyı bir sınıra taşıyın veya plandan kaldırın.</p>}
              {broken.map(item => <p key={item.ref}>{item.name.trim() || 'Adsız bölge'} ({floorName(item.floor)}): {areaProblem(item)}</p>)}
              {unnamed && <p>Her katın ve bölgenin bir adı olmalıdır.</p>}
            </section>}

            {editable && currentFloor && <section className={`${card} space-y-3`} aria-label="Kat">
              <h2 className="font-bold text-ink">Kat</h2>
              <label className="block text-sm font-bold text-muted">Ad
                <input className={input} value={currentFloor.kat_adi} maxLength={100} onChange={event => updateFloor(floor, { kat_adi: event.target.value })} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={ordered.at(-1).ref === floor} onClick={() => setPlan(current => moveFloor(current, floor, 1))} className={`${button} bg-surface-3 text-ink`}>Yukarı taşı</button>
                <button type="button" disabled={ordered[0].ref === floor} onClick={() => setPlan(current => moveFloor(current, floor, -1))} className={`${button} bg-surface-3 text-ink`}>Aşağı taşı</button>
                <button type="button" disabled={plan.floors.length <= 1} onClick={() => floorAreas.length ? setFloorToRemove(floor) : dropFloor(floor)} className={`${button} bg-danger-soft text-danger`}>Katı sil</button>
              </div>
            </section>}

            {newDoor && <form onSubmit={createDoor} className={`${card} space-y-3 text-sm`} aria-label="Yeni kapı">
              <h2 className="font-bold text-ink">Yeni kapı</h2>
              <p className="text-muted">{passages(floorAreas, { ...newDoor.spot, oneWay: 'Çift' })[0].label.replace(' → ', ' ↔ ')}</p>
              <label className="block font-bold text-muted">Ad
                <input className={input} required maxLength={100} value={newDoor.name} onChange={event => setNewDoor({ ...newDoor, name: event.target.value })} />
              </label>
              <label className="block font-bold text-muted">Geçiş yönü
                <select className={input} value={newDoor.oneWay} onChange={event => setNewDoor({ ...newDoor, oneWay: event.target.value })}>
                  {ONE_WAY.map(way => <option key={way} value={way}>{way === 'Çift' ? WAY_LABELS[way] : `Yalnız ${passages(floorAreas, { ...newDoor.spot, oneWay: way }).find(item => item.way === way).label}`}</option>)}
                </select>
              </label>
              {simulation && <label className="flex items-center gap-2 text-ink">
                <input type="checkbox" checked={newDoor.grant} onChange={event => setNewDoor({ ...newDoor, grant: event.target.checked })} />
                Tüm aktif personele bu kapı için yetki ver
              </label>}
              <div className="flex gap-2">
                <button type="submit" disabled={pending || !newDoor.name.trim()} className={`${button} bg-blue-600 text-white`}>{pending ? 'Oluşturuluyor…' : 'Kapıyı oluştur'}</button>
                <button type="button" disabled={pending} onClick={() => setNewDoor(null)} className={`${button} bg-surface-3 text-ink`}>Vazgeç</button>
              </div>
            </form>}

            {area && <section className={`${card} space-y-3`} aria-label="Seçili bölge">
              <h2 className="font-bold text-ink">Bölge</h2>
              <label className="block text-sm font-bold text-muted">Ad
                <input className={input} value={area.name} maxLength={100} disabled={!editable} onChange={event => updateArea({ ...area, name: event.target.value })} />
              </label>
              <label className="block text-sm font-bold text-muted">Tür
                <select className={input} value={area.type} disabled={!editable} onChange={event => updateArea({ ...area, type: event.target.value })}>
                  {AREA_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              {area.type === VERTICAL && <>
                <label className="block text-sm font-bold text-muted">Dikey grup
                  <input className={input} list="dikey-gruplar" maxLength={40} value={area.group} disabled={!editable} placeholder="ör. Merdiven A" onChange={event => updateArea({ ...area, group: event.target.value })} />
                  <datalist id="dikey-gruplar">{groups.map(group => <option key={group} value={group} />)}</datalist>
                </label>
                <p className="text-xs text-muted">Aynı gruptaki merdiven ve asansörler katları birbirine bağlar; aralarında kart okutulmaz.</p>
                {partners(plan.areas, area).length > 0 && <ul className="text-sm space-y-1">{partners(plan.areas, area).map(other => <li key={other.ref}>
                  <button type="button" onClick={() => { showFloor(other.floor); setSelected({ kind: 'area', key: other.ref }); }} className="text-info underline">{floorName(other.floor)} · {other.name}</button>
                </li>)}</ul>}
              </>}
              {areaProblem(area) && <p className="text-sm text-danger font-bold">{areaProblem(area)}</p>}
              <p className="text-xs text-muted">{area.points.length} köşe</p>
              {editable && <p className="text-xs text-muted">Sürükleyerek taşıyın. Köşeleri sürükleyin, kenar ortasındaki + ile köşe ekleyin, seçili köşeyi Delete ile silin. Ok tuşları seçili bölgeyi ya da köşeyi taşır.</p>}
              {editable && <button type="button" onClick={() => removeArea(area.ref)} className="px-3 py-1 rounded-lg bg-danger-soft text-danger text-sm font-bold">Bölgeyi sil</button>}
            </section>}

            {door && <section className={`${card} space-y-2 text-sm`} aria-label="Seçili kapı">
              <h2 className="font-bold text-ink">{door.name}</h2>
              <p className="text-muted">{door.active ? 'Aktif' : 'Pasif'} · plan dışı kapı türü: {door.type}</p>
              {door.placed && isLinked(door) && <>
                <ul className="space-y-1">{passages(plan.areas, door).map(item => <li key={item.way} className={item.closed ? 'text-muted line-through' : 'text-ink'}>
                  <span className="text-xs text-muted">{item.way}</span> {item.label}: <strong>{item.closed ? 'kapalı' : item.meaning}</strong>
                </li>)}</ul>
                <label className="block font-bold text-muted">Geçiş yönü
                  <select className={input} value={door.oneWay} disabled={!editable} onChange={event => changeDoor(door.id, { oneWay: event.target.value })}>
                    {ONE_WAY.map(way => <option key={way} value={way}>{WAY_LABELS[way]}</option>)}
                  </select>
                </label>
              </>}
              {door.placed && !isLinked(door) && <p><strong className="text-danger">Bölge sınırında değil</strong></p>}
              {!door.placed && <p className="text-muted">Plana yerleştirilmedi.</p>}
              <p className="text-muted">Yetkili aktif personel: <strong>{door.permitted ?? 'kaydedince görünür'}</strong></p>
              {admin && <p className="text-xs text-muted">Yetkileri <Link className="text-info underline" to="/personel/toplu">Toplu İşlemler</Link> veya <Link className="text-info underline" to="/personel/duzenleme">Personel Düzenleme</Link> üzerinden düzenleyin.</p>}
              {editable && door.placed && <button type="button" onClick={() => { created.current.delete(door.id); changeDoor(door.id, unplace(door)); }} className="px-3 py-1 rounded-lg bg-danger-soft text-danger font-bold">Plandan kaldır</button>}
            </section>}

            <section className={`${card} space-y-3`} aria-label="Yerleştirilmemiş kapılar">
              <h2 className="font-bold text-ink">Yerleştirilmemiş kapılar ({unplaced.length})</h2>
              {!unplaced.length && <p className="text-sm text-muted">Tüm kapılar planda.</p>}
              <ul className="space-y-2 max-h-80 overflow-auto">
                {unplaced.map(item => <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0"><span className="font-bold text-ink break-words">{item.name}</span><span className="block text-xs text-muted">{item.type}{item.active ? '' : ' · Pasif'}</span></span>
                  {editable && <button type="button" disabled={!floorAreas.length} onClick={() => { chooseTool('select'); setPlacing(item.id); setSelected({ kind: 'door', key: item.id }); }} className={`px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-50 ${placing === item.id ? 'bg-cyan-700 text-white' : 'bg-info-soft text-info'}`}>Yerleştir</button>}
                </li>)}
              </ul>
              {editable && !floorAreas.length && unplaced.length > 0 && <p className="text-xs text-muted">Kapı yerleştirmek için önce bu kata bölge ekleyin.</p>}
            </section>
          </aside>
        </div>

        <ConfirmAction isOpen={Boolean(floorToRemove)} title="Katı Sil" onClose={() => setFloorToRemove(null)} onConfirm={() => dropFloor(floorToRemove)} confirmLabel="Katı sil">
          <p><strong>{floorName(floorToRemove)}</strong> katı {areasOn(plan.areas, floorToRemove).length} bölgesiyle birlikte silinecek; bu kattaki kapılar plandan kaldırılır. Değişiklik planı kaydedince kalıcı olur.</p>
        </ConfirmAction>
      </>}
    </div>
  );
}

export default Facility;
