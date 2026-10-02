// PostgreSQL folds unquoted identifiers to lower case. Result keys are mapped
// back to the spelling the API has always returned. Every table column and
// every SELECT alias read by the code must be listed here; in strict mode an
// unknown key fails instead of silently reaching the client in lower case.
// GksMigrations is read only by scripts/migrate.js through the raw client.
const tables = {
    Doors: ['ID', 'Kapi_Adi', 'Departman', 'Konum', 'Durum', 'Kapi_Turu'],
    DoorLogs: ['ID', 'Islem_Tipi', 'Kapi_Adi', 'Detay', 'Tarih', 'Islemi_Yapan'],
    Izinler: ['ID', 'User_ID', 'Izin_Turu', 'Baslangic_Tarihi', 'Bitis_Tarihi', 'Aciklama', 'Durum', 'Olusturulma_Tarihi'],
    Logs: ['ID', 'RFID_Kart_No', 'Door_ID', 'Zaman', 'Basarili_Mi', 'User_ID'],
    Mesai_Onaylari: ['ID', 'User_ID', 'Tarih', 'Hesaplanan_Dk', 'Onaylanan_Dk', 'Durum', 'Aciklama', 'Islemi_Yapan', 'Islem_Zamani'],
    Permissions: ['ID', 'User_ID', 'Door_ID'],
    Personel_Vardiya: ['ID', 'User_ID', 'Vardiya_ID', 'Baslangic_Tarihi', 'Bitis_Tarihi',
        'Snapshot_Vardiya_Adi', 'Snapshot_Mesai_Baslangic', 'Snapshot_Mesai_Bitis', 'Snapshot_Calisma_Gunleri',
        'Snapshot_Tolerans_Dk', 'Snapshot_Mola_Hakki_Dk', 'Snapshot_Yemek_Baslangic', 'Snapshot_Yemek_Bitis'],
    Personel_Calisma_Gecmisi: ['ID', 'User_ID', 'Baslangic_Tarihi', 'Bitis_Tarihi', 'Cikis_Nedeni'],
    SystemLogs: ['ID', 'Islem_Tipi', 'Personel_Ad', 'Sicil_No', 'Detay', 'Tarih', 'Islemi_Yapan'],
    Users: ['ID', 'Ad_Soyad', 'RFID_Kart_No', 'Durum', 'TC_Kimlik', 'Sicil_No', 'Sirket', 'Departman', 'Gorev',
        'Sistem_ID', 'Ise_Giris_Tarihi', 'Isten_Cikis_Tarihi', 'Cikis_Nedeni'],
    Vardiyalar: ['ID', 'Vardiya_Adi', 'Mesai_Baslangic', 'Mesai_Bitis', 'Yemek_Baslangic', 'Yemek_Bitis',
        'Tolerans_Dk', 'Mola_Hakki_Dk', 'Durum', 'Calisma_Gunleri'],
    Yoneticiler: ['ID', 'Kullanici_Adi', 'Sifre_Hash', 'Rol', 'Olusturulma_Tarihi', 'Token_Version'],
    GksSeedState: ['Version'],
};

// SELECT aliases used by routes, services, scripts and tests.
const aliases = [
    'AktifKapi', 'AktifPersonel', 'Basarili', 'BugunGecis', 'Cakisma_Var', 'Gelen', 'Izin_Durumu',
    'Kayit_Sayisi', 'LastExit', 'Mesai_Aciklama', 'Mesai_Durumu', 'Mesai_Islem_Zamani', 'Mesai_Islemi_Yapan',
    'Onayli_Izin_Sayisi', 'Saat', 'ToplamPersonel', 'Yetkisiz', 'YetkisizGiris', 'Hafta',
    'adSoyad', 'count', 'doors', 'locked', 'logs', 'n', 'name', 'ready', 'rfid', 'toplam', 'tur',
];

const canonical = new Map();
for (const name of [...Object.values(tables).flat(), ...aliases]) {
    const key = name.toLowerCase();
    const existing = canonical.get(key);
    if (existing && existing !== name) throw new Error(`Kolon adı çakışması: ${existing} / ${name}`);
    canonical.set(key, name);
}

module.exports = { canonical, tables, aliases };
