// Menu structure; `admin` items are hidden from viewers.
export function buildNav({ admin }) {
  const nav = [
    { label: 'Ana Sayfa', to: '/', icon: 'home' },
    { label: 'Personel', icon: 'users', items: [
      { label: 'Personel Listesi', to: '/personel/liste' },
      { label: 'Personel Düzenleme', to: '/personel/duzenleme', admin: true },
      { label: 'Toplu İşlemler', to: '/personel/toplu', admin: true },
    ] },
    { label: 'Geçiş Noktaları', to: '/gecis-noktalari', icon: 'door' },
    { label: 'Tesis Tasarımı', to: '/tesis-tasarimi', icon: 'plan' },
    { label: 'Vardiya & İzin', icon: 'clock', items: [
      { label: 'Vardiya Yönetimi', to: '/vardiya' },
      { label: 'İzin ve Rapor Girişi', to: '/izinler' },
      { label: 'Mesai Onay İşlemleri', to: '/mesailer' },
    ] },
    { label: 'Puantaj', to: '/puantaj', icon: 'table' },
    { label: 'Geçiş Hareketleri', to: '/gecis-hareketleri', icon: 'arrows' },
    { label: 'Denetim Kayıtları', icon: 'shield', items: [
      { label: 'Kapı Değişiklikleri', to: '/denetim/kapi' },
      { label: 'Sistem İşlemleri', to: '/denetim/sistem' },
    ] },
  ];
  return nav.map(entry => entry.items ? { ...entry, items: entry.items.filter(item => admin || !item.admin) } : entry);
}

const EXTRA_TITLES = { '/settings': 'Hesap Ayarları', '/hesap-ekle': 'Yönetici Hesapları' };

export function pageTitle(nav, pathname) {
  for (const entry of nav) {
    if (entry.to === pathname) return entry.label;
    const item = entry.items?.find(child => child.to === pathname);
    if (item) return item.label;
  }
  return EXTRA_TITLES[pathname];
}
