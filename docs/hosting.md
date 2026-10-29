# Tek sunuculu kurulum (HTTPS + PostgreSQL)

Bu kılavuz salt okunur public demoyu veya tek kurumlu küçük bir kurulumu, tek bir Linux sunucuda `compose.hosting.yaml` ile çalıştırır. Hedef örnek Ubuntu 24.04 (arm64 veya amd64) ve Docker Engine'dir; aynı dosya her iki mimaride değişmeden çalışır. Yerel geliştirme için [Docker ile yerel kurulum](local-docker.md) kullanılır.

```
İnternet → Caddy :80/:443 (Let's Encrypt)
             ├─ /api, /socket.io → backend:3000  (TRUST_PROXY_HOPS=1)
             └─ /                → frontend (nginx :80)
           backend → postgres:5432  (iç ağ, TLS + SCRAM)
```

- Dışarıya yalnız Caddy port açar. PostgreSQL ve backend internete açılmaz; veritabanı ağı (`db`) dış bağlantısı olmayan iç ağdır.
- PostgreSQL yalnız TLS ve SCRAM parolasıyla bağlantı kabul eder ([`hosting/pg_hba.conf`](../hosting/pg_hba.conf)). Backend sunucu sertifikasını kurulumla üretilen özel CA ile doğrular.
- API ve Socket.IO doğrudan backend'e gider. Böylece backend tam bir güvenilir proxy görür ve giriş/demo rate-limit'i gerçek istemci adresine göre çalışır.
- Migration, ilk yönetici ve seed hiçbir zaman servis açılışında çalışmaz; ayrı `installer` profiliyle elle çalıştırılır.
- Loglar Docker `json-file` sürücüsüyle 3 × 10 MB ile sınırlıdır. Servisler sağlık kontrollüdür ve `restart: unless-stopped` ile sunucu yeniden başlayınca kendiliğinden açılır.

## 1. Sunucu

- Yalnız 22, 80 ve 443 numaralı portları açın (bulut sağlayıcının güvenlik listesi **ve** sunucudaki güvenlik duvarı). Bazı bulut imajları kendi `iptables` kurallarıyla 80/443'ü kapalı getirir; kurulumdan sonra dışarıdan erişimi mutlaka deneyin. Örneğin Oracle Cloud'un Ubuntu imajında `INPUT` zinciri 22'den sonra her şeyi reddeder; kuralları bu `REJECT` satırından önce ekleyip **Docker'ı kurmadan önce** kalıcı yapın (sonradan kaydedilirse Docker'ın kendi kuralları da dosyaya yazılır):

  ```sh
  sudo iptables -S INPUT    # REJECT satırının sırasını görün
  sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
  sudo iptables -I INPUT 7 -p udp -m udp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```

- SSH'ta yalnız anahtarla giriş ve root girişi kapalı (`/etc/ssh/sshd_config.d/` altında `PermitRootLogin no`, `PasswordAuthentication no`), otomatik güvenlik güncellemeleri (`unattended-upgrades`) ve Docker'ın resmi deposundan Docker Engine + Compose eklentisi kurulur.
- Alan adının A (ve varsa AAAA) kaydı sunucuya yönlendirilir. Caddy sertifikayı ilk açılışta otomatik alır; bunun için 80 ve 443 dışarıdan erişilebilir olmalıdır.
- Kod salt okunur bir deploy anahtarıyla klonlanır; örneklerde `/opt/gks/app`.

## 2. Gizli dosyalar

Gizli dosyalar repodan ayrı bir klasörde tutulur (varsayılan `/opt/gks/env`). Klasör `700`, dosyalar `600` olmalıdır ve yalnız Docker'ı çalıştıran yönetici kullanıcıya ait olmalıdır.

```sh
sudo install -d -m 700 -o "$USER" /opt/gks/env
cd /opt/gks/app
scripts/hosting/make-db-cert.sh /opt/gks/env/db-tls
```

Betik özel bir CA ile `postgres` adına sunucu sertifikası üretir (EC P-256, varsayılan 825 gün, `GKS_DB_CERT_DAYS` ile değişir) ve var olan bir klasörün üzerine yazmaz. `ca.key` yalnız yeni sertifika üretmek içindir; kurulumdan sonra sunucudan alıp güvenli bir yerde saklayın. Sunucuda `ca.crt`, `server.crt` ve `server.key` kalır.

Dört metin dosyası oluşturun (`umask 077` ile). Rastgele değerler için `openssl rand -base64 48` (JWT) ve `openssl rand -hex 24` (parolalar) yeterlidir. Değerleri sohbet, issue veya commit'e yazmayın.

`/opt/gks/env/compose.env` — yalnız Compose değişkenleri, gizli değer içermez:

```sh
GKS_SITE_ADDRESS=gks.example.com
GKS_ENV_DIR=/opt/gks/env
```

`/opt/gks/env/postgres.env` — PostgreSQL kurulum (yönetici) hesabının parolası:

```sh
POSTGRES_PASSWORD=<rastgele>
```

`/opt/gks/env/backend.env` — servis ortamı; uygulama hesabını kullanır:

```sh
DB_NAME=gksdemo_v1
DB_USER=gks_app
DB_PASSWORD=<rastgele, uygulama hesabı>
JWT_SECRET=<en az 32 karakter rastgele>
FRONTEND_URL=https://gks.example.com
BUSINESS_TIMEZONE=Europe/Istanbul
DEMO_MODE=true
DEMO_USERNAME=gks-demo
# İsteğe bağlı: ziyaretçiye özel, yazılabilir simülasyon alanı (bkz. aşağıdaki not)
SANDBOX_MODE=true
```

`/opt/gks/env/install.env` — yalnız kurulum sırasında var olur; `backend.env` değerlerinin üzerine yazar:

```sh
DB_USER=gks_admin
DB_PASSWORD=<postgres.env ile aynı parola>
BOOTSTRAP_USERNAME=<ilk yönetici>
BOOTSTRAP_PASSWORD=<en az 10 karakter>
DEMO_SEED_CONFIRM=gksdemo_v1
RUNTIME_DB_USER=gks_app
RUNTIME_DB_CONFIRM=gksdemo_v1
```

`SANDBOX_MODE=true` demoda "Kendi Simülasyon Alanını Başlat" düğmesini açar: her ziyaretçi için demo verisinin kopyası olan ayrı bir PostgreSQL şeması (`sbx_…`) kurulur, `SANDBOX_TTL_MIN` (varsayılan 120) dakika sonra silinir; aynı anda en fazla `SANDBOX_MAX` (varsayılan 30) alan açılır. Uygulama hesabının şema oluşturabilmesi için `db:runtime-role` bu ayar `backend.env` içindeyken çalıştırılmalıdır (rol veritabanında `CREATE` alır; ayar kapalıyken yeniden çalıştırmak bu izni geri alır). Backend her açılışta eski alanları siler; sürüm güncellemesi açık alanları kapatır.

`DB_SERVER`, `DB_PORT`, `DB_SSL`, `DB_SSL_CA`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=1` ve kapalı kurulum/simülasyon ayarları Compose dosyasında sabittir. Salt okunur public demoda ilk yönetici zorunlu değildir; `BOOTSTRAP_*` satırları atlanırsa `admin:create` adımı da atlanır.

Kısaltma olarak:

```sh
alias gks='docker compose --env-file /opt/gks/env/compose.env -f /opt/gks/app/compose.hosting.yaml'
```

Alias yalnız etkileşimli kabukta çalışır. Cron ve betikler için aynı komutu küçük bir dosyaya koyun:

```sh
printf '#!/bin/sh\nexec docker compose --env-file /opt/gks/env/compose.env -f /opt/gks/app/compose.hosting.yaml "$@"\n' > /opt/gks/gks
chmod 755 /opt/gks/gks
```

## 3. İlk kurulum

```sh
gks --profile install build
gks up -d --wait postgres
```

Alan adı henüz sunucuyu göstermiyorsa önce `compose.env` içinde `GKS_SITE_ADDRESS=:80` ile yalnız HTTP açıp kurulumu doğrulayabilirsiniz; DNS kaydı yayılınca alan adını yazıp `gks up -d --force-recreate caddy backend` çalıştırın ve `FRONTEND_URL` değerinde yalnız `https://` adres bırakın. Caddy sertifikayı birkaç dakika içinde alır.

İsteğe bağlı ek adlar (ör. `www`), ana adrese kalıcı (301) yönlendirme alır; yol ve sorgu korunur ve kendi sertifikasını kullanır. Önce DNS'te ek adı da sunucuya yöneltin (A kaydı ya da ana ada CNAME), kayıt yayılınca `compose.env` dosyasına ekleyin ve `gks up -d --force-recreate caddy` çalıştırın. Birden fazla ad virgülle ayrılır (`www.gks.example.com, eski.example.com`). `FRONTEND_URL` değişmez; tarayıcı uygulamayı her zaman ana adreste açar.

```sh
GKS_REDIRECT_ADDRESSES=www.gks.example.com
```

PostgreSQL ilk açılışta UTF-8 ve `tr-TR` ICU ile kurulur; `gks_admin` kurulum hesabıdır. Uygulama giriş rolünü oluşturun (`psql` önce `gks_admin` parolasını, sonra yeni parolayı iki kez sorar; parola ekranda ve geçmişte görünmez):

```sh
gks exec postgres psql -U gks_admin -d postgres -c 'CREATE ROLE gks_app LOGIN'
gks exec postgres psql -U gks_admin -d postgres -c '\password gks_app'
```

Kurulum komutları TLS üzerinden, üretim modunda çalışır. Her komut tekrarlanabilir: `db:init` mevcut DB'ye dokunmaz, `db:migrate` uygulanmış dosyayı atlar, `admin:create` panel hesabı varsa bir şey yapmaz, `seed:demo` aynı sürümü çoğaltmaz.

```sh
gks --profile install run --rm installer npm run db:init
gks --profile install run --rm installer npm run db:migrate
gks --profile install run --rm installer npm run admin:create
gks --profile install run --rm installer npm run seed:demo
gks --profile install run --rm installer npm run db:runtime-role
```

Ardından kurulum değerlerini kaldırıp yığını açın:

```sh
rm /opt/gks/env/install.env
gks up -d --wait
gks ps
```

Backend açılışta 32 karakterden kısa `JWT_SECRET`, varsayılan `admin` parolası veya süper kullanıcı veritabanı hesabıyla çalışmayı reddeder; bu durumda `gks logs backend` nedeni gösterir. Uygulama hesabının yetkileri [veritabanı rolleri](database-roles.md) belgesinde açıklanır.

## 4. Kabul kontrolü

Dış ağdan ve gizli tarayıcı oturumundan:

- `https://<alan adı>/api/status` → `200`; sayfa HTTPS ile açılır, tarayıcı konsolunda mixed-content uyarısı yoktur.
- “Demoyu İncele” ile giriş; gezinti, Türkçe karakterli arama, 7 Eylül 2026 puantajı ve bir Excel indirmesi.
- Bütün yazma işlemleri `403 DEMO_READ_ONLY` döner (yönetici oturumunda da).
- Canlı yenileme (Socket.IO) bağlantısı kurulur.
- `sudo reboot` sonrası servisler kendiliğinden açılır.

Sunucuda bağlantının uygulama hesabıyla ve TLS ile kurulduğu şöyle görülür (`gks_admin` parolasını sorar):

```sh
gks exec postgres psql -U gks_admin -d postgres -c "SELECT a.usename, s.ssl, s.version FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid) WHERE a.usename = 'gks_app'"
```

## 5. Güncelleme

```sh
cd /opt/gks/app && git pull --ff-only
gks --profile install build
```

Yeni bir migration varsa önce yedek alın (bölüm 6), `install.env` dosyasını yalnız `DB_USER`/`DB_PASSWORD` kurulum değerleriyle geçici olarak yeniden oluşturun, `db:migrate` çalıştırın; migration yeni tablo ekliyorsa (ör. `003_kat_plani.sql` → `Bolgeler`, `004_tesis.sql` → `Katlar`) uygulama rolünün yetkileri için `db:runtime-role` komutunu da yeniden çalıştırın ve dosyayı tekrar silin. Sonra:

```sh
gks up -d --wait
```

Otomatik aşağı migration yoktur. Önceki sürüme dönmek için önceki commit'i derleyip açın; şema değiştiyse o sürümle alınmış yedeği yeni bir veritabanına geri yükleyip `DB_NAME` değerini ona çevirin. Salt okunur demo verisi sentetik olduğundan en kötü durumda yeni bir DB adıyla `db:init` → `db:migrate` → `seed:demo` → `db:runtime-role` yeniden kurulabilir.

## 6. Yedek ve geri yükleme

Yedek, konteynerdeki kurulum parolasını kullanır; parola komut satırına yazılmaz. `umask 077` yedek dosyasının yalnız sahibince okunabilmesini (`600`) sağlar. `/opt/gks/backup.sh` olarak kaydedip `chmod 700` verin:

```sh
#!/bin/sh
set -eu
umask 077
out=/opt/gks/backups/gks-$(date +%F).dump
/opt/gks/gks exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U gks_admin -Fc gksdemo_v1' > "$out.tmp"
mv "$out.tmp" "$out"
find /opt/gks/backups -name 'gks-*.dump' -mtime +7 -delete
```

Yarım kalan döküm `.tmp` olarak kalır ve 7 günlük setteki tam yedeklerin yerini almaz. Gece çalıştırmak için (sunucu saati genelde UTC'dir):

```sh
install -d -m 700 /opt/gks/backups
echo '30 3 * * * /opt/gks/backup.sh >> /opt/gks/backups/backup.log 2>&1' | crontab -
crontab -l
/opt/gks/backup.sh && /opt/gks/gks exec -T postgres pg_restore --list < "$(ls /opt/gks/backups/gks-*.dump | tail -1)" | head
```

`crontab -` mevcut tabloyu tümüyle değiştirir; başka cron işleri varsa önce `crontab -l` ile birleştirin. Yedeklerin bir kopyasını sunucu dışında saklayın.

Geri yükleme her zaman **yeni** bir veritabanına yapılır; çalışan DB'nin üzerine yazılmaz. Boş DB'yi `db:init` doğru dil/saat dilimi ayarlarıyla oluşturur; bunun için `install.env` dosyasını yalnız `DB_USER`/`DB_PASSWORD` kurulum değerleriyle geçici olarak yeniden oluşturun:

```sh
gks --profile install run --rm -e DB_NAME=gksdemo_restore installer npm run db:init
gks exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U gks_admin -d gksdemo_restore --no-owner' < /opt/gks/backups/gks-YYYY-MM-DD.dump
gks --profile install run --rm -e DB_NAME=gksdemo_restore -e RUNTIME_DB_USER=gks_app -e RUNTIME_DB_CONFIRM=gksdemo_restore installer npm run db:runtime-role
```

Ardından `install.env` dosyasını silin, `backend.env` içindeki `DB_NAME` değerini değiştirin ve `gks up -d --force-recreate backend` çalıştırın. Eski DB'yi doğrulama bitmeden silmeyin. Geri yükleme yayından önce en az bir kez denenmelidir.

## Sınırlar

Bu düzen tek sunuculudur: yüksek erişilebilirlik, otomatik yük devretme veya yönetilen veritabanı yedeği içermez. TLS sertifikası süresi dolmadan (varsayılan 825 gün) yeni sertifika üretilip PostgreSQL yeniden başlatılmalıdır. Secret yönetimi dosya izinlerine dayanır.
