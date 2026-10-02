# Kurulum ve uygulama veritabanı hesapları

Migration ve ilk kurulum için kullanılan yetkili SQL hesabı uygulamanın sürekli çalışan bağlantısı olmamalıdır. GKS, hazır bir veritabanı kullanıcısını `gks_runtime` rolüne ekleyen `db:runtime-role` komutunu sağlar. Komut sunucu login'i/parola oluşturmaz, bağlantı şifrelemesini değiştirmez ve kullanıcı silmez.

## Kurulum sırası

1. Yetkili kurulum hesabıyla yeni DB, migration, ilk panel yöneticisi ve isteniyorsa sentetik seed adımlarını tamamlayın.
2. SQL sağlayıcınızda yalnız uygulamaya ayrılmış yeni bir login/kimlik oluşturun. Ona sunucu yöneticiliği, veritabanı sahipliği veya geniş yazma/şema rolleri vermeyin. SQL Server login kullanılıyorsa hedef DB'de bir kurulum yöneticisi aşağıdaki eşlemeyi oluşturabilir:

   ```sql
   CREATE USER [gks_app] FOR LOGIN [gks_app];
   ```

   Login'in güvenli parolası veya yönetilen kimlik yapılandırması sağlayıcıda hazırlanmalıdır. Parolayı SQL dosyasına veya Git'e yazmayın.

3. Backend ortamı hâlâ **kurulum hesabını** kullanırken `RUNTIME_DB_USER=gks_app` ve `RUNTIME_DB_CONFIRM` değerini tam olarak hedef `DB_NAME` ile aynı yapın. Backend klasöründe çalıştırın:

   ```sh
   npm run db:runtime-role
   ```

   Docker ile yerel kurulumda bu iki değeri kurulum ortam dosyasına geçici olarak ekleyip proje kökünde çalıştırın:

   ```sh
   docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:runtime-role
   ```

4. Normal servis ortamında `DB_USER` ve `DB_PASSWORD` değerlerini uygulama hesabına geçirin. `RUNTIME_DB_USER`, `RUNTIME_DB_CONFIRM`, bootstrap parolası ve seed onayını bu dosyadan kaldırın. Servisi yeniden oluşturun. Kurulum hesabının kimlik bilgilerini ayrı ve erişimi sınırlı bir yerde saklayın.
5. Sonraki migration veya seed işlemlerini yeniden yetkili kurulum hesabıyla, uygulama hesabının yetkilerini genişletmeden çalıştırın.

## Rolün kapsamı

| Tablolar | Verilen işlemler |
|---|---|
| `Users`, `Doors`, `Vardiyalar`, `Mesai_Onaylari` | Okuma, ekleme, güncelleme |
| `Personel_Vardiya`, `Yoneticiler` | Okuma, ekleme, güncelleme, silme |
| `Permissions`, `Izinler` | Okuma, ekleme, silme |
| `Personel_Calisma_Gecmisi`, `Logs`, `SystemLogs`, `DoorLogs` | Okuma, ekleme |

Rol yeni tablo/şema oluşturma veya değiştirme, migration/seed metadatasına erişim, audit/geçiş geçmişini değiştirme veya silme izni vermez. Yeni bir iş akışı eklenirse izinler ayrıca gözden geçirilmelidir. Public demoda aynı rolün mevcut olması HTTP yazma engelini kaldırmaz; salt okunur koruma API'de ayrıca uygulanır.

Komut tekrarlanabilir; rol/üyelik zaten varsa yeniden oluşturmaz. Bütün grant ve üyelik değişiklikleri tek transaction içindedir. Eksik tablo veya bulunmayan kullanıcıda değişiklikler geri alınır.

Bu komut **önceden verilmiş ek yetkileri kaldırmaz**. Var olan `db_owner`, `sysadmin`, başka rol üyelikleri veya doğrudan grant'leri olan bir hesabı otomatik olarak kısıtlamaz. Yeni, yalnız bu rolü kullanan bir uygulama kimliği tercih edin; hedef sunucudaki etkili yetkileri SQL yöneticiniz doğrulamalıdır.

## Yerel doğrulama sınırı

İzole SQL testinde login'i olmayan geçici DB kullanıcısıyla rol iki kez uygulanır. Kullanıcı, kapı, vardiya, yetki, geçiş ve audit yazması; kart sahipliği ve vardiya snapshot trigger'ları kontrol edilir. Audit/geçiş silme, migration tablosu okuma ve şema değişikliği reddedilir. Test kendi DB'sini kaldırır; gerçek sunucu hesabı oluşturmaz. Gerçek sağlayıcı login'i, TLS ve üretim bağlantısı ayrıca kabul edilmelidir.
