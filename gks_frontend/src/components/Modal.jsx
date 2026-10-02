import { useEffect, useId, useRef } from 'react';

function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-md' // Varsayılan genişlik (max-w-sm, max-w-lg, max-w-4xl vb. alabilir)
}) {
  
  const panel = useRef(null);
  const close = useRef(onClose);
  const titleId = useId();
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const targets = [...panel.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length);
      if (!targets.length) { event.preventDefault(); return; }
      const index = targets.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); targets.at(-1).focus(); }
      else if (!event.shiftKey && (index === -1 || index === targets.length - 1)) { event.preventDefault(); targets[0].focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : 'İşlem'} tabIndex={-1} className={`bg-white p-6 rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto relative`}>
        
        {/* Çarpı (Kapatma) Butonu */}
        <button 
          type="button" aria-label="Kapat"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        {/* Modal Başlığı */}
        {title && (
          <h3 id={titleId} className="text-xl font-black text-slate-800 mb-4 border-b border-slate-100 pb-3 pr-6">
            {title}
          </h3>
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
