const express = require('express');
const router = express.Router();
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { simulationTimes } = require('../utils/simulationTimes');
const { httpError } = require('../utils/transaction');
const socket = require('../utils/socket');

// Genişletilmiş Varsayılan Veri Havuzu
const defaultIsimler = ['Ali', 'Ayşe', 'Fatma', 'Ahmet', 'Mehmet', 'Can', 'Elif', 'Burak', 'Zeynep', 'Emre', 'Cem', 'Deniz', 'Eda', 'Ozan', 'Gökhan', 'Ceren', 'Tolga', 'Büşra', 'Sinan', 'Selin', 'Kaan'];
const defaultSoyisimler = ['Yılmaz', 'Demir', 'Kaya', 'Çelik', 'Şahin', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Yıldız', 'Özdemir', 'Çetin', 'Koç', 'Güneş', 'Bulut', 'Yavuz', 'Tekin'];
const defaultDepartmanlar = ['İşletme', 'Bilgi İşlem', 'İnsan Kaynakları', 'Muhasebe', 'Pazarlama', 'Üretim', 'Lojistik', 'Güvenlik', 'Ar-Ge', 'Satın Alma'];
const defaultKapilar = ['Ana Giriş', 'Ana Çıkış', 'Yemekhane Giriş', 'Yemekhane Çıkış', 'Mola / Sigara Alanı', 'İç Geçiş', 'İç Geçiş', 'İç Geçiş'];

// Yardımcı Fonksiyonlar
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const parseCustomList = (str, defaultList) => {
    const items = str?.split(',').map(s => s.trim()).filter(Boolean);
    return items?.length ? items : defaultList;
};

router.post('/seeder/run', verifyToken, verifyAdmin, async (req, res) => {
    const sandbox = !!req.user.sandbox; // writes only to the visitor's own copy
    if (!sandbox && (require('../config/demo').enabled || process.env.NODE_ENV === 'production' || !/^(GksReview_|GksTest_)/i.test(process.env.DB_NAME || ''))) return res.status(403).json({success:false,message:'Simülasyon yalnızca ayrı test veritabanında çalışır.'});
    const { z } = require('zod');
    const { date, id, number, validDateRange } = require('../middlewares/validate');
    const parsed = z.object({
      userAction:z.enum(['keep','append']),doorAction:z.enum(['keep','append']),logAction:z.literal('append'),
      personelSayisi:number(1,100),kapiSayisi:number(1,50),vardiyaId:id,
      startDateStr:date,endDateStr:date,
      customIsimler:z.string().max(2000).default(''),customSoyisimler:z.string().max(2000).default(''),customDepartmanlar:z.string().max(2000).default(''),customKapilar:z.string().max(2000).default('')
    }).refine(v=>validDateRange(v.startDateStr,v.endDateStr,31)).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({success:false,message:'En fazla 31 günlük, yalnızca ekleme yapan bir simülasyon seçiniz.'});
    if (sandbox && (parsed.data.personelSayisi > 50 || parsed.data.kapiSayisi > 10 || !validDateRange(parsed.data.startDateStr, parsed.data.endDateStr, 14))) {
        return res.status(400).json({success:false,message:'Simülasyon alanında en fazla 50 personel, 10 kapı ve 14 gün üretilebilir.'});
    }
    req.body=parsed.data;
    const transaction = new sql.Transaction();
    const query = (strings, ...values) => new sql.Request(transaction).query(strings, ...values);

    const { 
        userAction, doorAction, kapiSayisi, personelSayisi,
        vardiyaId, startDateStr, endDateStr,
        customIsimler, customSoyisimler, customDepartmanlar, customKapilar
    } = req.body;

    // Arayüzden gelen özel listeleri ayrıştır, boşsa varsayılanları kullan
    const seciliIsimler = parseCustomList(customIsimler, defaultIsimler);
    const seciliSoyisimler = parseCustomList(customSoyisimler, defaultSoyisimler);
    const seciliDepartmanlar = parseCustomList(customDepartmanlar, defaultDepartmanlar);
    const seciliKapilar = parseCustomList(customKapilar, defaultKapilar);

    const generateRandomUser = () => {
        const adSoyad = `${getRandomItem(seciliIsimler)} ${getRandomItem(seciliSoyisimler)}`;
        const rfid = `${10000000000 + Math.floor(Math.random() * 89999999999)}`; 
        const tc = `${10000000000 + Math.floor(Math.random() * 89999999999)}`;   
        const sicil = `${10000 + Math.floor(Math.random() * 89999)}`;            
        const departman = getRandomItem(seciliDepartmanlar);
        return { adSoyad, rfid, tc, sicil, departman };
    };

    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const vardiyalarRes = await query`SELECT ID, Vardiya_Adi, Mesai_Baslangic, Mesai_Bitis, Yemek_Baslangic, Calisma_Gunleri FROM Vardiyalar WHERE ID = ${vardiyaId} AND Durum=true`;
        if (!vardiyalarRes.recordset.length) throw httpError(404, 'Seçilen aktif vardiya bulunamadı.');

        const hedefVardiya = vardiyalarRes.recordset[0];
        const startDate = new Date(startDateStr + 'T00:00:00Z');
        const endDate = new Date(endDateStr + 'T00:00:00Z');

        const calismaGunleri = hedefVardiya.Calisma_Gunleri ? hedefVardiya.Calisma_Gunleri.split(',').map(Number) : [1, 2, 3, 4, 5];

        let doors = [];
        if (doorAction === 'append') {
            for (let i = 1; i <= Number(kapiSayisi); i++) {
                const tur = seciliKapilar[i % seciliKapilar.length];
                const kapiAd = customKapilar ? `${tur}` : `${100 + i} - ${tur}`; // Özelse direkt ismi al, değilse numara ver
                const temizTur = tur.includes('-') ? tur.split('-')[1].trim() : tur; // Örn: "Arge-İç Geçiş" için türü ayrıştır
                const finalTur = ['Ana Giriş', 'Ana Çıkış', 'Yemekhane Giriş', 'Yemekhane Çıkış', 'Mola / Sigara Alanı'].includes(temizTur) ? temizTur : 'İç Geçiş';
                
                await query`INSERT INTO Doors (Kapi_Adi, Departman, Konum, Kapi_Turu, Durum) VALUES (${kapiAd}, 'Genel', 'Belirtilmedi', ${finalTur}, true)`;
            }
        }
        
        const dbDoors = await query`SELECT ID, Kapi_Turu as tur FROM Doors WHERE Durum = true`;
        doors = dbDoors.recordset.map(d => ({ id: d.ID, tur: d.tur }));
        if (doors.length === 0) throw new Error('Aktif personel ve kapı gereklidir.');

        if (userAction === 'append') {
            for (let i = 0; i < Number(personelSayisi); i++) {
                const u = generateRandomUser();
                await query`INSERT INTO Users (Ad_Soyad, RFID_Kart_No, TC_Kimlik, Sicil_No, Departman, Durum, Ise_Giris_Tarihi, Sistem_ID) VALUES (${u.adSoyad}, ${u.rfid}, ${u.tc}, ${u.sicil}, ${u.departman}, true, CAST(${startDateStr} AS DATE), ${u.rfid})`;
            }
        }
        
        const dbUsers = await query`SELECT ID, RFID_Kart_No as rfid, Ad_Soyad as adSoyad FROM Users WHERE Durum = true`;
        const users = dbUsers.recordset.map(u => ({ id: u.ID, rfid: u.rfid, adSoyad: u.adSoyad }));
        if (users.length === 0) throw new Error('Aktif personel ve kapı gereklidir.');

        // Only fill missing assignments and permissions; preserve existing history.
        await query`INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi)
          SELECT U.ID, CAST(${hedefVardiya.ID} AS INT), CAST(${startDateStr} AS DATE) FROM Users U WHERE U.Durum=true
          AND NOT EXISTS(SELECT 1 FROM Personel_Vardiya P WHERE P.User_ID=U.ID)`;
        await query`INSERT INTO Permissions(User_ID,Door_ID) SELECT U.ID,D.ID FROM Users U CROSS JOIN Doors D
          WHERE U.Durum=true AND D.Durum=true AND D.Kapi_Turu IN('Ana Giriş','Ana Çıkış')
          AND NOT EXISTS(SELECT 1 FROM Permissions P WHERE P.User_ID=U.ID AND P.Door_ID=D.ID)`;
        let logValues = [];
        for (let dt = new Date(startDate); dt <= endDate; dt.setUTCDate(dt.getUTCDate() + 1)) {
            const islemTarihi = new Date(dt);
            if (!calismaGunleri.includes(islemTarihi.getUTCDay())) continue;
            
            for (const [userIndex, u] of users.entries()) {
                if (Math.random() < 0.05 && userIndex !== 0) continue; // First fixture always has events; others may be absent.

                const times = simulationTimes(islemTarihi.toISOString().slice(0,10), hedefVardiya);
                const anaGirisler = doors.filter(d => d.tur === 'Ana Giriş');
                const anaCikislar = doors.filter(d => d.tur === 'Ana Çıkış');
                
                // YENİ: Ana Giriş (Gerçekçi Sapma: -30 ile +45 dakika arası)
                if (anaGirisler.length > 0) {
                    const girisDate = times.entry;
                    
                    // %5 ihtimalle kartı yanlış okuttu (Başarısız log), 1 dk sonra tekrar bastı
                    if (Math.random() < 0.05) {
                        let failDate = new Date(girisDate); failDate.setUTCMinutes(failDate.getUTCMinutes() - 1);
                        logValues.push([u.rfid, anaGirisler[0].id, 0, failDate]);
                    }
                    logValues.push([u.rfid, anaGirisler[0].id, 1, girisDate]);
                }

                // İç Geçiş ve Mola
                if (Math.random() > 0.3) { // %70 ihtimalle molaya çıktı
                    const molaAlanlari = doors.filter(d => d.tur === 'Mola / Sigara Alanı');
                    const icGecisler = doors.filter(d => d.tur === 'İç Geçiş');
                    if (times.rest && molaAlanlari.length > 0 && icGecisler.length > 0) {
                        const molaGiris = times.rest.start;
                        const molaCikis = times.rest.end;
                        logValues.push([u.rfid, getRandomItem(molaAlanlari).id, 1, molaGiris]);
                        
                        // %5 İç Kapı Yetkisiz Erişim Denemesi
                        if (Math.random() < 0.05) {
                            logValues.push([u.rfid, getRandomItem(icGecisler).id, 0, molaGiris]);
                        }
                        logValues.push([u.rfid, getRandomItem(icGecisler).id, 1, molaCikis]);
                    }
                }

                // Yemek
                const yemekGirisler = doors.filter(d => d.tur === 'Yemekhane Giriş');
                const yemekCikislar = doors.filter(d => d.tur === 'Yemekhane Çıkış');
                if (times.meal && yemekGirisler.length > 0 && yemekCikislar.length > 0) {
                    const yGiris = times.meal.start;
                    const yCikis = times.meal.end;
                    logValues.push([u.rfid, yemekGirisler[0].id, 1, yGiris]);
                    logValues.push([u.rfid, yemekCikislar[0].id, 1, yCikis]);
                }

                // YENİ: Ana Çıkış (Gerçekçi Sapma: -15 ile +90 dakika arası)
                if (anaCikislar.length > 0) {
                    const cikisDate = times.exit;
                    logValues.push([u.rfid, anaCikislar[0].id, 1, cikisDate]);
                }
            }
        }
        
        // One set-based insert; the row trigger still captures each card owner.
        const column = i => logValues.map(row => row[i]);
        if(logValues.length) await new sql.Request(transaction).input('cards',column(0)).input('doors',column(1))
            .input('ok',column(2).map(Boolean)).input('times',column(3))
            .query('INSERT INTO Logs(RFID_Kart_No,Door_ID,Basarili_Mi,Zaman) SELECT * FROM unnest(@cards::varchar[],@doors::int[],@ok::boolean[],@times::timestamp[])');
        const basariliKayit=logValues.length;
        await transaction.commit();
        socket.getIO().emit('users_updated'); socket.getIO().emit('doors_updated'); socket.getIO().emit('system_updated'); socket.getIO().emit('new_rfid_log'); 
        res.json({ success: true, message: `Simülasyon tamamlandı! ${basariliKayit} adet sentetik geçiş kaydı eklendi.` });
    } catch (err) {
        require('../utils/appLogger').error('Simülasyon başarısız: ' + err.message);
        try { await transaction.rollback(); } catch { /* Already rolled back by SQL. */ }
        if (err.code === require('../services/sandbox').QUOTA_ERROR) return res.status(409).json({ success: false, code: 'SANDBOX_QUOTA', message: err.message });
        res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Veri üretimi sırasında bir hata oluştu.' });
    }
});

module.exports = router;
