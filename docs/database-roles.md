# Kurulum ve uygulama veritabanı hesapları

Migration ve ilk kurulum için kullanılan yetkili PostgreSQL hesabı uygulamanın sürekli çalışan bağlantısı olmamalıdır. GKS, hazır bir giriş rolünü `gks_runtime` rolüne üye yapan `db:runtime-role` komutunu sağlar. Komut giriş rolü/parola oluşturmaz, bağlantı şifrelemesini değiştirmez ve kullanıcı silmez. Üretim modunda backend süper kullanıcı hesabıyla açılmayı reddeder.

PostgreSQL rolleri veritabanına değil bütün sunucuya aittir. Aynı sunucuda birden fazla GKS veritabanı varsa `RUNTIME_DB_ROLE` ile her biri için ayrı rol adı (küçük harf, rakam, alt çizgi) seçilebilir; varsayılan `gks_runtime`.

## Kurulum sırası

1. Yetkili kurulum hesabıyla yeni DB, migration, ilk panel yöneticisi ve isteniyorsa sentetik seed adımlarını tamamlayın.
2. Yalnız uygulamaya ayrılmış yeni bir giriş rolü oluşturun. Ona `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, veritabanı sahipliği veya başka geniş roller vermeyin. Komut ilk dört özellikten birine sahip hesabı reddeder; sahiplik ve rol üyeliklerini denetlemez. Kurulum hesabıyla `psql` içinde:

   ```sql
   CREATE ROLE gks_app LOGIN;
   \password gks_app
   ```

   `\password` parolayı ekranda göstermeden sorar ve SCRAM hash'i olarak gönderir. Parolayı SQL dosyasına, kabuk geçmişine veya Git'e yazmayın.

3. Backend ortamı hâlâ **kurulum hesabını** kullanırken `RUNTIME_DB_USER=gks_app` ve `RUNTIME_DB_CONFIRM` değerini tam olarak hedef `DB_NAME` ile aynı yapın. Backend klasöründe çalıştırın:

   ```sh
   npm run db:runtime-role
   ```

   Docker ile yerel kurulumda bu iki değeri kurulum ortam dosyasına geçici olarak ekleyip proje kökünde çalıştırın:

   ```sh
   docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:runtime-role
   ```

   Tek sunuculu kurulumda aynı adım `installer` profiliyle çalışır; bkz. [hosting kılavuzu](hosting.md).

4. Normal servis ortamında `DB_USER` ve `DB_PASSWORD` değerlerini uygulama hesabına geçirin. `RUNTIME_DB_USER`, `RUNTIME_DB_CONFIRM`, bootstrap parolası ve seed onayını bu dosyadan kaldırın. Servisi yeniden oluşturun. Kurulum hesabının kimlik bilgilerini ayrı ve erişimi sınırlı bir yerde saklayın.
5. Sonraki migration veya seed işlemlerini yeniden yetkili kurulum hesabıyla, uygulama hesabının yetkilerini genişletmeden çalıştırın.

## Rolün kapsamı

| Tablolar | Verilen işlemler |
|---|---|
| `Users`, `Doors`, `Vardiyalar`, `Mesai_Onaylari` | Okuma, ekleme, güncelleme |
| `Personel_Vardiya`, `Yoneticiler`, `Bolgeler` | Okuma, ekleme, güncelleme, silme |
| `Permissions`, `Izinler` | Okuma, ekleme, silme |
| `Personel_Calisma_Gecmisi`, `Logs`, `SystemLogs`, `DoorLogs` | Okuma, ekleme |
| `GksSandboxes` | Okuma, ekleme, silme |

Rol `public` şemasını kullanma (`USAGE`) dışında yeni tablo/şema oluşturma veya değiştirme, migration/seed metadatasına erişim, audit/geçiş geçmişini değiştirme veya silme izni vermez. Tek istisna: komut `SANDBOX_MODE=true` ile çalıştırılırsa rol veritabanında `CREATE` alır; public demodaki kişisel simülasyon alanları uygulama hesabına ait `sbx_…` şemalarında kurulur ve süre dolunca silinir. Bu izin `public` şemasındaki tablolara yeni yetki vermez; ayar kapalıyken komut yeniden çalıştırıldığında izin geri alınır. Yeni bir iş akışı eklenirse izinler ayrıca gözden geçirilmelidir. Public demoda aynı rolün mevcut olması HTTP yazma engelini kaldırmaz; salt okunur koruma API'de ayrıca uygulanır.

Komut tekrarlanabilir; rol/üyelik zaten varsa yeniden oluşturmaz. Bütün grant ve üyelik değişiklikleri tek transaction içindedir. Eksik tablo veya bulunmayan kullanıcıda değişiklikler geri alınır.

Bu komut **önceden verilmiş ek yetkileri kaldırmaz**. Başka rol üyelikleri, tablo sahipliği veya doğrudan grant'leri olan bir hesabı otomatik olarak kısıtlamaz. Yeni, yalnız bu rolü kullanan bir uygulama kimliği tercih edin; hedef sunucudaki etkili yetkileri (`\du`, `\dp`) ayrıca doğrulayın.

## Doğrulama

İzole testte giriş yetkisi olmayan (`NOLOGIN`) geçici rol, `SET LOCAL ROLE` ile yalnız uygulama yetkileriyle çalıştırılır; rol iki kez uygulanır. Kullanıcı, kapı, vardiya, yetki, geçiş ve audit yazması; kart sahipliği ve vardiya snapshot trigger'ları kontrol edilir. Audit/geçiş silme, migration tablosu okuma ve şema değişikliği reddedilir. Ayrı bir üretim koruması testi parola ile giriş yapan (`LOGIN`) uygulama hesabıyla API'yi açar; giriş, okuma ve audit'li yazmanın çalıştığını, süper kullanıcı ve varsayılan yönetici parolasının reddedildiğini doğrular. Testler kendi DB'lerini ve rollerini kaldırır.

Tek sunuculu Compose yığını yerelde ayrıca uçtan uca denenmiştir: uygulama hesabı TLS 1.3 ile bağlanır, TLS'siz ve CA'sız bağlantılar reddedilir. Gerçek hedef sunucudaki bağlantı yayın öncesi yeniden kabul edilmelidir.
