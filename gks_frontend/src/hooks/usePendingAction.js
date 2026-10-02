import { useRef, useState } from 'react';

// The ref closes the gap before React renders the disabled controls.
export function usePendingAction() {
  const active = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async action => {
    if (active.current) return;
    active.current = true;
    setPending(true);
    try { return await action(); }
    finally { active.current = false; setPending(false); }
  };
  return { pending, run };
}
