import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { socket } from '../api/socket';
import CustomDataGrid from '../components/CustomDataGrid';
import PageHeader from '../components/ui/PageHeader';

const EVENTS = ['new_rfid_log', 'users_updated', 'connect'];
const PLACES = ['Bina içi', 'Yemekhane', 'Mola alanı'];
const stamp = (value, day) => !value ? '' : value.slice(0, 10) === day ? value.slice(11, 16) : `${value.slice(8, 10)}.${value.slice(5, 7)} ${value.slice(11, 16)}`;

// Personnel inside the building now or at a chosen moment: an emergency/evacuation list.
export default function Presence() {
  // Keeps the last list on screen while a live refresh is loading, so the grid does not blink on every read.
  const [query, setQuery] = useState({});
  const [revision, setRevision] = useState(0);
  const requestKey = `${JSON.stringify(query)}#${revision}`;
  const [done, setDone] = useState({ key: '', result: null, error: '' });
  const { result, error } = done;
  const loading = done.key !== requestKey;
  const refresh = () => setRevision(v => v + 1);
  const search = next => { setQuery(next); refresh(); };
  useEffect(() => {
    const controller = new AbortController();
    api.get('/presence', { params: query, signal: controller.signal })
      .then(response => setDone({ key: requestKey, result: response.data, error: '' }))
      .catch(err => { if (!controller.signal.aborted) setDone(d => ({ key: requestKey, result: d.result, error: err.response?.data?.message || 'Liste yüklenemedi. Lütfen tekrar deneyin.' })); });
    return () => controller.abort();
  }, [query, requestKey]);
  useEffect(() => {
    const reload = () => setRevision(v => v + 1);
    EVENTS.forEach(event => socket.on(event, reload));
    return () => EVENTS.forEach(event => socket.off(event, reload));
  }, []);
  const [form, setForm] = useState({ tarih: '', saat: '' });
  const grid = useRef();
  // Times are shown without the date when they fall on the selected day.
  const people = useMemo(() => (result?.kisiler || []).map(p => ({ ...p, Giris: stamp(p.Giris_Zamani, result.tarih), Son: stamp(p.Son_Okutma, result.tarih) })), [result]);
  const counts = Object.fromEntries(PLACES.map(place => [place, people.filter(p => p.Konum === place).length]));
  const departments = Object.entries(people.reduce((acc, p) => ({ ...acc, [p.Departman || 'Departmansız']: (acc[p.Departman || 'Departmansız'] || 0) + 1 }), {}))
    .sort(([a], [b]) => a.localeCompare(b, 'tr'));

  const columns = useMemo(() => [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 110 },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 170, cellClass: 'font-bold text-ink' },
    { field: 'Departman', headerName: 'Departman', width: 150 },
    { field: 'Konum', headerName: 'Konum', width: 130 },
    { field: 'Giris', headerName: 'Giriş', width: 120 },
    { field: 'Son_Kapi', headerName: 'Son Okutulan Kapı', flex: 1, minWidth: 170 },
    { field: 'Son', headerName: 'Son Okutma', width: 130 },
  ], []);

  const apply = event => {
    event.preventDefault();
    search(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const now = () => { setForm({ tarih: '', saat: '' }); search({}); };
  const print = () => {
    const gridApi = grid.current?.api;
    gridApi?.setGridOption('domLayout', 'print');
    // Let the grid render every row before the print dialog snapshots the page.
    setTimeout(() => { window.print(); gridApi?.setGridOption('domLayout', 'normal'); }, 100);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="İçeridekiler" description="Ana girişten okutup henüz ana çıkıştan okutmayan personel. Acil durumda tahliye ve sayım listesi olarak yazdırılabilir. Son 24 saatteki okutmalar esas alınır." />

      <form onSubmit={apply} className="card flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="field-label" htmlFor="presence-date">Tarih</label>
          <input id="presence-date" type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="presence-time">Saat</label>
          <input id="presence-time" type="time" value={form.saat} onChange={e => setForm({ ...form, saat: e.target.value })} className="field" />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary">Göster</button>
        <button type="button" onClick={now} disabled={loading} className="btn btn-secondary">Şimdi</button>
        <button type="button" onClick={print} disabled={!people.length} className="btn btn-secondary ml-auto">Yazdır</button>
      </form>

      {error && <p role="alert" className="p-3 bg-danger-soft text-danger rounded-lg">{error} <button type="button" onClick={refresh} className="underline">Tekrar dene</button></p>}

      {result?.tarih && <>
        <section aria-label="İçerideki kişi sayıları" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card"><p className="text-sm text-muted">İçeride</p><p className="text-3xl font-bold text-ink">{people.length}</p></div>
          {PLACES.map(place => <div key={place} className="card"><p className="text-sm text-muted">{place}</p><p className="text-3xl font-bold text-ink">{counts[place]}</p></div>)}
        </section>
        {departments.length > 0 && <ul aria-label="Departmana göre" className="flex flex-wrap gap-2">
          {departments.map(([name, count]) => <li key={name} className="badge bg-surface-3 text-ink border-line">{name}: {count}</li>)}
        </ul>}
        <section aria-labelledby="presence-title" className="card p-4 flex flex-col h-[60vh] print:h-auto print:shadow-none">
          <h2 id="presence-title" className="p-2 text-sm font-semibold text-ink">
            {result.tarih.split('-').reverse().join('.')} {result.saat} itibarıyla içeride {people.length} kişi
          </h2>
          <CustomDataGrid ref={grid} rowData={people} columnDefs={columns} getRowId={p => p.data.User_ID} exportFileName={`GKS_Iceridekiler_${result.tarih}_${result.saat.replace(':', '')}`} />
        </section>
      </>}
      {loading && !result?.tarih && <p className="text-sm text-muted">Yükleniyor…</p>}
    </div>
  );
}
