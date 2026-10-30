import { Link } from 'react-router-dom';
import PageHeader from './PageHeader';

// Shown instead of a silent redirect when a page is closed for this account or setup.
export default function Unavailable({ title = 'Sayfa bulunamadı', reason = 'Bu adreste bir sayfa yok.' }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={reason} />
      <Link to="/" className="btn btn-primary">Ana Sayfaya dön</Link>
    </div>
  );
}
