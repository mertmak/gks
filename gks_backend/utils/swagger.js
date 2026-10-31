// Explicit API contract: independent of process.cwd() and route comment discovery.
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const text = maxLength => ({ type: 'string', maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const array = items => ({ type: 'array', items });
const json = schema => ({ 'application/json': { schema } });
const response = (description, schema = ref('Error')) => ({ description, content: json(schema) });
const date = { type: 'string', format: 'date', description: 'YYYY-MM-DD; 1753-01-02–9999-12-29. Gece vardiyası sorgusu için komşu günler ayrılır.', example: '2026-09-07' };
const optionalDate = { oneOf: [{ ...date, nullable: true }, { type: 'string', enum: [''] }], description: 'Opsiyonel alanlarda null veya boş metin kabul edilir.' };
const id = integer(1, 2147483647);
const bit = { oneOf: [{ type: 'boolean' }, { type: 'integer', enum: [0, 1] }] };
const time = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '09:00' };
const decision = { type: 'string', enum: ['Onaylandı', 'Reddedildi', 'Bekliyor'] };
const username = { ...text(50), minLength: 1 };
const password = { type: 'string', minLength: 10, maxLength: 72, writeOnly: true, description: 'bcrypt sınırı: UTF-8 kodlamasında en fazla 72 bayt; çok baytlı karakterlerde karakter sayısı daha az olabilir.' };
const doorIds = { ...array(id), maxItems: 1000, uniqueItems: true };
const target = { hedef_turu: { type: 'string', enum: ['Tumu', 'Sirket', 'Departman'] }, hedef_deger: text(100) };
const properties = {
  PersonelInput: { ad_soyad: { ...text(100), minLength: 1 }, tc: { type: 'string', pattern: '^\\d{11}$' }, sicil: { type: 'string', pattern: '^\\d{5}$' }, rfid: { type: 'string', pattern: '^(\\d{11})?$' }, sirket: text(100), departman: text(100), gorev: text(100), ise_giris: optionalDate },
  DoorInput: { kapi_adi: { ...text(100), minLength: 1 }, kapi_turu: { type: 'string', enum: ['Ana Giriş', 'Ana Çıkış', 'İç Geçiş', 'Yemekhane Giriş', 'Yemekhane Çıkış', 'Mola / Sigara Alanı'], default: 'İç Geçiş' }, departman: text(100), konum: text(100), yetki_ver: { type: 'boolean', description: 'Yalnız oluşturmada ve simülasyon ortamında: kapıya tüm aktif personeli yetkilendirir.' } },
  ShiftInput: { vardiya_adi: { ...text(100), minLength: 1 }, mesai_baslangic: time, mesai_bitis: time, yemek_baslangic: { oneOf: [{ ...time, nullable: true }, { type: 'string', enum: [''] }] }, yemek_bitis: { oneOf: [{ ...time, nullable: true }, { type: 'string', enum: [''] }] }, tolerans_dk: { ...integer(0, 120), default: 0 }, mola_hakki_dk: { ...integer(0, 480), default: 0 }, calisma_gunleri: { type: 'string', pattern: '^[0-6](,[0-6])*$', default: '1,2,3,4,5' } },
  LeaveInput: { user_id: id, izin_turu: { ...text(50), minLength: 1 }, baslangic: date, bitis: date, aciklama: text(255), durum: { ...decision, default: 'Onaylandı' } },
  OvertimeItem: { user_id: id, tarih: date, hesaplanan_dk: { ...integer(0, 2880), description: 'Uyumluluk için kabul edilir; karar hesaplamasında sunucu esas alınır.' }, onaylanan_dk: integer(0, 2880) },
};
const schemas = {
  Error: object({ success: { type: 'boolean', example: false }, message: { type: 'string' }, code: { type: 'string', example: 'DEMO_READ_ONLY' } }, ['success', 'message']),
  Success: object({ success: { type: 'boolean', example: true }, message: { type: 'string' } }, ['success']),
  Token: object({ success: { type: 'boolean', example: true }, token: { type: 'string', description: 'Normal girişte 8 saat, demo girişinde 2 saat geçerli JWT.' } }, ['success', 'token']),
  Pagination: object({ page: integer(1, 100000), limit: integer(1, 500), total: integer(0), totalPages: integer(0) }, ['page', 'limit', 'total', 'totalPages']),
  PagedList: object({ data: array({ type: 'object' }), pagination: ref('Pagination') }, ['data', 'pagination']),
  LoginInput: object({ username, password: { type: 'string', minLength: 1, maxLength: 200, writeOnly: true } }, ['username', 'password']),
  SetupInput: object({ username, password }, ['username', 'password']),
  AccountInput: object({ username, password, rol: { type: 'string', enum: ['admin', 'user'], default: 'user' } }, ['username', 'password']),
  PasswordInput: object({ eskiSifre: { type: 'string', minLength: 1, writeOnly: true }, yeniSifre: password }, ['eskiSifre', 'yeniSifre']),
  PersonelInput: object(properties.PersonelInput, ['ad_soyad', 'tc', 'sicil']),
  DoorInput: object(properties.DoorInput, ['kapi_adi']),
  ShiftInput: { ...object(properties.ShiftInput, ['vardiya_adi', 'mesai_baslangic', 'mesai_bitis']), description: 'Başlangıç/bitiş aynı olamaz. Gece yarısı 00:00 geçerlidir. Yemek saatleri birlikte girilir veya ikisi de boş bırakılır. Tanım düzenlemesi geçmiş atama snapshotlarını değiştirmez.' },
  LeaveInput: { ...object(properties.LeaveInput, ['user_id', 'izin_turu', 'baslangic', 'bitis']), description: 'Bitiş başlangıçtan önce olamaz. Onaylı/bekleyen aralıklar, sınır günleri dahil çakışamaz.' },
  OvertimeInput: object({ ...properties.OvertimeItem, durum: decision, aciklama: text(255) }, ['user_id', 'tarih', 'onaylanan_dk', 'durum']),
  BulkOvertimeInput: object({ mesailer: { ...array(object(properties.OvertimeItem, ['user_id', 'tarih', 'onaylanan_dk'])), minItems: 1, maxItems: 2000 }, durum: decision, aciklama: text(255) }, ['mesailer', 'durum']),
  StatusInput: object({ durum: bit, cikis_tarihi: optionalDate, cikis_nedeni: text(255) }, ['durum']),
  AssignmentInput: object({ vardiya_id: { oneOf: [{ ...id, nullable: true }, { type: 'string', enum: [''] }], description: 'null veya boş metin atamayı kaldırır.' } }),
  PermissionsInput: object({ doorIds }, ['doorIds']),
  AttendanceRow: object({ User_ID: id, Ad_Soyad: text(100), Sicil_No: text(50), TarihStr: date, Durum: { type: 'string' }, Izin_Cakismasi: { type: 'boolean' }, Onayli_Izin_Sayisi: integer(0), Hesaplanan_Dk: integer(0), Onaylanan_Dk: integer(0), Fazla_Mesai_Dk: integer(0), Mesai_Durumu: decision, Mesai_Aciklama: { ...text(255), nullable: true }, Mesai_Islemi_Yapan: { type: 'string', nullable: true }, Mesai_Islem_Zamani: { type: 'string', format: 'date-time', nullable: true } }),
};
const parameter = (name, schema, required = false, description) => ({ name, in: 'query', required, schema, ...(description ? { description } : {}) });
const paging = [parameter('page', { ...integer(1, 100000), default: 1 }), parameter('limit', { ...integer(1, 500), default: 100 }), parameter('arama', text(100))];
const logParameters = [...paging, parameter('baslangic', date), parameter('bitis', date)];
const rangeParameters = [parameter('baslangic', date, true), parameter('bitis', date, true)];
const pathId = { name: 'id', in: 'path', required: true, schema: id };
function operation(tag, summary, { body, output = ref('Success'), description = '', parameters = [], open = false, admin = false, errors = {} } = {}) {
  return {
    tags: [tag], summary, description: [admin ? 'Yönetici yetkisi gerekir. Demo modunda iş verisi yazma işlemleri kapalıdır.' : '', description].filter(Boolean).join(' '),
    ...(open ? { security: [] } : {}), ...(parameters.length ? { parameters } : {}),
    ...(body ? { requestBody: { required: true, content: json(typeof body === 'string' ? ref(body) : body) } } : {}),
    responses: {
      200: response('Başarılı', output), 429: response('Demo veya giriş istek sınırı aşıldı.'),
      ...(body ? { 413: response('İstek gövdesi 256 kB sınırını aştı.') } : {}), 400: response('Geçersiz girdi'), 500: response('İşlem tamamlanamadı; SQL ayrıntıları istemciye gönderilmez.'),
      ...(!open ? { 401: response('Oturum geçersiz veya süresi dolmuş.') } : {}),
      ...(admin ? { 403: response('Yönetici yetkisi yok veya demo salt okunur.') } : {}),
      ...Object.fromEntries(Object.entries(errors).map(([code, message]) => [code, response(message)]))
    }
  };
}
const paths = {};
const add = (method, path, tag, summary, options = {}) => {
  paths[path] ??= {};
  paths[path][method] = operation(tag, summary, { ...options, parameters: [...(path.includes('{id}') ? [pathId] : []), ...(options.parameters || [])] });
};
add('get', '/status', 'Sistem', 'SQL hazırlık kontrolü', { open: true, output: object({ success: { type: 'boolean' }, durum: { type: 'string' } }), errors: { 503: 'Veritabanına erişilemiyor.' } });
add('get', '/public-config', 'Sistem', 'Demo durumu, referans günü ve iş saat dilimi', { open: true, output: object({ demo: { type: 'boolean' }, referenceDate: { ...date, nullable: true }, businessTimeZone: { type: 'string', example: 'Europe/Istanbul' }, sandbox: { type: 'boolean', description: 'Kişisel simülasyon alanı açılabilir mi.' }, sandboxMinutes: { ...integer(10, 720), nullable: true } }) });
add('get', '/features', 'Sistem', 'Simülasyon kullanılabilirliği (local veya kişisel simülasyon alanı)', { output: object({ simulation: { type: 'boolean' } }) });
const sandboxToken = object({ success: { type: 'boolean', example: true }, token: { type: 'string', description: 'Yalnız bu simülasyon alanında yönetici yetkisi veren JWT.' }, expiresAt: { type: 'string', format: 'date-time' } }, ['success', 'token', 'expiresAt']);
add('post', '/sandbox', 'Simülasyon Alanı', 'Kişisel simülasyon alanı aç', { open: true, output: sandboxToken, description: 'Yalnız DEMO_MODE=true ve SANDBOX_MODE=true iken. Demo verisinin ziyaretçiye özel bir kopyası (ayrı PostgreSQL şeması) oluşturulur; süre dolunca silinir. Hesap işlemleri kopyada kapalıdır, satır kotaları aşılırsa 409 SANDBOX_QUOTA döner.', errors: { 404: 'Simülasyon alanı kapalı.', 429: 'Oluşturma sınırı aşıldı.', 503: 'Eşzamanlı alan sınırı dolu.' } });
add('post', '/sandbox/reset', 'Simülasyon Alanı', 'Simülasyon alanını sıfırla', { output: sandboxToken, description: 'Mevcut kopya silinir ve demo verisinden yenisi açılır; yeni token döner.', errors: { 400: 'Oturum bir simülasyon alanına ait değil.', 404: 'Simülasyon alanı kapalı.', 429: 'Oluşturma sınırı aşıldı.', 503: 'Eşzamanlı alan sınırı dolu.' } });
add('delete', '/sandbox', 'Simülasyon Alanı', 'Simülasyon alanını kapat ve sil', { errors: { 400: 'Oturum bir simülasyon alanına ait değil.', 404: 'Simülasyon alanı kapalı.' } });
add('post', '/login', 'Auth', 'Oturum aç', { open: true, body: 'LoginInput', output: ref('Token'), errors: { 401: 'Kullanıcı adı veya parola hatalı.', 429: 'Başarısız giriş sınırı aşıldı.' } });
add('post', '/demo-login', 'Auth', 'Salt okunur demo oturumu aç', { open: true, output: ref('Token'), errors: { 404: 'Demo modu kapalı.', 429: 'Giriş sınırı aşıldı.', 503: 'Demo hesabı hazır değil.' } });
add('post', '/ilk-kurulum', 'Auth', 'İlk local yöneticiyi oluştur', { open: true, body: 'SetupInput', description: 'Yalnız üretim dışı ENABLE_SETUP=true ortamında ve hiç hesap yokken kullanılabilir. Demo modu yazmayı reddeder.', errors: { 403: 'Hesap zaten var veya demo salt okunur.', 404: 'Kurulum kapalı.', 429: 'Kurulum/giriş sınırı aşıldı.' } });
add('get', '/hesaplar', 'Auth', 'Panel hesaplarını listele', { admin: true, output: array({ type: 'object' }), description: 'Parola hashleri veya token döndürülmez.' });
add('post', '/hesap-ekle', 'Auth', 'Panel hesabı oluştur', { admin: true, body: 'AccountInput' });
add('delete', '/hesap-sil/{id}', 'Auth', 'Panel hesabını sil', { admin: true, description: 'Hesap kendi kendisini silemez.', errors: { 404: 'Hesap bulunamadı.' } });
add('post', '/sifre-degistir', 'Auth', 'Kendi parolasını değiştir', { body: 'PasswordInput', description: 'Normal local kullanıcı da kendi parolasını değiştirebilir. Başarıda önceki oturumlar geçersizleşir; eşzamanlı eski-parola değişimlerinden yalnız biri başarılı olur.', errors: { 403: 'Demo salt okunur.', 401: 'Eski parola veya oturum geçersiz.' } });
add('get', '/users', 'Personel', 'Sayfalı personel listesi', { parameters: [...paging, parameter('departman', text(100)), parameter('durum', { type: 'string', enum: ['', '0', '1', 'tumu'] })], output: ref('PagedList'), description: 'Arama: ad soyad, sicil, TC ve kart; departman kısmi eşleşir.' });
add('post', '/users', 'Personel', 'Personel oluştur', { admin: true, body: 'PersonelInput', errors: { 409: 'Kart, TC veya sicil çakışması.' } });
add('put', '/users/{id}', 'Personel', 'Personel kimlik bilgilerini düzenle', { admin: true, body: 'PersonelInput', errors: { 404: 'Personel bulunamadı.' }, description: 'Kart ve işe giriş tarihi gönderilmezse korunur; boş kart kaldırılır. Eski çalışma dönemiyle çakışan tarih reddedilir.' });
add('patch', '/users/{id}/status', 'Personel', 'İşten çıkar veya yeniden işe al', { admin: true, body: 'StatusInput', errors: { 404: 'Personel bulunamadı.' }, description: 'Pasife almada çıkış tarihi zorunlu. Yeniden işe alma iş gününden başlar; önceki dönem arşivlenir.' });
add('get', '/users/{id}/doors', 'Personel', 'Kişinin kapı ID listesini getir', { output: array(id), errors: { 404: 'Personel bulunamadı.' } });
add('get', '/users/{id}/shift', 'Personel', 'Kişinin açık vardiya atamasını getir', { errors: { 404: 'Personel bulunamadı.' }, output: object({ vardiya_id: { oneOf: [id, { type: 'string', enum: [''] }] } }) });
for (const [suffix, body, detail] of [['doors', 'PermissionsInput', 'Kapı yetkileri'], ['shift', 'AssignmentInput', 'Vardiya ataması']]) {
  add('post', `/users/{id}/${suffix}`, 'Personel', detail, { admin: true, body, errors: { 404: 'Personel veya hedef kayıt bulunamadı.' } });
}
for (const [suffix, fields, required] of [['doors', { doorIds }, ['doorIds']], ['shift', schemas.AssignmentInput.properties, []], ['status', schemas.StatusInput.properties, ['durum']]]) {
  add('post', `/users/bulk/${suffix}`, 'Personel', `Toplu ${suffix} işlemi`, { admin: true, body: object({ ...target, ...fields }, ['hedef_turu', ...required]), errors: { 404: 'Hedef grupta uygun personel veya hedef kayıt bulunamadı.', 409: 'Çalışma dönemiyle çakışan işlem.' }, description: 'İşe alım yalnız pasif, diğer toplu işlemler aktif kişileri hedefler. Şirket/departman hedefi boş olamaz; tam eşleşir. Hata halinde bütün işlem geri alınır. Çıkış tarihi kuralı tekli işlemle aynıdır.' });
}
for (const [path, tag, body] of [['/doors', 'Kapılar', 'DoorInput'], ['/shifts', 'Vardiyalar', 'ShiftInput']]) {
  add('get', path, tag, 'Kayıtları listele', { output: array({ type: 'object' }) });
  add('post', path, tag, 'Yeni kayıt oluştur', { admin: true, body, ...(path === '/doors' ? { output: object({ success: { type: 'boolean' }, message: { type: 'string' }, id }), errors: { 403: 'Toplu yetki simülasyon ortamı dışında istendi.' } } : {}) });
  add('put', path + '/{id}', tag, 'Kaydı düzenle', { admin: true, body, errors: { 404: 'Kayıt bulunamadı.' } });
  add('patch', path + '/{id}/status', tag, 'Aktiflik durumunu değiştir', { admin: true, body: object({ durum: bit }, ['durum']), errors: { 404: 'Kayıt bulunamadı.' }, description: path === '/doors' ? 'Kapı pasife alındığında mevcut yetkileri kaldırılır.' : 'Geçmiş atama tanımları korunur.' });
}
const planRef = description => ({ type: 'string', pattern: '^[A-Za-z0-9_-]{1,40}$', description });
const floorLevel = object({ id, ref: planRef('İstek içinde katı adlandırır; yeni katlarda ID yoktur.'), kat_adi: { ...text(100), minLength: 1 }, sira: integer(-100, 100) }, ['ref', 'kat_adi', 'sira']);
const floorArea = object({ id, ref: planRef('İstek içinde bölgeyi adlandırır; yeni bölgelerde ID yoktur.'), kat: planRef('Bölgenin katının ref değeri.'), bolge_adi: { ...text(100), minLength: 1 },
  bolge_turu: { type: 'string', enum: ['Lobi', 'Ofis', 'Yemekhane', 'Mola', 'Merdiven/Asansör', 'Üretim', 'Depo', 'Soyunma', 'Diğer'], default: 'Diğer' },
  noktalar: { type: 'array', minItems: 3, maxItems: 40, items: { type: 'array', minItems: 2, maxItems: 2, items: integer(0, 2000) }, description: 'Çokgen köşeleri [[x,y],…], çizim sırasıyla; kendini kesemez, en az 40×40 alan.' },
  dikey_grup: { ...text(40), nullable: true, description: 'Yalnız Merdiven/Asansör: aynı gruptaki bölgeler katlar arası bağlıdır.' } }, ['ref', 'kat', 'bolge_adi', 'noktalar']);
const floorDoor = object({ id, plan_x: integer(0, 2000), plan_y: integer(0, 2000), bolge_a: { type: 'string', nullable: true, description: 'Bölge ref değeri; null bina dışıdır.' }, bolge_b: { type: 'string', nullable: true },
  yon_kisiti: { type: 'string', enum: ['Çift', 'A→B', 'B→A'], default: 'Çift', description: 'Tek yönlü kapı (turnike); A = bolge_a tarafı.' } }, ['id', 'plan_x', 'plan_y']);
add('get', '/kat-plani', 'Kat Planı', 'Katları, bölgeleri ve kapı konumlarını getir', { output: object({ katlar: array({ type: 'object' }), bolgeler: array({ type: 'object' }), kapilar: array({ type: 'object' }) }), description: 'Bölgelerde Noktalar çokgen köşeleridir. Kapılarda Plan_X/Plan_Y null ise kapı plana yerleştirilmemiştir; Bolge_A_ID/Bolge_B_ID null ise o taraf bina dışıdır. Yetkili_Sayisi aktif yetkili personel sayısıdır.' });
add('put', '/kat-plani', 'Kat Planı', 'Kat planını toplu kaydet', { admin: true, body: object({ katlar: { ...array(floorLevel), maxItems: 10 }, bolgeler: { ...array(floorArea), maxItems: 60 }, kapilar: { ...array(floorDoor), maxItems: 60 } }, ['katlar', 'bolgeler', 'kapilar']), description: 'İstek planın tamamıdır: listede olmayan kat ve bölgeler silinir, listede olmayan kapılar plandan kaldırılır. Koordinatlar 0–2000; kapının iki bölgesi aynı katta olmalıdır. Tek transaction içinde kapı işlem loguyla kaydedilir.', errors: { 404: 'Kat, bölge veya kapı bulunamadı.' } });
add('post', '/kat-plani/sablon', 'Kat Planı', 'Boş plana hazır şablon uygula', { admin: true, body: object({ sablon: { type: 'string', enum: ['ofis', 'fabrika'], default: 'ofis' } }), output: object({ success: { type: 'boolean' }, message: { type: 'string' }, placed: integer(0), created: integer(0) }), description: 'Ofis: tek kat, beş bölge. Fabrika: iki kat, merdivenle bağlı; yemekhaneye iki kapıdan girilir. Mevcut kapıları türlerine göre yerleştirir ve eksik türler için yeni kapı ekler; simülasyon ortamında eklenen kapılara aktif personel yetkilendirilir.', errors: { 409: 'Planda zaten bölge var.' } });
add('get', '/leaves', 'İzinler', 'İzinleri ve eski çakışma uyarılarını listele', { output: array({ type: 'object' }), description: 'Cakisma_Var onaylı/bekleyen aralık çakışmasını işaretler; reddedilmiş kayıt engel oluşturmaz.' });
add('post', '/leaves', 'İzinler', 'İzin kaydet', { admin: true, body: 'LeaveInput', errors: { 404: 'Personel bulunamadı.', 409: 'Onaylı veya bekleyen izinle tarih çakışması.' } });
add('delete', '/leaves/{id}', 'İzinler', 'İzin kaydını iptal et', { admin: true, errors: { 404: 'İzin bulunamadı.' } });
const overtimeDescription = 'Sunucu yeniden hesaplar. Onay sınırı 0–min(2880, hesaplanan+120); red/bekleme süreleri sıfırdır. Eski çakışan onaylı izinler düzeltilene kadar karar verilemez. Karar ve audit aynı transaction içinde kaydedilir.';
add('get', '/overtimes', 'Mesailer', 'Mesai ve izin çakışması satırları', { parameters: rangeParameters, output: array(ref('AttendanceRow')), description: 'En fazla 366 takvim günü; hesaplanan mesaisi, mevcut kararı veya izin çakışması olan satırlar döner.' });
for (const [path, body] of [['/overtimes/approve', 'OvertimeInput'], ['/overtimes/approve-bulk', 'BulkOvertimeInput']]) add('post', path, 'Mesailer', 'Mesai kararını kaydet', { admin: true, body, description: overtimeDescription + ' Toplu istekte aynı personel/gün yinelenemez; tüm işlem atomiktir.', errors: { 404: 'Personel bu gün rapor kapsamı dışında.', 409: 'Çakışan onaylı izinler var.' } });
add('get', '/reports/daily-attendance', 'Raporlar', 'Günlük puantaj', { parameters: [parameter('tarih', date)], output: array(ref('AttendanceRow')), description: 'Tarih verilmezse local iş günü veya demo referans günü. SQL saatleri iş yerel saatidir; taşıma UTC gösterimi ikinci kez zaman dilimi dönüşümü gerektirmez.' });
const minutes = Object.fromEntries(['Gun', 'Calisilan_Gun', 'Devamsiz_Gun', 'Izinli_Gun', 'Hafta_Tatili', 'Gec_Kalma_Sayisi', 'Gec_Kalma_Dk', 'Erken_Cikma_Dk', 'Calisma_Dk', 'Fazla_Mesai_Dk', 'Yemek_Dk', 'Mola_Dk', 'Mola_Asimi_Dk'].map(f => [f, integer(0)]));
add('get', '/reports/attendance', 'Raporlar', 'Dönemsel puantaj', { parameters: [parameter('donem', { type: 'string', enum: ['hafta', 'ay', 'ozel'] }, true, 'hafta = Pazartesi–Pazar, ay = takvim ayı; ikisi de baslangic gününü içeren dönemi verir.'), parameter('baslangic', date, true), parameter('bitis', date, false, 'Yalnız ozel dönemde, en fazla 92 gün.'), parameter('kapsam', { type: 'string', enum: ['kisi', 'departman', 'secili', 'tumu'] }, true), parameter('personel', { type: 'string', pattern: '^\\d+(,\\d+)*$', example: '1,2,3' }, false, 'kisi: tek ID; secili: en fazla 100 ID.'), parameter('departman', text(100), false, 'kapsam=departman için zorunlu.')], output: object({ baslangic: date, bitis: date, gunler: array(ref('AttendanceRow')), ozet: array(object({ User_ID: id, Ad_Soyad: text(100), Sicil_No: text(50), Departman: { type: 'string', nullable: true }, ...minutes })), toplam: object(minutes) }), description: 'Günlük puantajın aynı hesabı, dönemdeki her gün için; özet kişi başı toplamlar, toplam tüm satırlar. Çalışma süresi ilk giriş–son çıkış arasından yemek ve mola düşülerek bulunur; fazla mesai yalnız onaylı dakikalardır.' });
add('get', '/dashboard/summary', 'Dashboard', 'Özet ve geçiş trendi', { parameters: [parameter('filter', { type: 'string', enum: ['gunluk', 'haftalik', 'aylik'], default: 'gunluk' })], output: { type: 'object' }, description: 'Filtre geçiş trendini değiştirir; sayaçlar ve departman katılımı referans iş gününe aittir.' });
for (const [path, description] of [['/logs', 'Ad soyad veya kart'], ['/system-logs', 'Personel adı, sicil veya işlem tipi'], ['/door-logs', 'Kapı adı, işlem tipi veya detay']]) add('get', path, 'Dashboard', 'Sayfalı işlem kayıtları', { parameters: logParameters, output: ref('PagedList'), description: `${description} ile arama. İki tarih verilirse en fazla 366 takvim günü. Bitiş günü dahildir. Aynı zamanlı kayıtlar ID ile sıralanır.` });
add('post', '/seeder/run', 'Geliştirme', 'Local sentetik veri simülasyonu', { admin: true, body: object({ userAction: { type: 'string', enum: ['keep', 'append'] }, doorAction: { type: 'string', enum: ['keep', 'append'] }, logAction: { type: 'string', enum: ['append'] }, personelSayisi: integer(1, 100), kapiSayisi: integer(1, 50), vardiyaId: id, startDateStr: date, endDateStr: date, customIsimler: text(2000), customSoyisimler: text(2000), customDepartmanlar: text(2000), customKapilar: text(2000) }, ['userAction', 'doorAction', 'logAction', 'personelSayisi', 'kapiSayisi', 'vardiyaId', 'startDateStr', 'endDateStr']), description: 'ENABLE_SIMULATION=true, üretim dışı local ve ayrı GksReview_/GksTest_ DB gerektirir; ya da kişisel simülasyon alanı oturumu (en fazla 50 personel, 10 kapı, 14 gün; yalnız o kopyaya yazar). En fazla 31 gün, yalnız ekleme. Seçilen aktif vardiya bir saat şablonudur; mevcut personel atamalarını değiştirmez. Dakikalar ve gece vardiyası yemek/mola günleri korunur. Public demo seed CLI ile ayrıdır.', errors: { 403: 'Üretim veya izin verilmeyen veritabanı.', 404: 'Simülasyon route etkin değil veya seçilen aktif vardiya bulunamadı.' } });
const percent = { ...integer(0, 50), default: 0 };
const simEvent = object({ tur: { type: 'string', enum: ['giris', 'mola', 'moladan_don', 'yemek', 'yemekten_don', 'cikis'] }, zaman: { type: 'string', example: '2026-09-08T08:57:00', description: 'İş yerel saati, saat dilimi yok.' } });
const simDescription = 'Kişisel simülasyon alanı oturumu ya da üretim dışı local ENABLE_SIMULATION=true ve ayrı GksReview_/GksTest_ DB gerektirir.';
add('get', '/simulasyon/plan', 'Geliştirme', 'Kapı simülasyonu için günün hareket planı', { admin: true, parameters: [parameter('tarih', date, true), parameter('gec', percent, false, 'Geç kalma olasılığı (%).'), parameter('devamsiz', percent, false, 'Devamsızlık olasılığı (%).')], output: object({ tarih: date, kisiler: array(object({ id, ad_soyad: text(100), kart: text(50), vardiya: { type: 'string' }, durum: { type: 'string', enum: ['Planlı', 'İzinli', 'Hafta Tatili', 'Devamsız'] }, gec: { type: 'boolean' }, kapilar: array(id), olaylar: array(simEvent) })) }), description: `${simDescription} O gün vardiyası olan aktif personel için giriş, mola, yemek ve çıkış saatleri (gece vardiyası ertesi güne taşar). Saat tarayıcıda işler; veri yazılmaz. En fazla 300 kişi.`, errors: { 403: 'Simülasyon bu ortamda kapalı.' } });
add('post', '/simulasyon/okutma', 'Geliştirme', 'Simüle kart okutmalarını karara bağla ve kaydet', { admin: true, body: object({ tarih: date, okutmalar: { ...array(object({ kart: { ...text(50), minLength: 1 }, kapi_id: id, zaman: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$' }, yon: { type: 'string', enum: ['A→B', 'B→A'], description: 'Geçiş yönü; bölgeye bağlı kapıda zorunlu.' } }, ['kart', 'kapi_id', 'zaman'])), minItems: 1, maxItems: 50 } }, ['tarih', 'okutmalar']), output: object({ success: { type: 'boolean' }, sonuclar: array(object({ basarili: { type: 'boolean' }, neden: { type: 'string', enum: ['Geçiş onaylandı', 'Kapı pasif', 'Tanımsız kart', 'Personel pasif', 'Kapı yetkisi yok', 'Bu yönde geçiş kapalı'] }, user_id: { ...id, nullable: true }, ad_soyad: { type: 'string', nullable: true }, gecis_anlami: { type: 'string', nullable: true } })) }), description: `${simDescription} Kararı sunucu verir (kapı aktif mi, kart tanımlı mı, personel aktif mi, yetkisi var mı, kapı bu yöne açık mı) ve her okutma sonucuyla ve geçiş anlamıyla (geçilen bölgelerden: Ana Giriş, Yemekhane Giriş…) Logs tablosuna yazılır; puantaj bu kayıtlardan hesaplanır. Zaman simülasyon günü veya komşu günlerde olmalıdır. Tek transaction; dakikada 120 istek.`, errors: { 400: 'Bölgeye bağlı kapıda yön eksik.', 403: 'Simülasyon bu ortamda kapalı.', 404: 'Kapı bulunamadı.' } });

module.exports = {
  openapi: '3.0.3',
  info: { title: 'GKS API', version: '1.0.0', description: 'Kişisel personel/vardiya/puantaj projesi. Fiziksel cihaz bağlantısı simüledir. Demo salt okunur; admin tokenı bile iş verisi yazamaz. Swagger UI yalnız üretim dışı ortamda /api-docs altında açıktır.' },
  servers: [{ url: '/api' }],
  security: [{ bearerAuth: [] }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
  paths
};
