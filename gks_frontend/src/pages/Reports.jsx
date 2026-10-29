import { socket } from '../api/socket';
import { businessDate } from '../utils/dates';
import AdminForm from '../components/AdminForm';
import { usePendingAction } from '../hooks/usePendingAction';
import AlertMessage from '../components/AlertMessage';
import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api/axios';
import { useSearchParams } from 'react-router-dom';

// ORTAK BİLEŞENLER
import CustomDataGrid from '../components/CustomDataGrid';
import Modal from '../components/Modal'; // YENİ: Modal bileşeni

const extractTime = (val) => {
  if (!val) return '-';
  if (typeof val === 'string' && val.includes('T')) {
    return val.split('T')[1].substring(0, 5);
  }
  return val.substring(0, 5);
};

function Reports() {
  const gridRef = useRef();
  const { pending, run } = usePendingAction();
  const [message, setMessage] = useState({ text: '', type: '' });
  const today = businessDate();
  // Links such as the door simulation's "Bu günün puantajı" pass ?tarih=.
  const [searchParams] = useSearchParams();
  const linkedDate = searchParams.get('tarih');

  const [selectedDate, setSelectedDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(linkedDate || '') ? linkedDate : today);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportError, setReportError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [approvalData, setApprovalData] = useState({ onaylanan_dk: 0, durum: 'Onaylandı', aciklama: '' });

  const handleOpenApproval = (data) => {
    setMessage({ text: '', type: '' });
    setSelectedRow(data);
    setApprovalData({
      onaylanan_dk: data.Mesai_Durumu === 'Onaylandı' ? (data.Onaylanan_Dk ?? 0) : data.Hesaplanan_Dk,
      durum: data.Mesai_Durumu !== 'Bekliyor' ? data.Mesai_Durumu : 'Onaylandı',
      aciklama: data.Mesai_Aciklama || ''
    });
    setShowApprovalModal(true);
  };

  const handleApprovalSubmit = async (e) => {
    e.preventDefault();
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        await api.post('/overtimes/approve', {
          user_id: selectedRow.User_ID,
          tarih: selectedDate,
          hesaplanan_dk: selectedRow.Hesaplanan_Dk,
          onaylanan_dk: approvalData.durum === 'Reddedildi' ? 0 : approvalData.onaylanan_dk,
          durum: approvalData.durum,
          aciklama: approvalData.aciklama
        });
        setMessage({ text: 'Mesai kararı kaydedildi.', type: 'success' });
        setShowApprovalModal(false);
        fetchReport();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'Mesai onayı kaydedilemedi.', type: 'error' });
      }
    });
  };

  const fetchReport = () => {
    setLoading(true);
    setReportError('');
    setReportData([]);
    setRefresh(value => value + 1);
  };

  const changeReportDate = (value) => {
    setSelectedDate(value);
    fetchReport();
  };

  useEffect(() => {
    const controller = new AbortController();
    api.get('/reports/daily-attendance', { params: { tarih: selectedDate }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setReportData(response.data); })
      .catch(error => {
        if (!controller.signal.aborted) setReportError(error.response?.data?.message || 'Rapor yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedDate, refresh]);

  useEffect(() => {
    const reload = () => {
      setLoading(true);
      setReportError('');
      setReportData([]);
      setRefresh(value => value + 1);
    };
    const events = ['overtimes_updated', 'leaves_updated', 'users_updated', 'system_updated', 'new_rfid_log', 'connect'];
    events.forEach(event => socket.on(event, reload));
    return () => events.forEach(event => socket.off(event, reload));
  }, []);

  const colDefs = useMemo(() => [
    { field: 'Sicil_No', headerName: 'Sicil No', width: 110, pinned: 'left' },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 160, pinned: 'left', cellClass: 'font-bold text-ink' },
    {
      headerName: 'Tarih',
      valueGetter: () => { return selectedDate.split('-').reverse().join('.'); },
      width: 110, cellClass: 'text-muted font-medium'
    },
    { field: 'Departman', headerName: 'Departman', width: 130 },
    {
      field: 'Vardiya_Adi', headerName: 'Vardiya', width: 150,
      cellRenderer: (params) => params.value ? <span className="font-bold text-ink">{params.value}</span> : <span className="text-muted italic">Atanmamış</span>
    },
    {
      headerName: 'Vardiya Saatleri',
      valueGetter: (params) => {
        if (!params.data.Vardiya_Adi) return '-';
        const bas = extractTime(params.data.Mesai_Baslangic);
        const bit = extractTime(params.data.Mesai_Bitis);
        return `${bas} - ${bit}`;
      },
      width: 140, cellClass: 'font-mono text-muted font-bold'
    },
    {
      headerName: 'Gerçekleşen',
      valueGetter: (params) => {
        const giris = extractTime(params.data.Ilk_Giris);
        const cikis = extractTime(params.data.Son_Cikis);
        return `${giris} / ${cikis}`;
      },
      width: 140, cellClass: 'font-mono text-ink font-bold'
    },
    {
      field: 'Gec_Kalma_Dk', headerName: 'Geç', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-danger font-black">+{dk}dk</span>;
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Erken_Cikma_Dk', headerName: 'Erken', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-warning font-black">{dk}dk</span>;
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Fazla_Mesai_Dk', headerName: 'Hak Edilen Mesai', width: 140,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) {
          const saat = Math.floor(dk / 60); const dakika = dk % 60;
          const text = saat > 0 ? `${saat}s ${dakika}d` : `${dk}dk`;
          return <span className="text-info font-black">+{text}</span>;
        }
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Toplam_Yemek_Dk', headerName: 'Yemek', width: 100,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="font-bold text-ink">{dk} dk</span>;
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Toplam_Mola_Dk', headerName: 'Mola', width: 100,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="font-bold text-ink">{dk} dk</span>;
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Mola_Asimi_Dk', headerName: 'Aşım', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-danger font-black">+{dk}dk</span>;
        return <span className="text-muted">-</span>;
      }
    },
    {
      field: 'Durum', headerName: 'Durum Özeti', width: 200,
      cellRenderer: (params) => {
        const text = params.value;
        let colorClass = 'bg-surface-3 text-ink';

        if (text === 'Normal') colorClass = 'bg-success-soft text-success border border-success-line';
        else if (text === 'İzin Çakışması') colorClass = 'bg-danger-soft text-danger border border-danger-line';
        else if (text.includes('Geç Kaldı') || text.includes('Devamsız') || text.includes('Mola Aşımı')) colorClass = 'bg-danger-soft text-danger border border-danger-line';
        else if (text.includes('Erken Çıktı')) colorClass = 'bg-warning-soft text-warning border border-warning-line';
        else if (text.includes('Çıkış Yok') || text.includes('Çıkış Okutulmadı')) colorClass = 'bg-warning-soft text-warning border border-warning-line';
        else if (text === 'Hafta Tatili') colorClass = 'bg-surface-3 text-muted border border-line';
        else if (text === 'Tatil Mesaisi') colorClass = 'bg-teal-100 text-teal-700 border border-teal-200';
        else if (text === 'Yıllık İzin' || text === 'Mazeret İzni' || text === 'Ücretsiz İzin') colorClass = 'bg-info-soft text-info border border-info-line';
        else if (text === 'Raporlu') colorClass = 'bg-purple-100 text-purple-700 border border-purple-200';

        return <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${colorClass}`}>{text}</span>;
      }
    },
    {
      headerName: 'İşlem', width: 100, sortable: false, filter: false, pinned: 'right',
      cellRenderer: (params) => {
        if (params.data.Izin_Cakismasi) return <span className="text-xs text-danger">İzinleri düzeltin</span>;
        if(params.data.Hesaplanan_Dk > 0 || params.data.Mesai_Durumu === 'Onaylandı') {
           return (
             <button onClick={() => handleOpenApproval(params.data)} className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded hover:bg-primary-hover transition-colors mt-1">
               İncele
             </button>
           );
        }
        return null;
      }
    }
  ], [selectedDate]);

  return (
    <div className="space-y-6 relative mt-8">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-surface p-6 rounded-2xl shadow-sm border border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Puantaj</h1>
          <p className="text-muted text-sm mt-1">Personellerin giriş-çıkış hareketlerini, yemek sürelerini ve mola uyumlarını inceleyin.</p>
        </div>

        <div className="flex items-end space-x-3">
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="reports-field-1">Rapor Tarihi</label>
            <input id="reports-field-1" type="date" value={selectedDate} onChange={(e) => changeReportDate(e.target.value)} className="px-4 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent" />
          </div>

          <button onClick={fetchReport} disabled={loading} className="px-6 py-2 bg-primary hover:bg-primary-hover text-white font-bold text-sm rounded-lg transition-colors">
            {loading ? 'Hesaplanıyor...' : 'Yenile'}
          </button>


        </div>
      </div>

      {reportData.some(row => row.Izin_Cakismasi) && <p role="alert" className="p-3 bg-warning-soft text-ink rounded-lg">Aynı gün için birden fazla onaylı izin var. Bu satırlarda hesaplama ve yeni mesai kararı bekletilir. Önce İzinler ekranındaki çakışan kayıtları düzeltin; önceki mesai kararları korunur.</p>}
      {reportError && <p role="alert" className="p-3 bg-danger-soft text-danger rounded-lg">{reportError}</p>}
      {loading && <p role="status" className="text-sm text-muted">Rapor yükleniyor…</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="text-xs font-bold text-muted mb-1">Toplam Personel</div>
          <div className="text-2xl font-black text-ink">{reportData.length}</div>
        </div>
        <div className="bg-surface p-4 rounded-xl border border-success-line shadow-sm">
          <div className="text-xs font-bold text-success mb-1">Kurallara Uyanlar</div>
          <div className="text-2xl font-black text-success">{reportData.filter(r => r.Durum === 'Normal').length}</div>
        </div>
        <div className="bg-surface p-4 rounded-xl border border-danger-line shadow-sm">
          <div className="text-xs font-bold text-danger mb-1">Geç Kalan / Mola Aşan</div>
          <div className="text-2xl font-black text-danger">{reportData.filter(r => r.Durum.includes('Geç Kaldı') || r.Durum.includes('Mola Aşımı')).length}</div>
        </div>
        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="text-xs font-bold text-muted mb-1">Devamsız</div>
          <div className="text-2xl font-black text-ink">{reportData.filter(r => r.Durum === 'Devamsız').length}</div>
        </div>
      </div>

      <AlertMessage message={message.text} type={message.type} />
      <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden flex flex-col p-4 h-[60vh]">
        <CustomDataGrid
          ref={gridRef}
          exportFileName={`PDKS_Raporu_${selectedDate}`}
          rowData={reportData}
          columnDefs={colDefs}
          getRowId={(params) => params.data.User_ID}
          rowHeight={60}
        />
      </div>

      {/* --- MESAİ ONAY MODALI (YENİ YAPI) --- */}
      <Modal isOpen={showApprovalModal} onClose={() => { if (!pending) setShowApprovalModal(false); }} title="Mesai İnceleme" maxWidth="max-w-sm">
        {selectedRow && (
          <>
            <p className="text-sm text-muted mb-4 font-bold">{selectedRow.Ad_Soyad}</p>
            <div className="bg-info-soft p-3 rounded-lg border border-info-line mb-4 flex justify-between items-center">
              <span className="text-sm font-bold text-info">Sistemin Ölçtüğü:</span>
              <span className="text-lg font-black text-info">{selectedRow.Hesaplanan_Dk} Dakika</span>
            </div>

            <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
            <AdminForm disabled={pending} onSubmit={handleApprovalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1" htmlFor="reports-field-2">Kararınız</label>
                <select id="reports-field-2"
                  value={approvalData.durum}
                  onChange={(e) => setApprovalData({...approvalData, durum: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg outline-none font-bold text-ink focus:ring-2 focus:ring-accent"
                >
                  <option value="Onaylandı">Mesaiyi Onayla</option>
                  <option value="Reddedildi">Mesaiyi Reddet (Ödenmeyecek)</option>
                </select>
              </div>

              {approvalData.durum === 'Onaylandı' && (
                <div>
                  <label className="block text-xs font-bold text-muted mb-1" htmlFor="reports-field-3">Onaylanan Süre (Dakika)</label>
                  <input id="reports-field-3"
                    type="number"
                    value={approvalData.onaylanan_dk}
                    onChange={(e) => setApprovalData({...approvalData, onaylanan_dk: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent"
                    required
                    min="0"
                    step="1"
                    max={Math.min(2880, selectedRow.Hesaplanan_Dk + 120)}
                  />
                  <p className="text-[10px] text-muted mt-1">Sıfır dakika onaylanabilir. Üst sınır hesaplanan sürenin 120 dakika fazlasıdır.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-muted mb-1" htmlFor="reports-field-4">Yönetici Notu (Opsiyonel)</label>
                <input id="reports-field-4" maxLength={255}
                  type="text"
                  value={approvalData.aciklama}
                  onChange={(e) => setApprovalData({...approvalData, aciklama: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Örn: Proje yetiştirildi..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowApprovalModal(false)} className="px-4 py-2 bg-surface-3 font-bold rounded-lg hover:bg-surface-3 text-sm">İptal</button>
                <button type="submit" className={`px-4 py-2 text-white font-bold rounded-lg text-sm ${approvalData.durum === 'Onaylandı' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {pending ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </AdminForm>
          </>
        )}
      </Modal>
    </div>
  );
}

export default Reports;
