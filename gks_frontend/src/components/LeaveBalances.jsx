import { useState } from 'react';
import api from '../api/axios';
import { useLiveList } from '../hooks/useLiveList';
import { usePendingAction } from '../hooks/usePendingAction';
import { canWrite } from '../utils/session';
import AlertMessage from './AlertMessage';
import CustomDataGrid from './CustomDataGrid';
import Modal from './Modal';

const UPDATE_EVENTS = ['leaves_updated', 'users_updated', 'shifts_updated', 'holidays_updated'];
const day = value => value ? new Date(value).toLocaleDateString('tr-TR', { timeZone: 'UTC' }) : '—';

// Annual leave entitlement per active person (Labor Law 4857 art. 53), computed by the API.
export default function LeaveBalances() {
  const { rows, loading, error, refresh } = useLiveList('/leaves/balances', UPDATE_EVENTS);
  const { pending, run } = usePendingAction();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ devir_gun: '', devir_tarihi: '' });
  const [message, setMessage] = useState({ text: '', type: '' });

  const open = row => {
    setMessage({ text: '', type: '' });
    setForm({ devir_gun: row.Devir_Gun ?? '', devir_tarihi: row.Devir_Tarihi ?? '' });
    setEditing(row);
  };
  const save = (body, done) => run(async () => {
    try {
      await api.put(`/leaves/balances/${editing.User_ID}`, body);
      setMessage({ text: done, type: 'success' });
      setEditing(null);
      refresh();
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'İşlem başarısız oldu.', type: 'error' });
    }
  });
  const submit = e => {
    e.preventDefault();
    save({ devir_gun: Number(form.devir_gun), devir_tarihi: form.devir_tarihi }, 'İzin devri kaydedildi.');
  };

  const colDefs = [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 110 },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 160, cellClass: 'font-bold text-ink' },
    { field: 'Departman', headerName: 'Departman', width: 140 },
    { field: 'Kalan', headerName: 'Kalan', width: 110, cellClass: ({ value }) => value < 0 ? 'font-bold text-danger' : 'font-bold text-ink' },
    { field: 'Kidem_Yil', headerName: 'Kıdem (yıl)', width: 135, valueFormatter: ({ data, value }) => data.Giris_Tarihi_Yok ? 'Giriş tarihi yok' : value },
    { headerName: 'Devir', width: 175, valueGetter: ({ data }) => data.Devir_Tarihi ? `${data.Devir_Gun} gün · ${day(data.Devir_Tarihi)}` : '—' },
    { field: 'Hak_Edilen', headerName: 'Hak Edilen', width: 135 },
    { field: 'Kullanilan', headerName: 'Kullanılan', width: 135 },
    { field: 'Bekleyen', headerName: 'Onay Bekleyen', width: 155 },
    { headerName: 'Sonraki Hak', width: 180, valueGetter: ({ data }) => data.Giris_Tarihi_Yok ? '—' : `${day(data.Sonraki_Hak_Tarihi)} · ${data.Sonraki_Hak_Gun} gün` },
    ...(canWrite() ? [{
      headerName: 'İşlemler', width: 110, pinned: 'right', sortable: false, filter: false,
      cellRenderer: ({ data }) => <button type="button" disabled={pending || Boolean(editing)} onClick={() => open(data)} className="btn btn-sm btn-secondary">Devir</button>,
    }] : []),
  ];

  return (
    <section aria-labelledby="leave-balance-title" className="card p-4 flex flex-col h-[60vh]">
      <div className="p-2">
        <h2 id="leave-balance-title" className="text-sm font-semibold text-ink">{loading ? 'Yıllık izin bakiyeleri yükleniyor…' : `Yıllık izin bakiyeleri (${rows.length})`}</h2>
        <p className="text-sm text-muted">Kıdem 1–5 yıl 14, 6–14 yıl 20, 15 yıl ve üzeri 26 gün; önceki çalışma dönemleri kıdeme eklenir. Kullanılan günler vardiya çalışma günlerinden resmi tatiller çıkarılarak sayılır. Devir girilmişse kalan = devir + o tarihten sonraki haklar − o tarihten itibaren kullanılan.</p>
      </div>
      <AlertMessage message={editing ? '' : message.text} type={message.type} />
      {error && <p role="alert" className="text-danger mb-2">{error} <button type="button" onClick={refresh} className="underline">Tekrar dene</button></p>}
      <CustomDataGrid rowData={rows} columnDefs={colDefs} exportFileName="GKS_Yillik_Izin_Bakiyeleri" getRowId={params => params.data.User_ID} />
      <Modal isOpen={Boolean(editing)} title="Yıllık İzin Devri" onClose={() => { if (!pending) setEditing(null); }}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink"><strong>{editing?.Ad_Soyad}</strong> için belirtilen tarihteki kalan yıllık izin. Bu tarihten önceki izinler ve yıldönümleri bakiyeye ayrıca eklenmez.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="field-label" htmlFor="carry-days">Devreden gün *</label><input id="carry-days" type="number" required min={-365} max={365} step={1} value={form.devir_gun} onChange={e => setForm({ ...form, devir_gun: e.target.value })} className="field" /></div>
            <div><label className="field-label" htmlFor="carry-date">Devir tarihi *</label><input id="carry-date" type="date" required value={form.devir_tarihi} onChange={e => setForm({ ...form, devir_tarihi: e.target.value })} className="field" /></div>
          </div>
          <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
          <div className="flex flex-wrap justify-end gap-3">
            {editing?.Devir_Tarihi && <button type="button" disabled={pending} onClick={() => save({ devir_gun: null, devir_tarihi: null }, 'İzin devri kaldırıldı.')} className="btn bg-danger-soft text-danger mr-auto">Devri Kaldır</button>}
            <button type="button" disabled={pending} onClick={() => setEditing(null)} className="btn btn-secondary">Vazgeç</button>
            <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
