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
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 160, pinned: 'left', cellClass: 'font-bold text-slate-800' },
    {
      headerName: 'Tarih',
      valueGetter: () => { return selectedDate.split('-').reverse().join('.'); },
      width: 110, cellClass: 'text-slate-500 font-medium'
    },
    { field: 'Departman', headerName: 'Departman', width: 130 },
    {
      field: 'Vardiya_Adi', headerName: 'Vardiya', width: 150,
      cellRenderer: (params) => params.value ? <span className="font-bold text-slate-800">{params.value}</span> : <span className="text-slate-400 italic">Atanmamış</span>
    },
    {
      headerName: 'Vardiya Saatleri',
      valueGetter: (params) => {
        if (!params.data.Vardiya_Adi) return '-';
        const bas = extractTime(params.data.Mesai_Baslangic);
        const bit = extractTime(params.data.Mesai_Bitis);
        return `${bas} - ${bit}`;
      },
      width: 140, cellClass: 'font-mono text-slate-600 font-bold'
    },
    {
      headerName: 'Gerçekleşen',
      valueGetter: (params) => {
        const giris = extractTime(params.data.Ilk_Giris);
        const cikis = extractTime(params.data.Son_Cikis);
        return `${giris} / ${cikis}`;
      },
      width: 140, cellClass: 'font-mono text-slate-700 font-bold'
    },
    {
      field: 'Gec_Kalma_Dk', headerName: 'Geç', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-red-600 font-black">+{dk}dk</span>;
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Erken_Cikma_Dk', headerName: 'Erken', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-orange-500 font-black">{dk}dk</span>;
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Fazla_Mesai_Dk', headerName: 'Hak Edilen Mesai', width: 140,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) {
          const saat = Math.floor(dk / 60); const dakika = dk % 60;
          const text = saat > 0 ? `${saat}s ${dakika}d` : `${dk}dk`;
          return <span className="text-blue-600 font-black">+{text}</span>;
        }
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Toplam_Yemek_Dk', headerName: 'Yemek', width: 100,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="font-bold text-slate-700">{dk} dk</span>;
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Toplam_Mola_Dk', headerName: 'Mola', width: 100,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="font-bold text-slate-700">{dk} dk</span>;
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Mola_Asimi_Dk', headerName: 'Aşım', width: 90,
      cellRenderer: (params) => {
        const dk = params.value;
        if (dk > 0) return <span className="text-red-600 font-black">+{dk}dk</span>;
        return <span className="text-slate-300">-</span>;
      }
    },
    {
      field: 'Durum', headerName: 'Durum Özeti', width: 200,
      cellRenderer: (params) => {
        const text = params.value;
        let colorClass = 'bg-slate-100 text-slate-700';

        if (text === 'Normal') colorClass = 'bg-green-100 text-green-700 border border-green-200';
        else if (text === 'İzin Çakışması') colorClass = 'bg-red-100 text-red-700 border border-red-200';
        else if (text.includes('Geç Kaldı') || text.includes('Devamsız') || text.includes('Mola Aşımı')) colorClass = 'bg-red-100 text-red-700 border border-red-200';
        else if (text.includes('Erken Çıktı')) colorClass = 'bg-orange-100 text-orange-700 border border-orange-200';
        else if (text.includes('Çıkış Yok') || text.includes('Çıkış Okutulmadı')) colorClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200';
        else if (text === 'Hafta Tatili') colorClass = 'bg-slate-100 text-slate-500 border border-slate-200';
        else if (text === 'Tatil Mesaisi') colorClass = 'bg-teal-100 text-teal-700 border border-teal-200';
        else if (text === 'Yıllık İzin' || text === 'Mazeret İzni' || text === 'Ücretsiz İzin') colorClass = 'bg-blue-100 text-blue-700 border border-blue-200';
        else if (text === 'Raporlu') colorClass = 'bg-purple-100 text-purple-700 border border-purple-200';

        return <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${colorClass}`}>{text}</span>;
      }
    },
    {
      headerName: 'İşlem', width: 100, sortable: false, filter: false, pinned: 'right',
      cellRenderer: (params) => {
        if (params.data.Izin_Cakismasi) return <span className="text-xs text-red-700">İzinleri düzeltin</span>;
        if(params.data.Hesaplanan_Dk > 0 || params.data.Mesai_Durumu === 'Onaylandı') {
           return (
             <button onClick={() => handleOpenApproval(params.data)} className="px-3 py-1 bg-slate-900 text-white text-[11px] font-bold rounded hover:bg-slate-800 transition-colors mt-1">
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

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Puantaj</h2>
          <p className="text-slate-500 text-sm mt-1">Personellerin giriş-çıkış hareketlerini, yemek sürelerini ve mola uyumlarını inceleyin.</p>
        </div>

        <div className="flex items-end space-x-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="reports-field-1">Rapor Tarihi</label>
            <input id="reports-field-1" type="date" value={selectedDate} onChange={(e) => changeReportDate(e.target.value)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <button onClick={fetchReport} disabled={loading} className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg transition-colors">
            {loading ? 'Hesaplanıyor...' : 'Yenile'}
          </button>


        </div>
      </div>

      {reportData.some(row => row.Izin_Cakismasi) && <p role="alert" className="p-3 bg-amber-50 text-amber-900 rounded-lg">Aynı gün için birden fazla onaylı izin var. Bu satırlarda hesaplama ve yeni mesai kararı bekletilir. Önce İzinler ekranındaki çakışan kayıtları düzeltin; önceki mesai kararları korunur.</p>}
      {reportError && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{reportError}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">Rapor yükleniyor…</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 mb-1">Toplam Personel</div>
          <div className="text-2xl font-black text-slate-800">{reportData.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-200 shadow-sm">
          <div className="text-xs font-bold text-green-600 mb-1">Kurallara Uyanlar</div>
          <div className="text-2xl font-black text-green-700">{reportData.filter(r => r.Durum === 'Normal').length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <div className="text-xs font-bold text-red-600 mb-1">Geç Kalan / Mola Aşan</div>
          <div className="text-2xl font-black text-red-700">{reportData.filter(r => r.Durum.includes('Geç Kaldı') || r.Durum.includes('Mola Aşımı')).length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 mb-1">Devamsız</div>
          <div className="text-2xl font-black text-slate-700">{reportData.filter(r => r.Durum === 'Devamsız').length}</div>
        </div>
      </div>

      <AlertMessage message={message.text} type={message.type} />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-4 h-[60vh]">
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
            <p className="text-sm text-slate-500 mb-4 font-bold">{selectedRow.Ad_Soyad}</p>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4 flex justify-between items-center">
              <span className="text-sm font-bold text-blue-900">Sistemin Ölçtüğü:</span>
              <span className="text-lg font-black text-blue-700">{selectedRow.Hesaplanan_Dk} Dakika</span>
            </div>

            <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
            <AdminForm disabled={pending} onSubmit={handleApprovalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="reports-field-2">Kararınız</label>
                <select id="reports-field-2"
                  value={approvalData.durum}
                  onChange={(e) => setApprovalData({...approvalData, durum: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg outline-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Onaylandı">Mesaiyi Onayla</option>
                  <option value="Reddedildi">Mesaiyi Reddet (Ödenmeyecek)</option>
                </select>
              </div>

              {approvalData.durum === 'Onaylandı' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="reports-field-3">Onaylanan Süre (Dakika)</label>
                  <input id="reports-field-3"
                    type="number"
                    value={approvalData.onaylanan_dk}
                    onChange={(e) => setApprovalData({...approvalData, onaylanan_dk: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    min="0"
                    step="1"
                    max={Math.min(2880, selectedRow.Hesaplanan_Dk + 120)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Sıfır dakika onaylanabilir. Üst sınır hesaplanan sürenin 120 dakika fazlasıdır.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="reports-field-4">Yönetici Notu (Opsiyonel)</label>
                <input id="reports-field-4" maxLength={255}
                  type="text"
                  value={approvalData.aciklama}
                  onChange={(e) => setApprovalData({...approvalData, aciklama: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Örn: Proje yetiştirildi..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowApprovalModal(false)} className="px-4 py-2 bg-slate-100 font-bold rounded-lg hover:bg-slate-200 text-sm">İptal</button>
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
