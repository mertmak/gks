const { z } = require('zod');
const { date, validDateRange } = require('./validate');
const int = (max, fallback) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).optional().transform(v => v ?? fallback);
const paging = { page: int(100000, 1), limit: int(500, 100), arama: z.string().trim().max(100).optional() };
const usersQuery = z.object({ ...paging, departman: z.string().trim().max(100).optional(), durum: z.enum(['', '0', '1', 'tumu']).optional() });
const logsQuery = z.object({ ...paging, baslangic: date.optional(), bitis: date.optional() }).refine(v => !v.baslangic || !v.bitis || validDateRange(v.baslangic, v.bitis), 'En fazla 366 günlük geçerli bir aralık seçiniz.');
const dashboardQuery = z.object({ filter: z.enum(['gunluk', 'haftalik', 'aylik']).default('gunluk') });
const reportQuery = z.object({ tarih: date.optional() });
const percent = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().max(50)).optional().transform(v => (v ?? 0) / 100);
const simPlanQuery = z.object({ tarih: date, gec: percent, devamsiz: percent });
const overtimeQuery = z.object({ baslangic: date, bitis: date }).refine(v => validDateRange(v.baslangic, v.bitis), 'En fazla 366 günlük geçerli bir aralık seçiniz.');
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000 + 1;
const personIds = z.string().regex(/^\d{1,10}(,\d{1,10}){0,99}$/).transform(v => [...new Set(v.split(',').map(Number))]).refine(ids => ids.every(id => id >= 1 && id <= 2147483647));
// ozel: at most 92 days (≤300 people × 92 days per response). kisi needs one id, secili 1–100.
const periodReportQuery = z.object({ donem: z.enum(['hafta', 'ay', 'ozel']), baslangic: date, bitis: date.optional(), kapsam: z.enum(['kisi', 'departman', 'secili', 'tumu']), personel: personIds.optional(), departman: z.string().trim().min(1).max(100).optional() })
    .refine(v => v.donem !== 'ozel' || (v.bitis && validDateRange(v.baslangic, v.bitis) && days(v.baslangic, v.bitis) <= 92))
    .refine(v => v.kapsam === 'kisi' ? v.personel?.length === 1 : v.kapsam === 'secili' ? !!v.personel : true)
    .refine(v => v.kapsam !== 'departman' || !!v.departman);
const validateQuery = schema => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ success: false, message: 'Geçersiz arama, tarih veya sayfalama parametresi.' });
    req.validatedQuery = result.data;
    next();
};
module.exports = { validateQuery, usersQuery, logsQuery, dashboardQuery, reportQuery, overtimeQuery, simPlanQuery, periodReportQuery };
