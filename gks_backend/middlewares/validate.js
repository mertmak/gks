const { z } = require('zod');
const validate = schema => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ success: false, message: result.error.issues.map(e => e.message).join(' | ') });
    req.body = result.data;
    next();
};
// Only numeric form strings are coerced; null/booleans/empty strings are not zero.
const number = (min, max) => z.preprocess(v => typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v, z.number().int().min(min).max(max));
const id = number(1, 2147483647);
const minutes = number(0, 2880);
const bit = z.union([z.literal(0), z.literal(1), z.boolean()]).transform(Number);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalıdır.').refine(v => {
    const parsed = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, 'Geçersiz takvim tarihi.').refine(v => v >= '1753-01-02' && v <= '9999-12-29', 'Tarih 1753-01-02 ile 9999-12-29 arasında olmalıdır.');
// Reserve adjacent days for overnight event windows inside SQL DATETIME's range.
const validDateRange = (start, end, maximumDays = 366) => date.safeParse(start).success && date.safeParse(end).success && start <= end && (new Date(end) - new Date(start)) / 86400000 < maximumDays;
const optionalDate = z.preprocess(v => v === '' ? null : v, date.nullish());
const text = max => z.string().trim().max(max, `En fazla ${max} karakter girilebilir.`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat HH:MM olmalıdır.');
const optionalTime = z.preprocess(v => v === '' ? null : v, time.nullish());
const optionalId = z.preprocess(v => v === '' ? null : v, id.nullish());
const password = z.string().min(10, 'Yeni şifre en az 10 karakter olmalıdır.').max(72)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Yeni şifre UTF-8 kodlamasında en fazla 72 bayt olabilir.');
const username = text(50).min(1, 'Kullanıcı adı zorunludur.');
const status = z.enum(['Onaylandı', 'Reddedildi', 'Bekliyor']);
const baseTarget = { hedef_turu: z.enum(['Tumu', 'Sirket', 'Departman']), hedef_deger: text(100).optional() };
const targetRequired = value => value.hedef_turu === 'Tumu' || !!value.hedef_deger;
const targetMessage = { message: 'Şirket veya departman seçiniz.', path: ['hedef_deger'] };
const doorIds = z.array(id).max(1000).refine(a => new Set(a).size === a.length, 'Aynı kapı birden fazla seçilemez.');
const schemas = {
    loginSchema: z.object({ username, password: z.string().min(1, 'Şifre zorunludur.').max(200) }),
    ilkKurulumSchema: z.object({ username, password }),
    hesapEkleSchema: z.object({ username, password, rol: z.enum(['admin', 'user']).default('user') }),
    sifreDegistirSchema: z.object({ username: username.optional(), eskiSifre: z.string().min(1), yeniSifre: password }),
    kapiEkleSchema: z.object({ kapi_adi: text(100).min(1), departman: text(100).default(''), konum: text(100).default(''), kapi_turu: z.enum(['Ana Giriş','Ana Çıkış','İç Geçiş','Yemekhane Giriş','Yemekhane Çıkış','Mola / Sigara Alanı']).default('İç Geçiş') }),
    kapiDurumSchema: z.object({ durum: bit, kapi_adi: text(100).optional() }),
    vardiyaSchema: z.object({ vardiya_adi: text(100).min(1), mesai_baslangic: time, mesai_bitis: time, yemek_baslangic: optionalTime, yemek_bitis: optionalTime, tolerans_dk: number(0,120).default(0), mola_hakki_dk: number(0,480).default(0), calisma_gunleri: z.string().regex(/^[0-6](,[0-6])*$/).default('1,2,3,4,5') }).refine(v => v.mesai_baslangic !== v.mesai_bitis, 'Vardiya başlangıç ve bitişi aynı olamaz.').refine(v => !!v.yemek_baslangic === !!v.yemek_bitis, 'Yemek başlangıç ve bitişi birlikte girilmelidir.'),
    vardiyaDurumSchema: z.object({ durum: bit }),
    izinEkleSchema: z.object({ user_id: id, izin_turu: text(50).min(1), baslangic: date, bitis: date, aciklama: text(255).default(''), durum: status.default('Onaylandı') }).refine(v => v.bitis >= v.baslangic, 'Bitiş başlangıçtan önce olamaz.'),
    mesaiOnaySchema: z.object({ user_id: id, tarih: date, hesaplanan_dk: minutes.optional(), onaylanan_dk: minutes, durum: status, aciklama: text(255).default('') }),
    mesaiBulkOnaySchema: z.object({ mesailer: z.array(z.object({ user_id: id, tarih: date, hesaplanan_dk: minutes.optional(), onaylanan_dk: minutes })).min(1).max(2000), durum: status, aciklama: text(255).default('') }),
    bulkShiftSchema: z.object({ ...baseTarget, vardiya_id: optionalId }).refine(targetRequired, targetMessage),
    bulkDoorsSchema: z.object({ ...baseTarget, doorIds }).refine(targetRequired, targetMessage),
    bulkStatusSchema: z.object({ ...baseTarget, durum: bit, cikis_tarihi: optionalDate, cikis_nedeni: text(255).default('') }).refine(targetRequired, targetMessage).refine(v => v.durum !== 0 || !!v.cikis_tarihi, 'İşten çıkış tarihi zorunludur.'),
    personelSchema: z.object({ ad_soyad: text(100).min(1), rfid: z.union([z.string().regex(/^\d{11}$/),z.literal('')]).optional(), tc: z.string().regex(/^\d{11}$/), sicil: z.string().regex(/^\d{5}$/), sirket: text(100).default(''), departman: text(100).default(''), gorev: text(100).default(''), ise_giris: optionalDate }),
    personelStatusSchema: z.object({ durum: bit, cikis_tarihi: optionalDate, cikis_nedeni: text(255).default(''), ad_soyad: text(100).optional(), sicil: text(50).optional() }).refine(v => v.durum !== 0 || !!v.cikis_tarihi, 'İşten çıkış tarihi zorunludur.'),
    personelDoorsSchema: z.object({ doorIds }),
    personelShiftSchema: z.object({ vardiya_id: optionalId }),
};
module.exports = { validate, schemas, date, validDateRange, id, number };
