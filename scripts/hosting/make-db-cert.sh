#!/bin/sh
# Creates a private CA and a PostgreSQL server certificate whose name is the
# Compose service name `postgres`. The backend verifies the server with ca.crt.
# Usage: scripts/hosting/make-db-cert.sh <new-output-dir> [extra-dns-name ...]
# Keep ca.key offline after use; it is needed only to issue a new certificate.
set -eu

out=${1:?Usage: make-db-cert.sh <new-output-dir> [extra-dns-name ...]}
shift
if [ -e "$out" ]; then
    echo "Çıktı klasörü zaten var; mevcut anahtarlar değiştirilmez: $out" >&2
    exit 1
fi
command -v openssl >/dev/null || { echo "openssl gerekli." >&2; exit 1; }

umask 077
mkdir -p "$out"
san="DNS:postgres"
for name in "$@"; do
    case $name in
        *[!A-Za-z0-9.-]* | '') echo "Geçersiz DNS adı: $name" >&2; exit 1 ;;
    esac
    san="$san,DNS:$name"
done
days=${GKS_DB_CERT_DAYS:-825}

cat > "$out/server.ext" <<EXT
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
EXT

openssl req -x509 -new -noenc -newkey ec -pkeyopt ec_paramgen_curve:P-256 -sha256 -days 3650 \
    -subj "/CN=GKS Database CA" -keyout "$out/ca.key" -out "$out/ca.crt" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -new -noenc -newkey ec -pkeyopt ec_paramgen_curve:P-256 -sha256 \
    -subj "/CN=postgres" -keyout "$out/server.key" -out "$out/server.csr" 2>/dev/null
openssl x509 -req -in "$out/server.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial \
    -days "$days" -sha256 -extfile "$out/server.ext" -out "$out/server.crt" 2>/dev/null
openssl verify -CAfile "$out/ca.crt" "$out/server.crt" >/dev/null
rm -f "$out/server.csr" "$out/server.ext" "$out/ca.srl"
chmod 644 "$out/ca.crt" "$out/server.crt"

echo "Oluşturuldu: $out/ca.crt, $out/server.crt, $out/server.key (geçerlilik $days gün, adlar: $san)."
echo "ca.key yalnız yeni sertifika üretmek içindir; sunucudan alıp güvenli yerde saklayın."
