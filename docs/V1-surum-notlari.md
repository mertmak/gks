# GKS V1 — sürüm notları taslağı

Bu metin yayın hazırlığı içindir. V1 etiketi ve public HTTPS demo henüz yayımlanmadı; aşağıdaki yerel doğrulamalar yayın ortamının kabulü yerine geçmez.

GKS, personel, kapı yetkileri, vardiya, izin ve devam/mesai takibini birlikte incelemek için geliştirilmiş bağımsız bir kişisel portföy projesidir. Fiziksel geçişler tamamen sentetik kayıtlarla temsil edilir.

## V1 kapsamı

- Yerel kurulumda yönetici işlemleri; normal kullanıcı için görüntüleme yetkileri.
- İş verilerini değiştirmeyen public demo modu ve sabit senaryo dönemine ait tekrar üretilebilir veri.
- Gece vardiyası, tolerans, eksik okutma, yemek/mola ve haftalık tatil çalışma hesabı.
- Hesaplanan mesai ile yönetici kararının ayrılması; sıfır dakika onayı, red ve kapsamı gösterilen toplu kararlar.
- Kart, vardiya ve istihdam geçmişinin eski raporlarla ilişkisinin korunması; çakışan izinlerin görünür olması.
- Kritik değişiklik ve audit kayıtlarının aynı transaction içinde tutulması; başarılı değişikliklerden sonra canlı ekran yenileme.
- Filtrelenen tablo satırlarını gerçek `.xlsx` dosyası olarak indirme; hazırlanmış dosyaya doğrudan bağlantı. Sunucuda sayfalanan listelerde indirme mevcut sayfayla sınırlıdır.
- Migration, ilk yönetici ve demo seed komutları; Docker ile belgelenmiş yerel kurulum.

## Doğrulama ve sınırlar

29 Eylül 2026 yerel kontrolünde 54 backend ve 11 frontend testi, frontend kod kontrolü ve üretim derlemesi başarılıdır. Test veritabanları ayrıdır. Puantaj, mesai ve üç log tablosundan indirilen dosyalar açılarak kontrol edildi.

Gerçek kart okuyucu/kapı cihazı bağlantısı, bordro, resmî tatil takvimi, izin bakiyesi, çok kiracılı kullanım ve kurumsal yüksek erişilebilirlik bu sürümün kapsamı dışındadır. Hesaplama varsayımları [hesaplama kurallarında](V1-hesaplama-kurallari.md), geçmiş verilerin sınırları [veri modelinde](V1-veri-modeli.md) açıklanır.

## Kurulum ve geri dönüş

Yeni kurulum için [yerel Docker kılavuzunu](local-docker.md) izleyin. Mevcut veritabanında migration öncesi yedek alıp ayrı bir veritabanına geri yükleyerek deneyin. Migration dosyaları uygulanmış şemayı sürümlendirir; otomatik aşağı migration komutu yoktur.

Geri dönüş gerektiğinde önceki uygulama sürümünü sonradan değişmiş şemaya doğrudan bağlamayın. Önceki sürümle doğrulanmış yedeği ayrı bir veritabanına geri yükleyip o sürümün bağlantısını bu kopyaya yöneltin. Yerel yönetim ortamında yedekten sonraki işlemler ayrıca değerlendirilmelidir. Salt okunur demoda sentetik veriler aynı sürümün migration ve seed komutlarıyla yeni, açıkça seçilmiş demo veritabanında tekrar üretilebilir. Eski veritabanını doğrulama tamamlanmadan silmeyin.

## Yayından önce tamamlanacaklar

- Desteklenen hedef SQL ortamı, HTTPS, proxy ve dış ağ kontrolü.
- Son kaynaklarla uzaktaki GitHub CI ve kalan arayüz kabulü.
- Yayımlanacak dosya ve Git geçmişinin incelenmesi; sentetik ekran görüntüleri.
- Gerçek demo adresi, sürüm etiketi ve yayın tarihi.

## Repository bilgileri taslağı

**Açıklama:** Sentetik verili personel, vardiya, izin ve devam/mesai yönetimi portföy projesi. React, Express, SQL Server ve salt okunur demo.

**Topic önerileri:** `react`, `express`, `sql-server`, `socket-io`, `attendance-management`, `portfolio-project`, `docker`.

Bu bilgiler GitHub'a uygulanmış değildir. CI yapılandırması otomatik deployment anlamına gelmez.
