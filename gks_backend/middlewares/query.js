const { z } = require('zod');
const { date, validDateRange } = require('./validate');
const int = (max, fallback) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).optional().transform(v => v ?? fallback);
const paging = { page: int(100000, 1), limit: int(500, 100), arama: z.string().trim().max(100).optional() };
const usersQuery = z.object({ ...paging, departman: z.string().trim().max(100).optional(), durum: z.enum(['', '0', '1', 'tumu']).optional() });
const logsQuery = z.object({ ...paging, baslangic: date.optional(), bitis: date.optional() }).refine(v => !v.baslangic || !v.bitis || validDateRange(v.baslangic, v.bitis), 'En fazla 366 günlük geçerli bir aralık seçiniz.');
const dashboardQuery = z.object({ filter: z.enum(['gunluk', 'haftalik', 'aylik']).default('gunluk') });
const reportQuery = z.object({ tarih: date.optional() });
const overtimeQuery = z.object({ baslangic: date, bitis: date }).refine(v => validDateRange(v.baslangic, v.bitis), 'En fazla 366 günlük geçerli bir aralık seçiniz.');
const validateQuery = schema => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ success: false, message: 'Geçersiz arama, tarih veya sayfalama parametresi.' });
    req.validatedQuery = result.data;
    next();
};
module.exports = { validateQuery, usersQuery, logsQuery, dashboardQuery, reportQuery, overtimeQuery };
