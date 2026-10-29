import { demoSettings } from '../utils/demo';
import { readSession } from '../utils/session';
export default function AdminForm({children,className,onSubmit,disabled = false,...props}) {
  if (demoSettings().demo && !readSession()?.sandbox) return null;
  const canEdit=readSession()?.role==='admin';
  return <form {...props} onSubmit={e=>{if(!canEdit){e.preventDefault();return;}onSubmit?.(e);}}>
    {!canEdit&&<p className="mb-3 text-sm text-muted">Görüntüleme hesabı: değişiklik için yönetici yetkisi gerekir.</p>}
    <fieldset disabled={!canEdit || disabled} className={className}>{children}</fieldset>
  </form>;
}
