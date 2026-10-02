import Modal from './Modal';
import AlertMessage from './AlertMessage';

export default function ConfirmAction({ isOpen, title, children, pending, error, onClose, onConfirm, confirmLabel = 'Onayla ve Uygula' }) {
  return <Modal isOpen={isOpen} title={title} onClose={() => { if (!pending) onClose(); }}>
    <div className="text-sm text-slate-700 space-y-3 mb-4">{children}</div>
    <AlertMessage message={error} type="error" />
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" disabled={pending} onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 disabled:opacity-50">Vazgeç</button>
      <button type="button" disabled={pending} onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">{pending ? 'İşleniyor…' : confirmLabel}</button>
    </div>
  </Modal>;
}
