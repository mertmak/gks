# GKS arayüzü

React 19 ve Vite ile geliştirilen personel, vardiya, izin ve puantaj paneli. Tablolar AG Grid, grafikler Recharts, Excel indirmeleri ExcelJS kullanır. Public demo salt okunurdur; yönetim akışları yerel kurulumda kullanılabilir.

## Geliştirme

Önce [ana kurulum kılavuzuna](../README.md) göre backend ve PostgreSQL bağlantısını hazırlayın. Bu klasörde:

```sh
npm ci
npm run dev
```

Vite varsayılan olarak `127.0.0.1:5173` üzerinde çalışır; `/api` ve `/socket.io` isteklerini `127.0.0.1:3000` adresine yönlendirir. Farklı backend için `.env.example` içindeki `VITE_API_URL` ve `VITE_SOCKET_URL` ayarlarını kullanın. `VITE_` değişkenleri tarayıcıya gönderilir; secret içeremez. Üretim derlemesinde bu değerler build sırasında sabitlenir.

## Kontroller

```sh
npm test
npm run lint
npm run build
```

`npm test` tarih, istek yarışı/sayfalama ve XLSX sözleşmelerini kontrol eder. Tarayıcı kabulünün yerine geçmez. Büyük AG Grid ve ExcelJS paketleri gerektiğinde ayrı yüklenir; derlemenin chunk boyutu uyarısı bilinen sınırlamadır.

## Yapı

- `src/pages`: yönetim ve rapor ekranları.
- `src/components`: ortak tablo, form, modal ve dashboard bileşenleri.
- `src/hooks`: canlı liste, iptal edilebilir arama ve yinelenen gönderim koruması.
- `src/api`: HTTP, sayfalı liste ve Socket.IO bağlantıları.
- `src/utils`: iş günü/demo tarihi, oturum, Türkçe tablo etiketleri ve Excel aktarımı.

[Docker kurulumu](../docs/local-docker.md) · [Hesaplama kuralları](../docs/V1-hesaplama-kurallari.md)
