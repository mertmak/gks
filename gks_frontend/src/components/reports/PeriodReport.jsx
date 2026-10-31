import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { socket } from '../../api/socket';
import { fetchAllUsers } from '../../api/lists';
import { businessDate, shiftPeriod } from '../../utils/dates';
import { prepareExcel } from '../../utils/excel';
import CustomDataGrid from '../CustomDataGrid';
import AutocompleteSearch from '../AutoCompleteSearch';

const KEYS = ['donem', 'baslangic', 'bitis', 'kapsam', 'personel', 'departman'];
const DONEM = { hafta: 'Hafta', ay: 'Ay', ozel: 'Özel aralık' };
const KAPSAM = { tumu: 'Tüm personel', departman: 'Departman', kisi: 'Tek kişi', secili: 'Seçili kişiler' };
const hours = dk => Math.round(dk / 6) / 10;
const day = v => v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : '';
const stamp = v => v ? `${v.slice(8, 10)}.${v.slice(5, 7)} ${v.slice(11, 16)}` : '-';

// [header, value] pairs shared by the grids and the Excel sheets.
const SUMMARY = [
  ['Sicil No', r => r.Sicil_No], ['Ad Soyad', r => r.Ad_Soyad], ['Departman', r => r.Departman],
  ['Gün', r => r.Gun], ['Çalışılan Gün', r => r.Calisilan_Gun], ['Devamsız', r => r.Devamsiz_Gun], ['İzinli', r => r.Izinli_Gun],
  ['Hafta Tatili', r => r.Hafta_Tatili], ['Geç Kalma (adet)', r => r.Gec_Kalma_Sayisi], ['Geç (dk)', r => r.Gec_Kalma_Dk],
  ['Erken Çıkış (dk)', r => r.Erken_Cikma_Dk], ['Çalışma (saat)', r => hours(r.Calisma_Dk)], ['Onaylı Fazla Mesai (saat)', r => hours(r.Fazla_Mesai_Dk)],
  ['Yemek (dk)', r => r.Yemek_Dk], ['Mola (dk)', r => r.Mola_Dk], ['Mola Aşımı (dk)', r => r.Mola_Asimi_Dk],
];
const DAILY = [
  ['Tarih', r => day(r.TarihStr)], ['Sicil No', r => r.Sicil_No], ['Ad Soyad', r => r.Ad_Soyad], ['Departman', r => r.Departman],
  ['Vardiya', r => r.Vardiya_Adi || 'Atanmamış'], ['İlk Giriş', r => stamp(r.Ilk_Giris)], ['Son Çıkış', r => stamp(r.Son_Cikis)], ['Durum', r => r.Durum],
  ['Geç (dk)', r => r.Gec_Kalma_Dk], ['Erken Çıkış (dk)', r => r.Erken_Cikma_Dk], ['Onaylı Fazla Mesai (dk)', r => r.Fazla_Mesai_Dk],
  ['Yemek (dk)', r => r.Toplam_Yemek_Dk], ['Mola (dk)', r => r.Toplam_Mola_Dk], ['Mola Aşımı (dk)', r => r.Mola_Asimi_Dk],
];
const columns = spec => spec.map(([headerName, get], i) => ({ headerName, valueGetter: p => p.data && get(p.data), minWidth: headerName === 'Ad Soyad' ? 190 : i < 3 ? 130 : 110, flex: ['Ad Soyad', 'Departman'].includes(headerName) ? 1 : 0 }));
const sheet = (name, spec, rows) => ({ name, headers: spec.map(([h]) => h), rows: rows.map(r => spec.map(([, get]) => get(r))) });

function periodQuery(params) {
  // Hand-typed links like ?donem=ay fall back to the tab's defaults instead of a 400.
  return { baslangic: businessDate(), kapsam: 'tumu', ...Object.fromEntries(KEYS.map(k => [k, params.get(k) || '']).filter(([, v]) => v)) };
}

function PeriodReport() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => periodQuery(params), [params]);
  const queryKey = new URLSearchParams(query).toString();
  const [form, setForm] = useState(() => ({ donem: 'ay', baslangic: businessDate(), bitis: '', kapsam: 'tumu', personel: '', departman: '', ...query }));
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  // The last finished request; loading = the current request has not finished yet.
  const requestKey = `${queryKey}#${refresh}`;
  const [done, setDone] = useState({ key: '', result: null, error: '' });
  const { result, error } = done;
  const loading = !!queryKey && done.key !== requestKey;
  const [person, setPerson] = useState(null);
  const summaryGrid = useRef();

  useEffect(() => {
    const controller = new AbortController();
    fetchAllUsers({ signal: controller.signal }).then(setUsers).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!queryKey) return;
    const controller = new AbortController();
    api.get('/reports/attendance', { params: Object.fromEntries(new URLSearchParams(queryKey)), signal: controller.signal })
      .then(response => {
        setDone({ key: requestKey, result: response.data, error: '' });
        setPerson(p => p && response.data.ozet.some(r => r.User_ID === p) ? p : null);
      })
      .catch(err => { if (!controller.signal.aborted) setDone({ key: requestKey, result: null, error: err.response?.data?.message || 'Rapor yüklenemedi. Lütfen tekrar deneyin.' }); });
    return () => controller.abort();
  }, [queryKey, requestKey]);

  useEffect(() => {
    const reload = () => setRefresh(v => v + 1);
    const events = ['overtimes_updated', 'leaves_updated', 'users_updated', 'system_updated', 'new_rfid_log', 'connect'];
    events.forEach(event => socket.on(event, reload));
    return () => events.forEach(event => socket.off(event, reload));
  }, []);

  const apply = next => {
    const clean = { ...next };
    if (clean.donem !== 'ozel') delete clean.bitis;
    if (!['kisi', 'secili'].includes(clean.kapsam)) delete clean.personel;
    if (clean.kapsam !== 'departman') delete clean.departman;
    setForm(next);
    setParams(Object.fromEntries(Object.entries(clean).filter(([, v]) => v)));
  };
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const move = dir => apply({ ...form, ...query, ...shiftPeriod({ ...form, ...query }, dir) });

  const selected = form.personel ? form.personel.split(',').map(Number) : [];
  const userName = id => users.find(u => u.ID === id)?.Ad_Soyad || `#${id}`;
  const departments = useMemo(() => [...new Set(users.map(u => u.Departman).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [users]);
  const suggestions = search.length < 2 ? [] : users
    .filter(u => !selected.includes(u.ID) && `${u.Ad_Soyad} ${u.Sicil_No}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))
    .slice(0, 8).map(u => ({ label: u.Ad_Soyad, subLabel: `Sicil: ${u.Sicil_No}${u.Departman ? ` · ${u.Departman}` : ''}`, value: u.ID }));
  const choose = item => {
    setSearch('');
    set({ personel: form.kapsam === 'kisi' ? String(item.value) : [...selected, item.value].slice(0, 100).join(',') });
  };

  const invalid = (form.donem === 'ozel' && (!form.bitis || form.bitis < form.baslangic))
    || (form.kapsam === 'kisi' && selected.length !== 1) || (form.kapsam === 'secili' && !selected.length)
    || (form.kapsam === 'departman' && !form.departman);
  const fileName = result ? `puantaj_${query.kapsam}_${result.baslangic}_${result.bitis}.xlsx` : 'puantaj.xlsx';
  const personRows = result && person ? result.gunler.filter(r => r.User_ID === person) : [];
  // The name is a button so the daily breakdown also opens from the keyboard.
  const summaryColumns = useMemo(() => columns(SUMMARY).map(c => c.headerName !== 'Ad Soyad' ? c : {
    ...c, cellRenderer: p => p.data?.User_ID
      ? <button type="button" onClick={() => setPerson(p.data.User_ID)} className="font-semibold text-accent underline">{p.value}</button>
      : <strong>{p.value}</strong>,
  }), []);
  const dailyColumns = useMemo(() => columns(DAILY), []);
  const print = () => {
    const gridApi = summaryGrid.current?.api;
    gridApi?.setGridOption('domLayout', 'print');
    // Let the grid render every row before the print dialog snapshots the page.
    setTimeout(() => { window.print(); gridApi?.setGridOption('domLayout', 'normal'); }, 100);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={e => { e.preventDefault(); apply(form); }} className="card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end print:hidden">
        <fieldset>
          <legend className="field-label">Dönem</legend>
          <div className="flex rounded-lg border border-line-strong overflow-hidden">
            {Object.entries(DONEM).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={form.donem === value} onClick={() => set({ donem: value, bitis: value === 'ozel' ? (form.bitis || form.baslangic) : '' })}
                className={`flex-1 px-3 py-2 text-sm font-semibold ${form.donem === value ? 'bg-accent text-surface' : 'bg-surface text-ink hover:bg-surface-3'}`}>{label}</button>
            ))}
          </div>
        </fieldset>
        <div className={form.donem === 'ozel' ? 'grid grid-cols-2 gap-2 lg:col-span-2' : ''}>
          <div>
            <label className="field-label" htmlFor="period-start">{form.donem === 'ozel' ? 'Başlangıç' : form.donem === 'hafta' ? 'Haftadaki bir gün' : 'Aydaki bir gün'}</label>
            <input id="period-start" type="date" required value={form.baslangic} onChange={e => set({ baslangic: e.target.value })} className="field" />
          </div>
          {form.donem === 'ozel' && <div>
            <label className="field-label" htmlFor="period-end">Bitiş</label>
            <input id="period-end" type="date" required min={form.baslangic} value={form.bitis} onChange={e => set({ bitis: e.target.value })} aria-describedby="period-end-hint" className="field" />
            <p id="period-end-hint" className="field-hint">En fazla 92 gün.</p>
          </div>}
        </div>
        <div>
          <label className="field-label" htmlFor="period-scope">Kapsam</label>
          <select id="period-scope" value={form.kapsam} onChange={e => set({ kapsam: e.target.value, personel: '' })} className="field">
            {Object.entries(KAPSAM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          {form.kapsam === 'departman' && <>
            <label className="field-label" htmlFor="period-department">Departman</label>
            <select id="period-department" required value={form.departman} onChange={e => set({ departman: e.target.value })} className="field">
              <option value="">Seçin</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </>}
          {['kisi', 'secili'].includes(form.kapsam) && <div className="relative z-20">
            <AutocompleteSearch label={form.kapsam === 'kisi' ? 'Personel' : `Personel ekle (${selected.length}/100)`} placeholder="Ad veya sicil…"
              value={search} onChange={e => setSearch(e.target.value)} suggestions={suggestions} onSelect={choose} disabled={form.kapsam === 'secili' && selected.length >= 100} />
          </div>}
        </div>
        {['kisi', 'secili'].includes(form.kapsam) && selected.length > 0 && <ul aria-label="Seçili personel" className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2">
          {selected.map(id => <li key={id} className="badge bg-surface-3 text-ink border border-line">
            {userName(id)}
            <button type="button" onClick={() => set({ personel: selected.filter(s => s !== id).join(',') })} aria-label={`${userName(id)} kaldır`} className="ml-1 px-1 font-bold">×</button>
          </li>)}
        </ul>}
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-3">
          <button type="submit" disabled={invalid || loading} className="btn btn-primary">{loading ? 'Hesaplanıyor…' : 'Raporu Getir'}</button>
          <button type="button" onClick={() => move(-1)} disabled={!query.baslangic || loading} className="btn btn-secondary">‹ Önceki dönem</button>
          <button type="button" onClick={() => move(1)} disabled={!query.baslangic || loading} className="btn btn-secondary">Sonraki dönem ›</button>
          <button type="button" onClick={print} disabled={!result} className="btn btn-secondary ml-auto">Yazdır</button>
        </div>
      </form>

      {error && <p role="alert" className="p-3 bg-danger-soft text-danger rounded-lg">{error} <button type="button" onClick={() => setRefresh(v => v + 1)} className="underline">Tekrar dene</button></p>}
      {!queryKey && <p className="text-sm text-muted">Dönem ve kapsamı seçip "Raporu Getir"e basın.</p>}

      {result && <>
        <p className="text-sm font-semibold text-ink">
          {day(result.baslangic)} – {day(result.bitis)} · {KAPSAM[query.kapsam]}{query.departman ? `: ${query.departman}` : ''} · {result.ozet.length} kişi
        </p>
        <section aria-label="Dönem özeti" className="card p-2 flex flex-col h-[60vh] print:h-auto print:shadow-none">
          <p className="p-2 text-xs text-muted print:hidden">Bir kişinin adına tıklayınca günlük dökümü aşağıda açılır. Excel dosyası "Özet" ve "Günlük" iki sayfa içerir.</p>
          <CustomDataGrid ref={summaryGrid} rowData={result.ozet} columnDefs={summaryColumns} getRowId={p => p.data.User_ID} rowHeight={44}
            pinnedBottomRowData={result.ozet.length > 1 ? [{ ...result.toplam, Ad_Soyad: 'Toplam' }] : undefined}
            prepareExport={() => prepareExcel([
              sheet('Özet', SUMMARY, result.ozet.length > 1 ? [...result.ozet, { ...result.toplam, Ad_Soyad: 'Toplam' }] : result.ozet),
              sheet('Günlük', DAILY, result.gunler),
            ], fileName)} />
        </section>
        {person && <section aria-label="Günlük döküm" className="card p-2 flex flex-col h-[60vh] print:hidden">
          <div className="flex items-center justify-between p-2">
            <h2 className="font-semibold text-ink">{userName(person)} — günlük döküm</h2>
            <button type="button" onClick={() => setPerson(null)} className="btn btn-sm btn-secondary">Kapat</button>
          </div>
          <CustomDataGrid rowData={personRows} columnDefs={dailyColumns} getRowId={p => p.data.TarihStr} rowHeight={44}
            exportFileName={`puantaj_${userName(person)}_${result.baslangic}_${result.bitis}`} />
        </section>}
      </>}
    </div>
  );
}

export default PeriodReport;
