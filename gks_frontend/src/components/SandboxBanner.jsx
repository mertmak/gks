import { useEffect, useState } from 'react';
import api from '../api/axios';
import { usePendingAction } from '../hooks/usePendingAction';

const minutesLeft = expiresAt => Math.max(0, Math.ceil((expiresAt * 1000 - Date.now()) / 60000));

// Shown instead of the read-only notice while a personal simulation copy is open.
export default function SandboxBanner({ expiresAt, referenceDate, onClose }) {
  const { pending, run } = usePendingAction();
  const [left, setLeft] = useState(() => minutesLeft(expiresAt));
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setLeft(minutesLeft(expiresAt)), 30000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const reset = () => run(async () => {
    setError('');
    try {
      const { data } = await api.post('/sandbox/reset');
      localStorage.setItem('token', data.token);
      window.location.reload();
    } catch (err) { setError(err.response?.data?.message || 'Alan sıfırlanamadı.'); }
  });
  return (
    <div className="bg-amber-100 text-amber-950 px-6 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex-1 min-w-60"><strong>Kişisel simülasyon alanı</strong> · Değişiklikler yalnız sizin kopyanızda · Referans gün {referenceDate} · Kalan süre: {left} dk</p>
      {error && <p role="alert" className="text-red-700 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={reset} className="rounded-lg border border-amber-700/40 px-3 py-1 font-bold hover:bg-amber-200">Demo verisine sıfırla</button>
        <button type="button" disabled={pending} onClick={onClose} className="rounded-lg bg-amber-900 text-white px-3 py-1 font-bold hover:bg-amber-800">Alanı kapat</button>
      </div>
    </div>
  );
}
