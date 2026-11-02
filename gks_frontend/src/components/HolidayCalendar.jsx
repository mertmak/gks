import { useState } from 'react';
import api from '../api/axios';
import { useLiveList } from '../hooks/useLiveList';
import { usePendingAction } from '../hooks/usePendingAction';
import { canWrite } from '../utils/session';
import AdminForm from './AdminForm';
import AlertMessage from './AlertMessage';
import ConfirmAction from './ConfirmAction';
import CustomDataGrid from './CustomDataGrid';

const UPDATE_EVENTS = ['holidays_updated'];
const day = value => new Date(value).toLocaleDateString('tr-TR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

// Official holidays: a shift day on one of these dates is "Resmi Tatil" when absent, "Tatil Mesaisi" when worked.
export default function HolidayCalendar() {
  const { rows, loading, error, refresh } = useLiveList('/holidays', UPDATE_EVENTS);
  const { pending, run } = usePendingAction();
  const [message, setMessage] = useState({ text: '', type: '' });
  const [form, setForm] = useState({ tarih: '', tatil_adi: '' });
  const [removing, setRemoving] = useState(null);

  const submit = e => {
    e.preventDefault();
    return run(async () => {
      try {
        await api.post('/holidays', form);
        setMessage({ text: 'Resmi tatil eklendi.', type: 'success' });
        setForm({ tarih: '', tatil_adi: '' });
        refresh();
      } catch (err) {
        setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
      }
    });
  };
  const remove = () => run(async () => {
    try {
      await api.delete(`/holidays/${removing.ID}`);
      setMessage({ text: 'Resmi tatil silindi.', type: 'success' });
      setRemoving(null);
      refresh();
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
    }
  });

  const colDefs = [
    { field: 'Tarih', headerName: 'Tarih', width: 260, valueFormatter: ({ value }) => day(value) },
    { field: 'Tatil_Adi', headerName: 'Tatil', flex: 1, minWidth: 200, cellClass: 'font-bold text-ink' },
    ...(canWrite() ? [{
      headerName: 'İşlemler', width: 110, sortable: false, filter: false,
      cellRenderer: ({ data }) => <button type="button" disabled={pending || Boolean(removing)} onClick={() => { setMessage({ text: '', type: '' }); setRemoving(data); }} className="btn btn-sm bg-danger-soft text-danger">Sil</button>,
    }] : []),
  ];

  return (
    <section aria-labelledby="holiday-title" className="card space-y-4">
      <div>
        <h2 id="holiday-title" className="text-lg font-semibold text-ink">Resmi Tatiller</h2>
        <p className="text-sm text-muted">Bu günlerde vardiyası olup gelmeyen personel puantajda Resmi Tatil, gelen personel Tatil Mesaisi sayılır.</p>
      </div>
      <AlertMessage message={removing ? '' : message.text} type={message.type} />
      <AdminForm onSubmit={submit} disabled={pending || Boolean(removing)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div><label className="field-label" htmlFor="holiday-date">Tarih *</label><input id="holiday-date" type="date" required value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} className="field" /></div>
        <div className="md:col-span-2"><label className="field-label" htmlFor="holiday-name">Tatil Adı *</label><input id="holiday-name" type="text" required maxLength={100} value={form.tatil_adi} onChange={e => setForm({ ...form, tatil_adi: e.target.value })} placeholder="Örn: Cumhuriyet Bayramı" className="field" /></div>
        <button type="submit" className="btn btn-primary">{pending ? 'Kaydediliyor…' : 'Tatil Ekle'}</button>
      </AdminForm>
      <p className="text-sm font-semibold text-ink">{loading ? 'Liste yükleniyor…' : `${rows.length} gün`}</p>
      {error && <p role="alert" className="text-danger">{error} <button type="button" onClick={refresh} className="underline">Tekrar dene</button></p>}
      <div className="h-80 flex flex-col">
        <CustomDataGrid rowData={rows} columnDefs={colDefs} exportFileName="GKS_Resmi_Tatiller" getRowId={params => params.data.ID} />
      </div>
      <ConfirmAction isOpen={Boolean(removing)} title="Resmi Tatili Sil" pending={pending} error={message.type === 'error' ? message.text : ''} onClose={() => setRemoving(null)} onConfirm={remove}>
        <p><strong>{removing?.Tatil_Adi}</strong> ({removing && day(removing.Tarih)}) silinecek.</p>
        <p>O günün puantajı yeniden normal iş günü olarak hesaplanır; onaylanmış mesai kararları değişmez.</p>
      </ConfirmAction>
    </section>
  );
}
