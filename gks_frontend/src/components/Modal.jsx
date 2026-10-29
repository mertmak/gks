import { useId, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-md' // Varsayılan genişlik (max-w-sm, max-w-lg, max-w-4xl vb. alabilir)
}) {
  
  const panel = useRef(null);
  const titleId = useId();
  useFocusTrap(panel, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : 'İşlem'} tabIndex={-1} className={`bg-surface p-6 rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto relative`}>
        
        {/* Çarpı (Kapatma) Butonu */}
        <button 
          type="button" aria-label="Kapat"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-danger transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        {/* Modal Başlığı */}
        {title && (
          <h2 id={titleId} className="text-xl font-black text-ink mb-4 border-b border-line pb-3 pr-6">
            {title}
          </h2>
        )}

        {/* Modal İçeriği */}
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
