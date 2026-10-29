import { useEffect, useRef } from 'react';

// While active: locks page scroll, focuses the panel, keeps Tab inside it, closes on Esc
// and gives focus back to the element that opened it.
export function useFocusTrap(panel, active, onClose) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!active) return;
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
  }, [active, panel]);
}
