const { validateQuery, logsQuery, dashboardQuery: dashboardSchema } = require('../middlewares/query');
const { businessToday } = require('../utils/attendance');
const { monthlyTrendQuery } = require('../services/dashboardTrends');
const dashboardQuery = query => new sql.Request().input('today', sql.Date, businessToday()).query(query);
const express = require('express');
const router = express.Router();
const { sql } = require('../db');
const { verifyToken } = require('../middlewares/auth');

// 1. ÖZET VE GRAFİK VERİLERİ (Filtreli)
router.get('/dashboard/summary', verifyToken, validateQuery(dashboardSchema), async (req, res, next) => {
    try {
        const { filter } = req.validatedQuery;
        
        // 1. Genel İstatistikler
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Logs WHERE CAST(Zaman AS DATE) = @today AND Basarili_Mi=true) AS BugunGecis,
                (SELECT COUNT(*) FROM Users WHERE Durum = true) AS AktifPersonel,
                (SELECT COUNT(*) FROM Logs WHERE CAST(Zaman AS DATE) = @today AND Basarili_Mi = false) AS YetkisizGiris,
                (SELECT COUNT(*) FROM Doors WHERE Durum = true OR Durum IS NULL) AS AktifKapi
        `;
        
        // 2. Son 10 Geçiş (Canlı İzleme İçin)
        const recentLogsQuery = `
            SELECT
                L.ID, L.Zaman, L.Basarili_Mi, 
                U.Ad_Soyad, U.Departman, U.Sicil_No,
                D.Kapi_Adi, D.Kapi_Turu
            FROM Logs L
            LEFT JOIN Users U ON L.User_ID = U.ID
            LEFT JOIN Doors D ON L.Door_ID = D.ID
            ORDER BY L.Zaman DESC,L.ID DESC
            LIMIT 10
        `;

        // 3. Departman Bazlı Gelen/Gelmeyen Analizi (Bar Grafik İçin)
        const deptQuery = `
            SELECT 
                U.Departman as name,
                COUNT(DISTINCT U.ID) as ToplamPersonel,
                COUNT(DISTINCT CASE WHEN L.Basarili_Mi = true THEN L.User_ID END) as Gelen
            FROM Users U
            LEFT JOIN Logs L ON U.ID = L.User_ID
                AND CAST(L.Zaman AS DATE) = @today
            WHERE U.Durum = true AND U.Departman IS NOT NULL AND U.Departman != ''
            GROUP BY U.Departman
        `;

        // 4. Trend Analizi (Çizgi Grafik İçin)
        let trendQuery = '';
        if (filter === 'haftalik') {
            trendQuery = `
                SELECT 
                    CAST(Zaman AS DATE) as Tarih,
                    SUM(CAST(Basarili_Mi AS INT)) as Basarili,
                    SUM(CASE WHEN Basarili_Mi = false THEN 1 ELSE 0 END) as Yetkisiz
                FROM Logs
                WHERE Zaman >= @today - 6 AND Zaman < @today + 1
                GROUP BY CAST(Zaman AS DATE)
                ORDER BY Tarih ASC
            `;
        } else if (filter === 'aylik') {
            trendQuery = monthlyTrendQuery;
        } else { // gunluk
            trendQuery = `
                SELECT 
                    EXTRACT(HOUR FROM Zaman) as Saat,
                    SUM(CAST(Basarili_Mi AS INT)) as Basarili,
                    SUM(CASE WHEN Basarili_Mi = false THEN 1 ELSE 0 END) as Yetkisiz
                FROM Logs
                WHERE CAST(Zaman AS DATE) = @today
                GROUP BY EXTRACT(HOUR FROM Zaman)
                ORDER BY Saat ASC
            `;
        }

        // Tüm sorguları aynı anda paralel çalıştırarak performansı koruyoruz
        const [statsRes, recentLogsRes, deptRes, trendRes] = await Promise.all([
            dashboardQuery(statsQuery),
            dashboardQuery(recentLogsQuery),
            dashboardQuery(deptQuery),
            dashboardQuery(trendQuery)
        ]);

        // Verileri Frontend'in beklediği JSON yapısına (map) dönüştürme
        const deptData = deptRes.recordset.map(row => ({
            name: row.name,
            gelen: row.Gelen,
            gelmeyen: row.ToplamPersonel - row.Gelen
        }));

        let trendData = [];
        const trDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
        
        if (filter === 'haftalik') {
            trendData = trendRes.recordset.map(row => ({
                label: trDays[new Date(row.Tarih).getUTCDay()],
                basarili: row.Basarili,
                yetkisiz: row.Yetkisiz
            }));
        } else if (filter === 'aylik') {
            trendData = trendRes.recordset.map(row => ({
                label: `${row.Hafta + 1}. Hafta`,
                basarili: row.Basarili,
                yetkisiz: row.Yetkisiz
            }));
        } else {
            trendData = trendRes.recordset.map(row => ({
                label: `${String(row.Saat).padStart(2, '0')}:00`,
                basarili: row.Basarili,
                yetkisiz: row.Yetkisiz
            }));
        }

        res.json({
            success: true,
            stats: statsRes.recordset[0],
            recentLogs: recentLogsRes.recordset,
            deptData: deptData,
            trendData: trendData
        }); 
    } catch (err) {
        next(err); // Global errorHandler'a yönlendirildi
    }
});

// 2. TÜM GEÇİŞ LOGLARI (Sayfalama destekli)
router.get('/logs', verifyToken, validateQuery(logsQuery), async (req, res, next) => {
    try {
        const { baslangic, bitis, arama, page, limit } = req.validatedQuery;
        const offset = (page - 1) * limit;

        const request = new sql.Request();
        let where = `WHERE 1=1`;
        if (baslangic) { where += ` AND L.Zaman >= @baslangic`; request.input('baslangic', sql.DateTime, baslangic); }
        if (bitis)     { where += ` AND L.Zaman < @bitis + interval '1 day'`;     request.input('bitis', sql.DateTime, bitis); }
        if (arama)     { where += ` AND (gks_search(U.Ad_Soyad) LIKE gks_search(@arama) OR gks_search(L.RFID_Kart_No) LIKE gks_search(@arama))`; request.input('arama', sql.NVarChar, `%${arama}%`); }

        request.input('offset', sql.Int, offset);
        request.input('limit',  sql.Int, limit);

        const countReq = new sql.Request();
        if (baslangic) countReq.input('baslangic', sql.DateTime, baslangic);
        if (bitis)     countReq.input('bitis', sql.DateTime, bitis);
        if (arama)     countReq.input('arama', sql.NVarChar, `%${arama}%`);

        const [dataResult, countResult] = await Promise.all([
            request.query(`
                SELECT L.ID, U.Ad_Soyad, L.RFID_Kart_No, D.Kapi_Adi, L.Basarili_Mi, L.Zaman
                FROM Logs L
                LEFT JOIN Users U ON L.User_ID = U.ID
                LEFT JOIN Doors D ON L.Door_ID = D.ID
                ${where}
                ORDER BY L.Zaman DESC
                LIMIT @limit OFFSET @offset
            `),
            countReq.query(`
                SELECT COUNT(*) AS toplam
                FROM Logs L
                LEFT JOIN Users U ON L.User_ID = U.ID
                ${where}
            `)
        ]);

        res.json({
            data: dataResult.recordset,
            pagination: { page, limit, total: countResult.recordset[0].toplam, totalPages: Math.ceil(countResult.recordset[0].toplam / limit) }
        });
    } catch (err) {
        next(err);
    }
});

// 3. SİSTEM VE İK LOGLARI (Sayfalama destekli)
router.get('/system-logs', verifyToken, validateQuery(logsQuery), async (req, res, next) => {
    try {
        const { baslangic, bitis, arama, page, limit } = req.validatedQuery;
        const offset = (page - 1) * limit;

        const request  = new sql.Request();
        const countReq = new sql.Request();
        let where = `WHERE 1=1`;
        if (baslangic) { where += ` AND Tarih >= @baslangic`; request.input('baslangic', sql.DateTime, baslangic); countReq.input('baslangic', sql.DateTime, baslangic); }
        if (bitis)     { where += ` AND Tarih < @bitis + interval '1 day'`;     request.input('bitis', sql.DateTime, bitis); countReq.input('bitis', sql.DateTime, bitis); }
        if (arama)     { where += ` AND (gks_search(Personel_Ad) LIKE gks_search(@arama) OR gks_search(Sicil_No) LIKE gks_search(@arama) OR gks_search(Islem_Tipi) LIKE gks_search(@arama))`; request.input('arama', sql.NVarChar, `%${arama}%`); countReq.input('arama', sql.NVarChar, `%${arama}%`); }
        request.input('offset', sql.Int, offset);
        request.input('limit',  sql.Int, limit);

        const [dataResult, countResult] = await Promise.all([
            request.query(`SELECT * FROM SystemLogs ${where} ORDER BY Tarih DESC,ID DESC LIMIT @limit OFFSET @offset`),
            countReq.query(`SELECT COUNT(*) AS toplam FROM SystemLogs ${where}`)
        ]);

        res.json({
            data: dataResult.recordset,
            pagination: { page, limit, total: countResult.recordset[0].toplam, totalPages: Math.ceil(countResult.recordset[0].toplam / limit) }
        });
    } catch (err) {
        next(err);
    }
});

// 4. KAPI İŞLEM LOGLARI (Sayfalama destekli)
router.get('/door-logs', verifyToken, validateQuery(logsQuery), async (req, res, next) => {
    try {
        const { baslangic, bitis, arama, page, limit } = req.validatedQuery;
        const offset = (page - 1) * limit;

        const request  = new sql.Request();
        const countReq = new sql.Request();
        let where = `WHERE 1=1`;
        if (baslangic) { where += ` AND Tarih >= @baslangic`; request.input('baslangic', sql.DateTime, baslangic); countReq.input('baslangic', sql.DateTime, baslangic); }
        if (bitis)     { where += ` AND Tarih < @bitis + interval '1 day'`;     request.input('bitis', sql.DateTime, bitis); countReq.input('bitis', sql.DateTime, bitis); }
        if (arama)     { where += ` AND (gks_search(Kapi_Adi) LIKE gks_search(@arama) OR gks_search(Islem_Tipi) LIKE gks_search(@arama) OR gks_search(Detay) LIKE gks_search(@arama))`; request.input('arama', sql.NVarChar, `%${arama}%`); countReq.input('arama', sql.NVarChar, `%${arama}%`); }
        request.input('offset', sql.Int, offset);
        request.input('limit',  sql.Int, limit);

        const [dataResult, countResult] = await Promise.all([
            request.query(`SELECT * FROM DoorLogs ${where} ORDER BY Tarih DESC LIMIT @limit OFFSET @offset`),
            countReq.query(`SELECT COUNT(*) AS toplam FROM DoorLogs ${where}`)
        ]);

        res.json({
            data: dataResult.recordset,
            pagination: { page, limit, total: countResult.recordset[0].toplam, totalPages: Math.ceil(countResult.recordset[0].toplam / limit) }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
