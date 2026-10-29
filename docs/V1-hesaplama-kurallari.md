# V1 puantaj ve mesai kuralları

Bu belge uygulamanın sentetik verilerle doğrulanan hesaplama sözleşmesidir. Bordro, mevzuat hesabı veya fiziksel cihaz doğrulaması değildir. Kaynak: `gks_backend/utils/attendance.js`; otomatik örnekler: `test/attendance.test.js` ve `test/demo.test.js`.

## Tarih ve vardiyaya bağlama

Veritabanındaki saat dilimsiz tarih/saatler iş yerel saatini temsil eder. Driver'ın UTC gösterimi ikinci kez saat dilimine çevrilmez. İş günü `BUSINESS_TIMEZONE` ile seçilir; varsayılan `Europe/Istanbul`. Public demo sabit 7 Eylül 2026 gününü kullanır.

İş saat dilimi sunucu açılırken doğrulanır ve `/api/public-config` üzerinden arayüze iletilir. Böylece yerel kurulumda dashboard ile tarih filtreleri aynı iş gününü kullanır. Takvim aritmetiği ziyaretçinin cihaz saat diliminden bağımsızdır: bir hafta önce gün sayısıyla, bir ay önce ise önceki ayın son gününe sınırlandırılarak hesaplanır (31 Mart → 28/29 Şubat). Bu ayar mevcut veritabanı kayıtlarının saatlerini dönüştürmez; değiştirilirse sunucu ve açık tarayıcı sayfaları yeniden başlatılmalıdır.

Dashboard'daki “Son 28 Gün” grafiği referans günü dahil dört ardışık yedi günlük dönem gösterir; 1. hafta en eski, 4. hafta en yenidir. Boş dönemler sıfırla gösterilir. Yıl değişiminde sıfırlanan takvim hafta numarası ve veritabanı hafta başlangıcı ayarı bu sıralamayı değiştirmez.

Bitiş saati başlangıçtan küçükse vardiya ertesi gün biter. Örneğin 22:00–06:00 ataması, ertesi sabah 06:30 çıkışından 30 dakika mesai hesaplar. 16:00–00:00 geçerlidir; başlangıç ve bitişin aynı olması doğrulamada reddedilir.

Okutmalar vardiya çevresindeki 24 saatlik pencereye alınır. Pencere başlangıcı, vardiya başlangıcından vardiya dışı sürenin yarısı kadar öncedir; son sınır dahil değildir. 09:00–18:00 vardiyasında 01:30–ertesi gün 01:30, 22:00–06:00 vardiyasında 14:00–ertesi gün 14:00 kullanılır. Aynı saatli ardışık vardiyalar birbirlerinin okutmalarını almaz. Bu pencere dışında kalan çok uzun çalışmalar veya farklı saatli ardışık vardiyalar için cihaz düzeyinde olay eşleştirme iddiası yoktur.

Geçişler zamana göre sıralanır. İlk başarılı Ana Giriş ve bundan sonraki son başarılı Ana Çıkış esas alınır.

Her okutmanın türü (Ana Giriş, Ana Çıkış, Yemekhane Giriş/Çıkış, Mola / Sigara Alanı, İç Geçiş) şöyle belirlenir. Tesis planında bölgeye bağlı bir kapıda tür, okutma anında geçilen bölgelerden çıkar ve `Logs.Gecis_Anlami` alanına yazılır: bina dışından içeri Ana Giriş, içeriden dışarı Ana Çıkış, yemekhaneye Yemekhane Giriş, yemekhaneden Yemekhane Çıkış, mola alanına Mola / Sigara Alanı, diğer geçişler İç Geçiş (sıra bu önceliktedir; ör. dışarıdan doğrudan yemekhaneye Ana Giriş). Böylece bir bölgenin kaç kapısı olduğu önemsizdir: yemekhaneye hangi kapıdan girilirse girilsin yemek süresi aynı hesaplanır. Plana bağlı olmayan kapılarda ve bu alandan önceki kayıtlarda kapının güncel `Kapi_Turu` değeri kullanılır. Başarısız okutmalar devam hesabına girmez. Çoklu giriş/çıkışlar ayrı çalışma oturumlarına bölünmez. Kişi eşleştirmesi güncel karttan değil, logun sabit `User_ID` alanından yapılır.

## Günlük durum ve dakikalar

| Örnek / koşul | Sonuç |
|---|---|
| 09:00 başlangıç, 10 dakika tolerans, 09:09 veya 09:10 giriş | Geç kalma 0 |
| Aynı vardiyada 09:11 giriş | Geç kalma 11 dakika; tolerans düşülmez |
| 18:00 bitiş, 17:59 çıkış | Erken çıkış 1 dakika; erken çıkış toleransı yok |
| 18:00 bitiş, 19:00 çıkış | Hesaplanan mesai 60 dakika |
| Çalışma gününde okutma yok | Devamsız |
| Yalnız çıkış okutması | Giriş Yok |
| Giriş var, sonrasında çıkış yok | Çıkış Yok; hesaplanan mesai 0 |
| Onaylı izin | İzin türü gösterilir; hesaplanan mesai 0 |
| Aynı güne birden fazla onaylı izin | İzin Çakışması; yeni mesai kararı 409 |
| Vardiya ataması yok | Vardiya Yok |
| Çalışma günleri dışında okutma yok | Hafta Tatili |

Dakika farkları aşağı yuvarlanır; saniyeler ayrıca ücret veya puan üretmez. Normal iş gününde mesai, vardiya bitişinden sonraki çıkış farkıdır; geç kalma, yemek veya mola bu süreden ayrıca düşülmez. Bunlar ayrı alanlarda gösterilir. Bu davranış, günlük net çalışma/bordro hesabı değildir.

Çalışma günleri modelinde 0=Pazar, 1=Pazartesi, …, 6=Cumartesi. Haftalık tatilde giriş ve çıkış varsa **Tatil Mesaisi**: giriş–çıkış farkından eşleşmiş yemek ve mola süreleri düşülür; sonuç sıfırın altına inmez. Resmî tatil takvimi yoktur.

## Yemek ve mola

Yalnız ilk girişten sonra ve son çıkışa kadar olan olaylar dikkate alınır. Yemekhane Giriş, sonraki Yemekhane Çıkış ile eşleştirilir. Mola / Sigara Alanı, sonraki başka türden başarılı geçiş ile kapanır. Aynı başlangıç türünün tekrar okutulması başlangıcı ileri taşımaz; birden fazla tamamlanmış süre toplanır.

Kapanmamış yemek veya mola için süre tahmin edilmez; `Acik_Yemek`/`Acik_Mola` işaretleri döner. Örneğin yemek girişi olup yemek çıkışı yoksa yemek süresi sıfırdır ve açık yemek işareti vardır. Ana çıkış, molayı kapatabilir; yemek yalnız yemek çıkışıyla kapanır. Aynı zamanlı karma kapı olayları ve gerçek cihaz yinelenmeleri için gelişmiş normalizasyon yoktur.

Mola aşımı `max(0, toplam mola - mola hakkı)` olur. 30 dakika hak ve 40 dakika tamamlanmış mola, 10 dakika aşım gösterir. İzin/izin çakışması yoksa durum metnine Mola Aşımı eklenir. Vardiyadaki planlı yemek saatleri tamamlanmamış bir yemek süresi yerine geçirilmez.

## Yönetici kararı ve geçmiş

Hesaplanan süre, onaylanan süre ve hak edilen mesai ayrı alanlardır. Sıfır dakika onayı geçerli karardır. Onay sınırı sunucuda yeniden hesaplanan süreye göre `0–min(2880, hesaplanan+120)`; red/beklemede onaylanan süre sıfırdır. Toplu karar atomiktir. Ayrıntılar ve geçmiş kart/vardiya/çalışma dönemi sınırları [README](../README.md) içinde açıklanır.

Gelecek veya eksik verili bir günde mevcut kuralların ürettiği sonuç, sonradan yeni okutma geldiğinde değişebilir. Karar anındaki hesap ve güncel hesap bu nedenle farklı olabilir. Demo seed, normal/gece/tatil/eksik geçiş/izin/tolerans/mola ve farklı mesai kararlarını tekrar üretir.
