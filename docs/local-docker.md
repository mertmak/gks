# Docker ile yerel kurulum

Bu akış tam yetkili yerel uygulama içindir. `compose.local.yaml` geliştirme ayarlarını seçer; public/üretim kurulumuna eklenmez. SQL ayrı çalışır. Komutlar proje kökünde çalıştırılır.

## SQL ve ortam dosyası

Erişilebilir bir geliştirme SQL Server ve yeni bir DB adı seçin. Uygulama Compose'u SQL kurmaz veya servis açılışında migration/seed çalıştırmaz. İsteğe bağlı `database/compose.development.yaml` SQL örneği verileri `gks-sql-data` volume'unda saklar ve yalnız `127.0.0.1:1434` portuna açar.

SQL Server konteyner desteği Linux x86-64 içindir; ARM emülasyonu desteklenen kurulum anlamına gelmez. Mac/ARM'den desteklenen başka bir makinedeki SQL Server'a bağlanabilirsiniz. [Microsoft platform açıklaması](https://learn.microsoft.com/en-za/sql/linux/containers/deploy?view=sql-server-ver16).

`gks_backend/.env.example` dosyasını `gks_backend/.env.local` olarak kopyalayın; mevcut dosya varsa üzerine yazmadan düzenleyin. `.env.local` Git ve Docker build context'inden dışlanır. Önemli değerler:

| Değişken | Yerel kullanım |
|---|---|
| `DB_SERVER` | Bilgisayarınızdaki SQL için `host.docker.internal`; diğer SQL için gerçek sunucu adresi |
| `DB_PORT` | SQL'in erişilebilir portu; örnek SQL Compose için `1434` |
| `DB_NAME` | Yeni ve ayrı DB, örneğin `GksDemo_Local` |
| `DB_USER`, `DB_PASSWORD` | Kendi geliştirme SQL kurulum hesabınız; yeni DB/şema oluşturabilmeli |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Yalnız yerel geliştirmede `false`, `true`; üretimde TLS ve geçerli sertifika zorunlu |
| `JWT_SECRET` | En az 32 rastgele karakter |
| `PORT` | Backend içinde `3000` |
| `DEMO_MODE` | Tam yerel yönetim için `false` |
| `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` | İlk yönetici; parola en az 10 karakter, UTF-8 olarak en fazla 72 bayt |
| `DEMO_SEED_CONFIRM` | Seed çalıştırılacaksa `DB_NAME` ile birebir aynı |

Backend konteynerindeki `localhost` SQL'i değil backend'i gösterir. Ortam dosyasını paylaşmayın. `ENABLE_SETUP=false` ve `ENABLE_SIMULATION=false` başlangıç ayarlarını koruyun.

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

Seed yalnız `GksDemo_`/`GksTest_` hedefinde tam eşleşen onay değişkeniyle çalışır. İlk CLI yöneticisinin denetim kaydı korunur; diğer iş verisi veya işlem geçmişi varsa seed reddedilir. Tekrar çalıştırmak kayıt çoğaltmaz. Salt okunur public demo kurulumunda yönetici oluşturmak gerekmez.

Örnek dönem **6–8 Eylül 2026**'dır. Yerel uygulama bugünü açar; örnek puantaj için 7 Eylül 2026'yı seçin. `DEMO_MODE=true` seçilirse tarih varsayılanları örnek döneme yönelir ve bütün iş verisi yazma işlemleri kapanır.

## Servisleri çalıştırma

Kurulumdan sonra ortam dosyasından `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` ve `DEMO_SEED_CONFIRM` değerlerini kaldırın. Normal servis için hedef DB'deki uygulama tablolarını okuyup yazabilen ayrı SQL hesabı kullanın; sunucu yöneticiliği/şema değiştirme yetkisi gerekmez. Hesabın oluşturulması SQL sağlayıcısına bağlıdır. Sonraki migration/seed için yetkili kurulum hesabını ayrı tutun.

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

`down` uygulamayı durdurur; ayrı SQL verisini ve `backend-logs` volume'unu kaldırmaz. SQL volume'unu kaldırmak verileri kaybettirir; olağan durdurmaya `--volumes` eklemeyin.

Frontend `VITE_*` ayarları build sırasında sabitlenir; değişince yeniden derleyin. Backend ortamı başlangıçta okunur; değişiklikten sonra `up -d --force-recreate` kullanın. İsteğe bağlı yerel simülasyon için `GKS_ENABLE_SIMULATION=true` ile yeniden `build` ve `up` gerekir; yalnız ayrı `GksReview_`/`GksTest_` DB'sinde, demo kapalıyken açılır.

## Tekrar üretilebilir kurulum kontrolü

Backend bağımlılıkları ve `gks_backend/.env` içindeki geliştirme SQL bağlantısı hazırken:

```sh
cd gks_backend
RUN_INSTALL_SMOKE=true node test-support/smoke-install.js
```

Araç rastgele yeni DB ve ayrı Compose projesi kullanır; mevcut `DB_NAME` hedefini değiştirmez. Docker içinden SQL adresi farklıysa `GKS_DOCKER_DB_SERVER`, varsayılan `18080` portu doluysa `GKS_SMOKE_PORT` verin. Sonunda yalnız kendi servislerini, volume'unu, geçici ortam dosyasını ve DB'sini kaldırır. Zorla sonlandırılan süreçler otomatik temizlenmeyebilir.

Bu kontrol yerel HTTP kurulumu içindir; desteklenen hedef SQL platformu, HTTPS ve dış ağ kabulünün yerine geçmez.
