# GKS V1 — sürüm notları

V1 (`v1.0.0`) 28 Ekim 2026'da yayımlandı. Salt okunur public demo: https://gksdemo.com.

GKS, personel, kapı yetkileri, vardiya, izin ve devam/mesai takibini birlikte incelemek için geliştirilmiş bağımsız bir kişisel portföy projesidir. Fiziksel geçişler tamamen sentetik kayıtlarla temsil edilir.

## V1 kapsamı

- Yerel kurulumda yönetici işlemleri; normal kullanıcı için görüntüleme yetkileri.
- İş verilerini değiştirmeyen public demo modu ve sabit senaryo dönemine ait tekrar üretilebilir veri.
- Gece vardiyası, tolerans, eksik okutma, yemek/mola ve haftalık tatil çalışma hesabı.
- Hesaplanan mesai ile yönetici kararının ayrılması; sıfır dakika onayı, red ve kapsamı gösterilen toplu kararlar.
- Kart, vardiya ve istihdam geçmişinin eski raporlarla ilişkisinin korunması; çakışan izinlerin görünür olması.
- Kritik değişiklik ve audit kayıtlarının aynı transaction içinde tutulması; başarılı değişikliklerden sonra canlı ekran yenileme.
- Filtrelenen tablo satırlarını gerçek `.xlsx` dosyası olarak indirme; hazırlanmış dosyaya doğrudan bağlantı. Sunucuda sayfalanan listelerde indirme mevcut sayfayla sınırlıdır.
- Migration, ilk yönetici, uygulama veritabanı rolü ve demo seed komutları; Docker ile belgelenmiş yerel kurulum ve Caddy (HTTPS) + PostgreSQL ile tek sunuculu kurulum.
- Büyük/küçük harf ve aksan duyarsız Türkçe arama (`ISIK` → `Işık`).

## Doğrulama ve sınırlar

PostgreSQL 18'e karşı 68 backend veritabanı testi, 26 backend birim testi, 11 frontend testi, frontend kod kontrolü, üretim derlemesi ve bağımlılık denetimi başarılıdır; GitHub Actions bu kontrolleri her değişiklikte geçici PostgreSQL servisiyle çalıştırır. Test veritabanları ayrıdır. Tek sunuculu Compose yığını önce yerelde, sonra yayın sunucusunda uçtan uca denendi: uygulama hesabı veritabanına TLS 1.3 ile bağlanır; yayın sunucusunun yedeği yeni bir veritabanına geri yüklenip satır sayıları ve içerikleri canlı veritabanıyla karşılaştırıldı. Puantaj, mesai ve üç log tablosundan indirilen dosyalar daha önceki kabulde açılarak kontrol edildi.

Toplu mesai kararında yeniden deneme, yazmadan önce dönen geçici hatayı kapsar; yanıtın ağda kaybolduğu durumda tekrar gönderimin aynı sonucu vereceği (idempotentlik) garanti edilmez. Sunucuda sayfalanan listelerde Excel indirme yalnız yüklenmiş sayfayı kapsar.

Gerçek kart okuyucu/kapı cihazı bağlantısı, bordro, resmî tatil takvimi, izin bakiyesi, çok kiracılı kullanım ve kurumsal yüksek erişilebilirlik bu sürümün kapsamı dışındadır. Hesaplama varsayımları [hesaplama kurallarında](V1-hesaplama-kurallari.md), geçmiş verilerin sınırları [veri modelinde](V1-veri-modeli.md) açıklanır.

## Veritabanı değişikliği

V1, geliştirme sırasında kullanılan SQL Server yerine PostgreSQL ile yayımlanır. API yanıtlarının alan adları, tarih/saat biçimi, hata mesajları ve audit davranışı aynı kalır; aynı sentetik veriyle 23 okuma ucundan 22'si birebir aynı sonucu verdi. Bilinen farklar:

- Veritabanının ürettiği zaman damgaları (ör. mesai kararı zamanı) artık her zaman `BUSINESS_TIMEZONE` (Türkiye) saatidir. Önceki Docker SQL Server kurulumunda sunucu saati UTC idi.
- Aynı saniyedeki geçiş kayıtları listede kayıt numarasına göre ters sırayla, belirli bir düzende gösterilir.
- Arama artık aksan da gözetmez; kart no, sicil no ve panel kullanıcı adı büyük/küçük harf duyarsız tekildir.
- Şema tek temel migration'dır (`001_initial.sql`). Önceki SQL Server veritabanlarından veri taşıma aracı yoktur; demo verisi seed ile yeniden kurulur.

## Kurulum ve geri dönüş

Yeni kurulum için [yerel Docker kılavuzunu](local-docker.md) veya [tek sunuculu kurulum kılavuzunu](hosting.md) izleyin. Mevcut veritabanında migration öncesi yedek alıp ayrı bir veritabanına geri yükleyerek deneyin. Migration dosyaları uygulanmış şemayı sürümlendirir; otomatik aşağı migration komutu yoktur.

Geri dönüş gerektiğinde önceki uygulama sürümünü sonradan değişmiş şemaya doğrudan bağlamayın. Önceki sürümle doğrulanmış yedeği ayrı bir veritabanına geri yükleyip o sürümün bağlantısını bu kopyaya yöneltin. Yerel yönetim ortamında yedekten sonraki işlemler ayrıca değerlendirilmelidir. Salt okunur demoda sentetik veriler aynı sürümün migration ve seed komutlarıyla yeni, açıkça seçilmiş demo veritabanında tekrar üretilebilir. Eski veritabanını doğrulama tamamlanmadan silmeyin.

## Yayın ortamı

Demo tek bir Ubuntu 24.04 (arm64) sunucuda `compose.hosting.yaml` ile çalışır: Caddy (Let's Encrypt), nginx, Express ve iç ağda TLS'li PostgreSQL 18. Sunucuda HTTPS yönlendirmesi, HSTS, demo girişi, puantaj, yazma engeli, WebSocket, hız sınırı, CORS, veritabanının uygulama hesabıyla TLS bağlantısı, dış portların kapalılığı ve sunucu yeniden başlatıldıktan sonra kendiliğinden açılma doğrulandı. Veritabanı her gece yedeklenir (7 gün).
