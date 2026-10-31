# GKS V2 — sürüm notları

V2 (`v2.0.0`), V1'in üzerine tesis tasarımı, canlı kapı simülasyonu, dönemsel puantaj ve yenilenen arayüzü ekler. Salt okunur public demo: https://gksdemo.com. V1 kapsamı ve PostgreSQL geçişi için [V1 sürüm notları](V1-surum-notlari.md).

## Yenilikler

- **Tesis Tasarımı:** katlar, çokgen bölgeler (Lobi, Ofis, Üretim, Depo, Yemekhane, Mola, Merdiven/Asansör…) ve bölge sınırlarına yerleşen kapılar. Kapı iki bölgeyi ya da bir bölgeyi bina dışıyla bağlar ve tek yönlü (turnike) olabilir; aynı dikey gruptaki merdiven/asansörler katları bağlar. Boş plana Ofis veya Fabrika şablonu uygulanabilir. Plan tek işlemde kaydedilir ve Kapı Değişiklikleri kaydına yazılır.
- **Geçiş anlamı:** bölgeye bağlı kapıda okutmanın puantajdaki anlamı (Ana Giriş/Çıkış, Yemekhane Giriş/Çıkış, Mola, İç Geçiş) kapının sabit türünden değil geçişin yönünden çıkar ve kayıtla birlikte saklanır. Plan sonradan değişse de geçmiş puantaj aynı kalır.
- **Canlı Simülasyon:** çizilen tesiste personel gün boyunca hareket eder, okutmalar sunucuya gerçek geçiş kaydı olarak gider ve sunucunun kararı (yetki, pasif kapı, tanımsız kart, kapalı yön) ekranda görünür. Hız, elle geçiş ve gün sonunda puantaj/mesai bağlantıları vardır. Aynı günü yeniden çalıştırmak önce o günün kayıtlarını silmeyi onaylatır, kayıtları çoğaltmaz. Toplu Veri Üretici aynı sayfanın sekmesidir.
- **Kişisel simülasyon alanı (demo):** her ziyaretçi demo verisinin kopyasında yönetici olarak çalışır; kopya süre dolunca silinir. Demo verisi yine salt okunurdur. Sunucu yeniden başlatıldığında açık alanlar korunur, yeni migration getiren güncellemeden sonra kapanır.
- **Dönemsel puantaj:** hafta (Pzt–Paz), ay veya en fazla 92 günlük özel aralık; tüm personel, departman, seçili kişiler ya da tek kişi için kişi başı toplamlar ve günlük döküm. Bugünden sonraki günler sayılmaz. Excel dosyası "Özet" ve "Günlük" sayfalarını içerir; rapor yazdırılabilir.
- **Arayüz:** açık/koyu/sistem teması, daraltılabilir yan menü ve telefonda çekmece, ortak sayfa başlığı ve form bileşenleri, yeni menü adları (Geçiş Noktaları, Geçiş Hareketleri, Denetim Kayıtları…). Eski adresler yenilerine yönlenir. Yetkisiz ya da kapalı sayfalar sessizce yönlenmek yerine nedenini söyler; mükerrer kayıtta çakışan alan (ör. sicil no) belirtilir. İki temada WCAG AA kontrastı ve klavye ile gezinme denetlendi.
- **Demo verisi:** salt okunur demoda hazır bir Ofis planı ve lobi turnikesi vardır.

## Doğrulama ve sınırlar

PostgreSQL 18'e karşı 108 backend veritabanı testi, 31 backend birim testi, 34 frontend testi, kod kontrolü, üretim derlemesi ve bağımlılık denetimi (yüksek önem düzeyinde açık yok) başarılıdır. Tesis kabulü tarayıcıda yapıldı: Fabrika şablonu, iki kat, yemekhaneye iki ayrı kapıdan giriş, Canlı Simülasyon ile tam gün, sunucu kararlarıyla uyuşmazlık sıfır ve o günün puantajında yemek/mola sürelerinin iki kapıdan da doğru hesaplanması.

Kapıların yön kısıtı panelde yazılıdır; planda yön oku çizilmez. Plan düzenleme geniş ekranda yapılır, telefonda plan yalnız görüntülenir. Simülasyon gerçek kart okuyucu davranışını temsil etmez; V1'deki kapsam dışı konular (gerçek cihaz bağlantısı, bordro, resmî tatil takvimi, izin bakiyesi) aynen geçerlidir.

## Veritabanı değişiklikleri ve güncelleme

V2 üç migration ekler: `002_sandbox.sql` (simülasyon alanı kaydı), `003_kat_plani.sql` (bölgeler, kapı konumları), `004_tesis.sql` (katlar, çokgen bölgeler, kapı yön kısıtı, geçiş anlamı). `004` bölgesi olan kurulumlarda mevcut bölgeleri "Zemin Kat"a taşır; plansız kapılar ve eski geçiş kayıtları önceki gibi hesaplanır.

V1 kurulumunu güncellerken önce yedek alın, sonra [tek sunuculu kurulum kılavuzundaki](hosting.md) güncelleme adımlarını izleyin: `db:migrate`, yeni tablolar için `db:runtime-role` ve demo için `seed:demo` (yalnız eksik kat planını ekler). Simülasyon alanı isteğe bağlıdır (`SANDBOX_MODE=true`). Otomatik aşağı migration yoktur; geri dönüş V1 notlarındaki gibi V1 ile alınmış yedeğin ayrı veritabanına geri yüklenmesiyle yapılır.
