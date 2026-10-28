# Docker ile yerel kurulum

Bu akış tam yetkili yerel uygulama içindir. `compose.local.yaml` geliştirme ayarlarını seçer; public/üretim kurulumuna eklenmez. PostgreSQL ayrı çalışır. PostgreSQL ve HTTPS dahil tek sunuculu yayın için [hosting kılavuzunu](hosting.md) kullanın. Komutlar proje kökünde çalıştırılır.

## PostgreSQL ve ortam dosyası

Erişilebilir bir geliştirme PostgreSQL sunucusu (18 önerilir) ve yeni bir DB adı seçin. Uygulama Compose'u veritabanı kurmaz veya servis açılışında migration/seed çalıştırmaz. İsteğe bağlı `database/compose.development.yaml` PostgreSQL 18 örneği arm64 ve amd64'te doğrudan çalışır, verileri `gks-pg-data` volume'unda saklar ve yalnız `127.0.0.1:5433` portuna açar:

```sh
# database/.env içinde GKS_DEV_PG_PASSWORD=<güçlü parola>
docker compose -f database/compose.development.yaml -p gks-dev up -d --wait
```

`gks_backend/.env.example` dosyasını `gks_backend/.env.local` olarak kopyalayın; mevcut dosya varsa üzerine yazmadan düzenleyin. `.env.local` Git ve Docker build context'inden dışlanır. Önemli değerler:

| Değişken | Yerel kullanım |
|---|---|
| `DB_SERVER` | Bilgisayarınızdaki PostgreSQL için `host.docker.internal`; diğerleri için gerçek sunucu adresi |
| `DB_PORT` | PostgreSQL'in erişilebilir portu; örnek Compose için `5433` |
| `DB_NAME` | Yeni ve ayrı DB; küçük harf, rakam ve alt çizgi, örneğin `gksdemo_local` |
| `DB_USER`, `DB_PASSWORD` | Geliştirme kurulum hesabınız (örnek Compose'da `gks_admin` ve `GKS_DEV_PG_PASSWORD`); yeni DB oluşturabilmeli |
| `DB_SSL` | Yalnız yerel geliştirmede `false`; üretimde (`NODE_ENV=production`) TLS ve sertifika doğrulaması her zaman açıktır, özel CA için `DB_SSL_CA` |
| `JWT_SECRET` | En az 32 rastgele karakter |
| `PORT` | Backend içinde `3000` |
| `DEMO_MODE` | Tam yerel yönetim için `false` |
| `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` | İlk yönetici; parola en az 10 karakter, UTF-8 olarak en fazla 72 bayt |
| `DEMO_SEED_CONFIRM` | Seed çalıştırılacaksa `DB_NAME` ile birebir aynı |

Backend konteynerindeki `localhost` veritabanını değil backend'i gösterir. Ortam dosyasını paylaşmayın. `ENABLE_SETUP=false` ve `ENABLE_SIMULATION=false` başlangıç ayarlarını koruyun.

```sh
export GKS_ENV_FILE=./gks_backend/.env.local
export GKS_HTTP_PORT=8080
docker compose -f compose.yaml -f compose.local.yaml build
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:init
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run db:migrate
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run admin:create
```

`db:init` mevcut DB'yi silmez; migration uygulanmış dosyaları atlar. `admin:create`, herhangi bir panel hesabı varsa yeni yönetici oluşturmaz.

## İsteğe bağlı sentetik örnekler

İş tabloları hâlâ boşken, ilk yöneticiden sonra:

```sh
docker compose -f compose.yaml -f compose.local.yaml run --rm --no-deps backend npm run seed:demo
```

Seed yalnız `gksdemo_`/`gkstest_` hedefinde tam eşleşen onay değişkeniyle çalışır. İlk CLI yöneticisinin denetim kaydı korunur; diğer iş verisi veya işlem geçmişi varsa seed reddedilir. Tekrar çalıştırmak kayıt çoğaltmaz. Salt okunur public demo kurulumunda yönetici oluşturmak gerekmez.

Örnek dönem **6–8 Eylül 2026**'dır. Yerel uygulama bugünü açar; örnek puantaj için 7 Eylül 2026'yı seçin. `DEMO_MODE=true` seçilirse tarih varsayılanları örnek döneme yönelir ve bütün iş verisi yazma işlemleri kapanır.

## Servisleri çalıştırma

Kurulumdan sonra ortam dosyasından `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` ve `DEMO_SEED_CONFIRM` değerlerini kaldırın. Normal servis için hedef DB'deki uygulama tablolarını okuyup yazabilen ayrı PostgreSQL giriş rolü kullanın; süper kullanıcı veya şema değiştirme yetkisi gerekmez. Sonraki migration/seed için yetkili kurulum hesabını ayrı tutun.

Uygulama kimliğinin tablo izinlerini [veritabanı rolleri kılavuzundaki](database-roles.md) `db:runtime-role` adımıyla verin. Bu adım ilk kurulum/migration/seed sonrasında ve servis başlatılmadan önce yapılır; var olan geniş yetkileri otomatik kaldırmaz.

```sh
docker compose -f compose.yaml -f compose.local.yaml up -d --wait
docker compose -f compose.yaml -f compose.local.yaml ps
```

Arayüz `http://localhost:8080`, sağlık kontrolü `http://localhost:8080/api/status`. Portu değiştirdiyseniz URL'yi uyarlayın. Nginx `/api` ve `/socket.io` isteklerini backend'e taşır. Backend dışarıya port açmaz; CORS adresleri yerel porttan türetilir.

```sh
docker compose -f compose.yaml -f compose.local.yaml restart
docker compose -f compose.yaml -f compose.local.yaml down
```

`down` uygulamayı durdurur; ayrı veritabanı verisini ve `backend-logs` volume'unu kaldırmaz. Veritabanı volume'unu kaldırmak verileri kaybettirir; olağan durdurmaya `--volumes` eklemeyin.

Frontend `VITE_*` ayarları build sırasında sabitlenir; değişince yeniden derleyin. Backend ortamı başlangıçta okunur; değişiklikten sonra `up -d --force-recreate` kullanın. İsteğe bağlı yerel simülasyon için `GKS_ENABLE_SIMULATION=true` ile yeniden `build` ve `up` gerekir; yalnız ayrı `gksreview_`/`gkstest_` DB'sinde, demo kapalıyken açılır.

## Tekrar üretilebilir kurulum kontrolü

Backend bağımlılıkları ve `gks_backend/.env` içindeki geliştirme PostgreSQL bağlantısı hazırken:

```sh
cd gks_backend
RUN_INSTALL_SMOKE=true node test-support/smoke-install.js
```

Araç rastgele yeni DB ve ayrı Compose projesi kullanır; mevcut `DB_NAME` hedefini değiştirmez. Docker içinden veritabanı adresi veya portu farklıysa `GKS_DOCKER_DB_SERVER`/`GKS_DOCKER_DB_PORT`, varsayılan `18080` portu doluysa `GKS_SMOKE_PORT` verin. Sonunda yalnız kendi servislerini, volume'unu, geçici ortam dosyasını ve DB'sini kaldırır. Zorla sonlandırılan süreçler otomatik temizlenmeyebilir.

Bu kontrol yerel HTTP kurulumu içindir; hedef sunucudaki TLS'li veritabanı, HTTPS ve dış ağ kabulünün yerine geçmez.
