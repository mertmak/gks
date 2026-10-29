import { useLiveList } from '../hooks/useLiveList';
import { businessDate, shiftDateDays } from '../utils/dates';
import AdminForm from '../components/AdminForm';
import { usePendingAction } from '../hooks/usePendingAction';
import { readSession } from '../utils/session';
import { useState, useMemo, useRef } from 'react';
import api from '../api/axios';

// ORTAK BİLEŞENLER
import CustomDataGrid from '../components/CustomDataGrid';
import AutocompleteSearch from '../components/AutoCompleteSearch';
import Modal from '../components/Modal';
import ConfirmAction from '../components/ConfirmAction';
import AlertMessage from '../components/AlertMessage';

const ROW_SELECTION = { mode: 'multiRow', checkboxes: true, headerCheckbox: true, selectAll: 'all', enableClickSelection: true };
const SELECTION_COLUMN = { width: 50, pinned: 'left' };

const UPDATE_EVENTS = ['overtimes_updated', 'leaves_updated', 'users_updated', 'system_updated', 'new_rfid_log'];

function Overtimes() {
  const gridRef = useRef();
  const { pending, run } = usePendingAction();
  const isAdmin = readSession()?.role === 'admin';
  const bitTarihi = businessDate();
  const basTarihi = shiftDateDays(bitTarihi, -7);

  const [filters, setFilters] = useState({ baslangic: basTarihi, bitis: bitTarihi });
  const { rows: overtimes, loading, error: listError, refresh: fetchOvertimes, search } = useLiveList('/overtimes', UPDATE_EVENTS, { baslangic: basTarihi, bitis: bitTarihi });
  const [message, setMessage] = useState({ text: '', type: '' });

  const [quickFilterText, setQuickFilterText] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);

  // Bireysel İnceleme Modalı
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [approvalData, setApprovalData] = useState({ onaylanan_dk: 0, durum: 'Onaylandı', aciklama: '' });

  // Sayfa İçi Toplu İşlem Paneli State'leri
  const [bulkData, setBulkData] = useState({ hedef_turu: 'Tumu', hedef_deger: '', durum: 'Onaylandı', aciklama: '' });
  const [bulkSuggestions, setBulkSuggestions] = useState([]);
  const [bulkConfirmation, setBulkConfirmation] = useState(null);

  const searchOvertimes = () => {
    setMessage({ text: '', type: '' });
    setSelectedRows([]);
    search(filters);
  };

  const onSelectionChanged = () => {
    const selectedNodes = gridRef.current.api.getSelectedNodes();
    setSelectedRows(selectedNodes.map(node => node.data));
  };

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
          user_id: selectedRow.User_ID, tarih: selectedRow.TarihStr, hesaplanan_dk: selectedRow.Hesaplanan_Dk,
          onaylanan_dk: approvalData.durum === 'Reddedildi' ? 0 : approvalData.onaylanan_dk,
          durum: approvalData.durum, aciklama: approvalData.aciklama
        });
        setShowApprovalModal(false);
        setMessage({ text: 'Mesai durumu kaydedildi.', type: 'success' });
        fetchOvertimes();
      } catch (error) { setMessage({ text: error.response?.data?.message || 'Mesai kaydedilemedi.', type: 'error' }); }
    });
  };

  const handleBulkSearchChange = (e) => {
    const value = e.target.value;
    setBulkData({ ...bulkData, hedef_deger: value });

    if (value.length >= 2 && bulkData.hedef_turu !== 'Tumu') {
      const lowerVal = value.toLowerCase();
      const uniqueResults = [];
      const seen = new Set();

      overtimes.forEach(row => {
        if (bulkData.hedef_turu === 'Departman' && row.Departman?.toLowerCase().includes(lowerVal)) {
          if (!seen.has(row.Departman)) {
            seen.add(row.Departman);
            uniqueResults.push({ label: row.Departman, subLabel: 'Departman', value: row.Departman });
          }
        } else if (bulkData.hedef_turu === 'Sirket' && row.Sirket?.toLowerCase().includes(lowerVal)) {
          if (!seen.has(row.Sirket)) {
            seen.add(row.Sirket);
            uniqueResults.push({ label: row.Sirket, subLabel: 'Şirket', value: row.Sirket });
          }
        } else if (bulkData.hedef_turu === 'Personel' && (row.Ad_Soyad?.toLowerCase().includes(lowerVal) || row.Sicil_No?.includes(value))) {
          if (!seen.has(row.Sicil_No)) {
            seen.add(row.Sicil_No);
            uniqueResults.push({ label: row.Ad_Soyad, subLabel: `Sicil: ${row.Sicil_No} | ${row.Departman}`, value: row.Sicil_No });
          }
        }
      });
      setBulkSuggestions(uniqueResults.slice(0, 5));
    } else {
      setBulkSuggestions([]);
    }
  };

  const prepareBulkDecision = (rows, decision, description, target) => {
    if (pending || loading || listError || !isAdmin) return;
    setMessage({ text: '', type: '' });
    if (!rows.length) {
      setMessage({ text: 'Girdiğiniz kritere uyan mesai kaydı bulunamadı.', type: 'error' });
      return;
    }
    const dates = rows.map(row => row.TarihStr).sort();
    // Freeze the reviewed selection; live refresh must not add new targets.
    setBulkConfirmation({
      mesailer: rows.map(row => ({ user_id: row.User_ID, tarih: row.TarihStr,
        hesaplanan_dk: row.Hesaplanan_Dk, onaylanan_dk: decision === 'Reddedildi' ? 0 : row.Hesaplanan_Dk })),
      durum: decision, aciklama: description, target,
      people: new Set(rows.map(row => row.User_ID)).size,
      start: dates[0], end: dates.at(-1)
    });
  };

  const handleAdvancedBulkSubmit = (e) => {
    e.preventDefault();
    let targetRows = overtimes;
    const value = bulkData.hedef_deger.trim();
    if (bulkData.hedef_turu === 'Departman') {
      targetRows = overtimes.filter(row => row.Departman === value);
    } else if (bulkData.hedef_turu === 'Sirket') {
      targetRows = overtimes.filter(row => row.Sirket === value);
    } else if (bulkData.hedef_turu === 'Personel') {
      targetRows = overtimes.filter(row => row.Sicil_No === value || row.Ad_Soyad.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'));
      if (new Set(targetRows.map(row => row.User_ID)).size > 1) {
        setMessage({ text: 'Bu isimde birden fazla personel var. Sicil numarasıyla seçim yapın.', type: 'error' });
        return;
      }
    }
    prepareBulkDecision(targetRows, bulkData.durum, bulkData.aciklama,
      bulkData.hedef_turu === 'Tumu' ? 'Yüklenen listedeki tüm mesai kayıtları' : value);
  };

  const handleGridBulkSubmit = () => {
    prepareBulkDecision(selectedRows.filter(row => overtimes.includes(row)),
      'Onaylandı', 'Tablodan Hızlı Onay', 'Tabloda seçilen mesai kayıtları');
  };

  const confirmBulkDecision = async () => {
    if (!bulkConfirmation) return;
    await run(async () => {
      setMessage({ text: '', type: '' });
      try {
        const { mesailer, durum, aciklama } = bulkConfirmation;
        await api.post('/overtimes/approve-bulk', { mesailer, durum, aciklama });
        setMessage({ text: mesailer.length + ' mesai kaydı işlendi.', type: 'success' });
        setBulkConfirmation(null);
        setSelectedRows([]);
        fetchOvertimes();
      } catch (error) {
        setMessage({ text: error.response?.data?.message || 'Toplu işlem başarısız oldu.', type: 'error' });
      }
    });
  };

  const colDefs = useMemo(() => [
    { field: 'TarihStr', headerName: 'Tarih', width: 110, pinned: 'left', cellRenderer: (params) => <span className="text-muted font-bold">{params.value.split('-').reverse().join('.')}</span> },
    { field: 'Sicil_No', headerName: 'Sicil No', width: 100 },
    { field: 'Ad_Soyad', headerName: 'Ad Soyad', flex: 1, minWidth: 160, cellClass: 'font-bold text-ink' },
    { field: 'Departman', headerName: 'Departman / Şirket', flex: 1, minWidth: 150, valueGetter: params => `${params.data.Departman} ${params.data.Sirket ? `(${params.data.Sirket})` : ''}` },
    {
      field: 'Hesaplanan_Dk', headerName: 'Hesaplanan', width: 140,
      cellRenderer: (params) => {
        const dk = params.value; const saat = Math.floor(dk / 60); const dakika = dk % 60;
        return <span className="text-info font-bold">+{saat > 0 ? `${saat}s ${dakika}d` : `${dk}dk`}</span>;
      }
    },
    {
      field: 'Mesai_Durumu', headerName: 'Onay Durumu', width: 140,
      cellRenderer: (params) => {
        const durum = params.value; const onaylanan = params.data.Onaylanan_Dk;
        if (durum === 'Onaylandı') return <span className="px-2 py-1 bg-success-soft text-success text-xs rounded-full font-bold">Onay: {onaylanan}dk</span>;
        if (durum === 'Reddedildi') return <span className="px-2 py-1 bg-danger-soft text-danger text-xs rounded-full font-bold">Reddedildi</span>;
        return <span className="px-2 py-1 bg-warning-soft text-warning text-xs rounded-full font-bold">Bekliyor</span>;
      }
    },
    { field: 'Durum', headerName: 'Puantaj Durumu', width: 175 },
    { field: 'Mesai_Aciklama', headerName: 'Karar Açıklaması', minWidth: 180, tooltipField: 'Mesai_Aciklama' },
    { field: 'Mesai_Islemi_Yapan', headerName: 'Kararı Veren', width: 150 },
    { field: 'Mesai_Islem_Zamani', headerName: 'Karar Zamanı', width: 170,
      valueFormatter: ({ value }) => value ? String(value).slice(0, 19).replace('T', ' ') : '—' },
    {
      headerName: 'İşlem', width: 95, sortable: false, filter: false, pinned: 'right',
      cellRenderer: (params) => (
        <button disabled={params.data.Izin_Cakismasi} title={params.data.Izin_Cakismasi ? 'Önce çakışan izinleri düzeltin.' : undefined} onClick={() => handleOpenApproval(params.data)} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded hover:bg-primary-hover transition-colors">
          İncele
        </button>
      )
    }
  ].filter(column => isAdmin || column.headerName !== ''), [isAdmin]);

  return (
    <div className="space-y-6 relative mt-8">

      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-surface p-6 rounded-2xl shadow-sm border border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Mesai Onay İşlemleri</h1>
          <p className="text-muted text-sm mt-1">Personellerin fazla mesailerini inceleyin ve karara bağlayın.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-1">Başlangıç Tarihi</label>
            <input id="overtimes-field-1" type="date" value={filters.baslangic} onChange={(e) => setFilters({...filters, baslangic: e.target.value})} className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-2">Bitiş Tarihi</label>
            <input id="overtimes-field-2" type="date" value={filters.bitis} onChange={(e) => setFilters({...filters, bitis: e.target.value})} className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <button onClick={searchOvertimes} disabled={loading} className="px-5 py-2 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary-hover">
            {loading ? 'Yükleniyor...' : 'Kayıtları Getir'}
          </button>
        </div>
      </div>

      {overtimes.some(row => row.Izin_Cakismasi) && <p role="alert" className="p-3 bg-warning-soft text-ink rounded-lg">İzin çakışması bulunan günlerde yeni mesai kararı verilemez. Önce İzinler ekranındaki kayıtları düzeltin. Bu satırları içeren toplu işlemin tamamı reddedilir.</p>}
      {listError && <p role="alert" className="text-danger">{listError} <button type="button" onClick={fetchOvertimes} className="underline">Tekrar dene</button></p>}
      {!loading && !listError && overtimes.length === 0 && <p role="status">Seçili tarih aralığında mesai kaydı bulunmuyor.</p>}
      <AlertMessage message={message.text} type={message.type} />
      <div className="bg-surface-2 p-5 rounded-2xl border border-line shadow-inner">
        <h3 className="text-sm font-black text-ink mb-3 uppercase tracking-wider">Hedefe Yönelik Toplu İşlem</h3>
        <AdminForm disabled={pending || loading || Boolean(listError) || Boolean(bulkConfirmation)} onSubmit={handleAdvancedBulkSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-3">Hedef Türü</label>
            <select id="overtimes-field-3"
              className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent bg-surface"
              value={bulkData.hedef_turu}
              onChange={(e) => {
                setBulkData({...bulkData, hedef_turu: e.target.value, hedef_deger: ''});
                setBulkSuggestions([]);
              }}
            >
              <option value="Tumu">Tüm Personeller</option>
              <option value="Departman">Departmana Göre</option>
              <option value="Sirket">Şirkete Göre</option>
              <option value="Personel">Kişiye Göre (İsim/Sicil)</option>
            </select>
          </div>

          <div className="relative z-50">
            <AutocompleteSearch
              label="Hedef Adı"
              placeholder={bulkData.hedef_turu === 'Tumu' ? 'Tümü Seçili' : 'Aramak için yazın...'}
              value={bulkData.hedef_deger}
              onChange={handleBulkSearchChange}
              suggestions={bulkSuggestions}
              onSelect={(item) => {
                setBulkData({...bulkData, hedef_deger: item.value});
                setBulkSuggestions([]);
              }}
              disabled={bulkData.hedef_turu === 'Tumu'}
              required={bulkData.hedef_turu !== 'Tumu'}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-4">Kararınız</label>
            <select id="overtimes-field-4" value={bulkData.durum} onChange={(e) => setBulkData({...bulkData, durum: e.target.value})} className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg font-bold text-ink outline-none focus:ring-2 focus:ring-accent bg-surface">
              <option value="Onaylandı">Tümünü Onayla</option>
              <option value="Reddedildi">Tümünü Reddet</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-5">Açıklama (Opsiyonel)</label>
            <input id="overtimes-field-5" maxLength={255} type="text" placeholder="Yönetici Notu" value={bulkData.aciklama} onChange={(e) => setBulkData({...bulkData, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent" />
          </div>

          <div>
             <button type="submit" disabled={overtimes.length === 0} className={`w-full py-2 text-white font-bold rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 ${bulkData.durum === 'Onaylandı' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
               İşlemi Uygula
             </button>
          </div>
        </AdminForm>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-surface p-4 rounded-xl border border-line shadow-sm">
        <div className="w-full md:w-1/2">
           <input
              type="text"
              placeholder="Tabloda personel, departman veya durum ara..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="w-full px-4 py-2 text-sm border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-accent bg-surface-2"
           />
        </div>
        {isAdmin && selectedRows.some(row => overtimes.includes(row)) && (
           <button disabled={pending || loading || Boolean(listError)} onClick={handleGridBulkSubmit} className="w-full md:w-auto px-6 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors shadow-md">
             Seçili {selectedRows.filter(row => overtimes.includes(row)).length} Mesai Kaydını Onayla
           </button>
        )}
      </div>

      <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden flex flex-col p-4 h-[55vh]">
        <CustomDataGrid
          ref={gridRef}
          rowData={overtimes}
          columnDefs={colDefs}
          getRowId={(params) => `${params.data.User_ID}-${params.data.TarihStr}`}
          rowSelection={isAdmin ? ROW_SELECTION : undefined}
          selectionColumnDef={SELECTION_COLUMN}
          onSelectionChanged={onSelectionChanged}
          quickFilterText={quickFilterText}
          rowHeight={60}
        />
      </div>

      <ConfirmAction isOpen={Boolean(bulkConfirmation)} title="Toplu Mesai Kararı"
        pending={pending} error={message.type === 'error' ? message.text : ''}
        onClose={() => setBulkConfirmation(null)} onConfirm={confirmBulkDecision}>
        {bulkConfirmation && <>
          <p><strong>{bulkConfirmation.target}</strong></p>
          <p>{bulkConfirmation.people} personelin {bulkConfirmation.mesailer.length} mesai kaydı işlenecek.</p>
          <p>Tarihler: {bulkConfirmation.start.split('-').reverse().join('.')} – {bulkConfirmation.end.split('-').reverse().join('.')}</p>
          <p>Karar: <strong>{bulkConfirmation.durum}</strong>. {bulkConfirmation.durum === 'Onaylandı' ? 'Her kayıt hesaplanan süresiyle onaylanır.' : 'Onaylanan süre sıfırlanır.'} Önceki kararlar değiştirilir.</p>
          <p>Tablo araması ve kolon filtreleri hedefe yönelik toplu işlemi daraltmaz. Yalnız belirli satırları işlemek için tablodaki seçimleri kullanın.</p>
          {bulkConfirmation.aciklama && <p>Açıklama: {bulkConfirmation.aciklama}</p>}
        </>}
      </ConfirmAction>

      {/* --- MESAİ ONAY MODALI (YENİ YAPI) --- */}
      <Modal isOpen={showApprovalModal} onClose={() => { if (!pending) setShowApprovalModal(false); }} title="Mesai İnceleme" maxWidth="max-w-sm">
        {selectedRow && (
          <>
            <p className="text-sm text-muted mb-4 font-bold">{selectedRow.Ad_Soyad} - {selectedRow.TarihStr.split('-').reverse().join('.')}</p>

            <div className="bg-info-soft p-3 rounded-lg border border-info-line mb-4 flex justify-between items-center">
              <span className="text-sm font-bold text-info">Hesaplanan:</span>
              <span className="text-lg font-black text-info">{selectedRow.Hesaplanan_Dk} Dk</span>
            </div>

            <AlertMessage message={message.type === 'error' ? message.text : ''} type="error" />
            <AdminForm disabled={pending} onSubmit={handleApprovalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-6">Kararınız</label>
                <select id="overtimes-field-6" value={approvalData.durum} onChange={(e) => setApprovalData({...approvalData, durum: e.target.value})} className="w-full px-3 py-2 border rounded-lg font-bold text-ink outline-none focus:ring-2 focus:ring-accent">
                  <option value="Onaylandı">Mesaiyi Onayla</option>
                  <option value="Reddedildi">Mesaiyi Reddet</option>
                </select>
              </div>
              {approvalData.durum === 'Onaylandı' && (
                <div>
                  <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-7">Onaylanan Süre (Dakika)</label>
                  <input id="overtimes-field-7" type="number" value={approvalData.onaylanan_dk} onChange={(e) => setApprovalData({...approvalData, onaylanan_dk: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent" required min="0" step="1" max={Math.min(2880, selectedRow.Hesaplanan_Dk + 120)} />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-muted mb-1" htmlFor="overtimes-field-8">Açıklama (Opsiyonel)</label>
                <input id="overtimes-field-8" maxLength={255} type="text" value={approvalData.aciklama} onChange={(e) => setApprovalData({...approvalData, aciklama: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowApprovalModal(false)} className="px-4 py-2 bg-surface-3 font-bold rounded-lg hover:bg-surface-3 text-sm">İptal</button>
                <button type="submit" className={`px-4 py-2 text-white font-bold rounded-lg text-sm ${approvalData.durum === 'Onaylandı' ? 'bg-green-600' : 'bg-red-600'}`}>{pending ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </AdminForm>
          </>
        )}
      </Modal>

    </div>
  );
}

export default Overtimes;
