const { sql } = require('../db');
const { calculateAttendance } = require('../utils/attendance');
const { validDateRange } = require('../middlewares/validate');
function validateRange(start,end) {
    if(!validDateRange(start,end)) {
        const e=new Error('Geçerli, en fazla 366 günlük bir tarih aralığı seçiniz.'); e.statusCode=400;throw e;
    }
}
async function attendance(start,end,{transaction,userId}={}) {
    validateRange(start,end);
    const req=new sql.Request(transaction);req.input('userId',sql.Int,userId??null);req.input('start',sql.Date,start);req.input('end',sql.Date,end);
    const users=await req.query(`
      WITH Days AS (SELECT @start AS Tarih UNION ALL SELECT DATEADD(day,1,Tarih) FROM Days WHERE Tarih<@end)
      SELECT U.ID AS User_ID,U.Ad_Soyad,U.Sicil_No,U.Departman,U.Sirket,U.RFID_Kart_No,D.Tarih,
        P.Snapshot_Vardiya_Adi AS Vardiya_Adi,P.Snapshot_Mesai_Baslangic AS Mesai_Baslangic,P.Snapshot_Mesai_Bitis AS Mesai_Bitis,P.Snapshot_Calisma_Gunleri AS Calisma_Gunleri,P.Snapshot_Tolerans_Dk AS Tolerans_Dk,P.Snapshot_Mola_Hakki_Dk AS Mola_Hakki_Dk,
        M.Durum AS Mesai_Durumu,M.Onaylanan_Dk,M.Aciklama AS Mesai_Aciklama,M.Islemi_Yapan AS Mesai_Islemi_Yapan,M.Islem_Zamani AS Mesai_Islem_Zamani,I.Izin_Turu AS Izin_Durumu,I.Kayit_Sayisi AS Onayli_Izin_Sayisi
      FROM Users U CROSS JOIN Days D
      OUTER APPLY (SELECT TOP 1 P.* FROM Personel_Vardiya P WHERE P.User_ID=U.ID AND P.Baslangic_Tarihi<=D.Tarih AND (P.Bitis_Tarihi IS NULL OR P.Bitis_Tarihi>=D.Tarih) ORDER BY P.Baslangic_Tarihi DESC,P.ID DESC) P
      LEFT JOIN Mesai_Onaylari M ON M.User_ID=U.ID AND M.Tarih=D.Tarih
      OUTER APPLY (SELECT COUNT(*) AS Kayit_Sayisi,CASE WHEN COUNT(*)=1 THEN MAX(Izin_Turu) END AS Izin_Turu FROM Izinler WHERE User_ID=U.ID AND D.Tarih BETWEEN Baslangic_Tarihi AND Bitis_Tarihi AND Durum=N'Onaylandı') I
      WHERE (@userId IS NULL OR U.ID=@userId) AND (
        ((U.Ise_Giris_Tarihi IS NULL OR U.Ise_Giris_Tarihi<=D.Tarih)
          AND (U.Isten_Cikis_Tarihi IS NULL OR U.Isten_Cikis_Tarihi>=D.Tarih)
          AND (U.Durum=1 OR U.Isten_Cikis_Tarihi IS NOT NULL))
        OR EXISTS(SELECT 1 FROM Personel_Calisma_Gecmisi H WHERE H.User_ID=U.ID
          AND (H.Baslangic_Tarihi IS NULL OR H.Baslangic_Tarihi<=D.Tarih) AND H.Bitis_Tarihi>=D.Tarih))
      ORDER BY D.Tarih,U.ID OPTION(MAXRECURSION 366)`);
    const logReq=new sql.Request(transaction);logReq.input('userId',sql.Int,userId??null);logReq.input('start',sql.Date,start);logReq.input('end',sql.Date,end);
    const logs=await logReq.query(`SELECT L.User_ID,L.RFID_Kart_No,L.Zaman,D.Kapi_Turu FROM Logs L JOIN Doors D ON D.ID=L.Door_ID WHERE L.Zaman>=DATEADD(day,-1,@start) AND L.Zaman<DATEADD(day,2,@end) AND L.Basarili_Mi=1 AND (@userId IS NULL OR L.User_ID=@userId) ORDER BY L.Zaman,L.ID`);
    const byUser=new Map();
    for(const l of logs.recordset) {if(!byUser.has(l.User_ID)) byUser.set(l.User_ID,[]);byUser.get(l.User_ID).push(l);}
    return users.recordset.map(row=>calculateAttendance(row,byUser.get(row.User_ID)||[]));
}
module.exports={attendance,validateRange};
