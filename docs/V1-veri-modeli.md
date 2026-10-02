# V1 veri modeli

Şema `database/migrations` altındaki sıralı SQL dosyalarıyla kurulur. Migration aracı uygulanan dosyanın adını ve checksum değerini saklar; değiştirilen eski migration'ı sessizce yeniden uygulamaz. Demo seed şema migration'ından ayrıdır.

```mermaid
erDiagram
    Users ||--o{ Permissions : yetkileri
    Doors ||--o{ Permissions : izin_verilen_kapi
    Users ||--o{ Personel_Vardiya : atamalari
    Vardiyalar ||--o{ Personel_Vardiya : kaynak_tanim
    Users ||--o{ Personel_Calisma_Gecmisi : onceki_donemleri
    Users ||--o{ Izinler : izinleri
    Users ||--o{ Mesai_Onaylari : gunluk_kararlari
    Users o|--o{ Logs : olay_anindaki_kisi
    Doors ||--o{ Logs : olay_kapisi
```

| Tablo | Sorumluluk ve önemli sınır |
|---|---|
| `Users` | Personel kimliği, güncel kart, şirket/departman ve güncel çalışma dönemi. Panel hesabı değildir. Kart, TC ve sicil tekilliği migration kısıtlarıyla korunur. |
| `Doors` | Sentetik geçiş noktası, kapı türü ve aktiflik. Fiziksel röle/turnike sürücüsü yoktur. |
| `Permissions` | Personel–kapı çoktan çoğa ilişkisi. Aynı çift yinelenemez. Kapıyı pasife almak mevcut izinlerini kaldırır; tekrar aktifleştirmek izinleri geri getirmez. |
| `Vardiyalar` | Saatler, tolerans, mola hakkı, haftanın çalışma günleri ve aktiflik. |
| `Personel_Vardiya` | Tarihli personel ataması ve atama anındaki vardiya alanlarının kopyası. Rapor tanımın güncel saatleri yerine bu kopyayı kullanır. |
| `Personel_Calisma_Gecmisi` | Yeniden işe alımdan önce kapanan çalışma dönemleri. Çalışılmayan aralıklar geçmiş rapora eklenmez. |
| `Logs` | Kart, kapı, olay saati, başarılı/başarısız sonucu ve olay eklenirken belirlenen kişi. Tanımsız kartta kişi boş kalabilir; sonradan başka kişiye bağlanmaz. |
| `Izinler` | Başlangıç/bitiş dahil izin aralığı, tür, karar ve açıklama. Sağlık raporu dosyası veya izin bakiyesi modülü değildir. |
| `Mesai_Onaylari` | Personel/gün başına son mesai kararı, karar anındaki hesap, onaylanan süre ve aktör. Aynı personel/gün çifti tektir. |
| `Yoneticiler` | Adına rağmen hem `admin` hem `user` panel hesabı saklar. bcrypt hash'i ve oturum sürümü; personelle birebir FK ilişkisi yoktur. |
| `SystemLogs` | İK, vardiya, hesap, izin ve mesai işlemlerinin aktör/metin geçmişi. Ad/sicil olay anındaki metindir; kişi tablosuna canlı FK olarak bağlı değildir. |
| `DoorLogs` | Kapı tanımı/yetki değişikliklerinin işlem geçmişi. Kart okutması olan `Logs` ile farklı amaç taşır. |

Kritik değişiklikler ile işlem geçmişi aynı transaction'a yazılır. Commit tamamlanmadan Socket.IO bildirimi gönderilmez. İstemci bildirimi veri olarak kullanmaz; yetkili API'den listeyi tekrar alır. Personel güncellemelerinde kilitler, toplu hata durumunda geri alma ve mesai/izin çakışma testleri bu sınırları doğrular.

## Migration sırası

1. `001_initial.sql`: temel tablolar ve ilk ilişkiler.
2. `002_integrity.sql`: bütünlük, tekillik, indeks ve oturum sürümü düzenlemeleri.
3. `003_log_identity.sql`: log kişisini sabitleyen `User_ID` ve trigger.
4. `004_shift_snapshot.sql`: atama anındaki vardiya alanları ve trigger.
5. `005_employment_history.sql`: kapanan çalışma dönemleri.

003 ve 004 önceden kaybolmuş geçmişi geri üretmez; mevcut veriyi migration anındaki duruma göre başlangıç kabul eder. Personel adı/departmanı ve kapı türü için ayrı tarihsel sürüm tablosu yoktur. Ayrıntılı davranış [hesaplama kurallarında](V1-hesaplama-kurallari.md) ve [README'deki geçmiş sözleşmesinde](../README.md) açıklanır.
