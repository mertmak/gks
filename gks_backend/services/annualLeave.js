const { sql } = require('../db');
const { annualLeaveEntitlement } = require('../utils/annualLeave');
const { businessToday, dateKey } = require('../utils/attendance');

// Annual leave days are the person's shift working days (Mon–Fri without a shift), minus official holidays.
// With a carry-over (Izin_Devir_*), Kalan = carry-over + later entitlement − annual leave from that date on.
// Without `userId` all active personnel are listed; a `baslangic`–`bitis` request range needs `userId`.
async function leaveBalances({ userId = null, baslangic = null, bitis = null } = {}) {
    const request = () => new sql.Request().input('uid', sql.Int, userId).input('tur', sql.NVarChar, 'Yıllık İzin')
        .input('bas', sql.Date, baslangic).input('bit', sql.Date, bitis);
    const users = (await request().query(`SELECT ID AS User_ID,Ad_Soyad,Sicil_No,Departman,Ise_Giris_Tarihi,Isten_Cikis_Tarihi,Izin_Devir_Gun,Izin_Devir_Tarihi FROM Users
        WHERE (CAST(@uid AS integer) IS NULL AND Durum=true) OR ID=@uid ORDER BY Ad_Soyad,ID`)).recordset;
    if (!users.length) return [];
    const history = (await request().query(`SELECT User_ID,Baslangic_Tarihi,Bitis_Tarihi FROM Personel_Calisma_Gecmisi
        WHERE Baslangic_Tarihi IS NOT NULL AND (CAST(@uid AS integer) IS NULL OR User_ID=@uid)`)).recordset;
    const counts = (await request().query(`
        WITH R AS (
          SELECT I.User_ID,I.Durum,GREATEST(I.Baslangic_Tarihi,U.Izin_Devir_Tarihi) AS Bas,I.Bitis_Tarihi AS Bit FROM Izinler I JOIN Users U ON U.ID=I.User_ID
          WHERE Izin_Turu=@tur AND I.Durum IN ('Onaylandı','Bekliyor') AND (CAST(@uid AS integer) IS NULL OR I.User_ID=@uid)
          UNION ALL SELECT CAST(@uid AS integer),'Talep',CAST(@bas AS date),CAST(@bit AS date) WHERE CAST(@bas AS date) IS NOT NULL)
        SELECT R.User_ID,R.Durum,COUNT(*)::int AS Izin_Gunu
        FROM R CROSS JOIN LATERAL generate_series(CAST(R.Bas AS timestamp),CAST(R.Bit AS timestamp),interval '1 day') G
        LEFT JOIN LATERAL (SELECT P.Snapshot_Calisma_Gunleri FROM Personel_Vardiya P WHERE P.User_ID=R.User_ID AND P.Baslangic_Tarihi<=G::date
          AND (P.Bitis_Tarihi IS NULL OR P.Bitis_Tarihi>=G::date) ORDER BY P.Baslangic_Tarihi DESC,P.ID DESC LIMIT 1) P ON true
        WHERE NOT EXISTS (SELECT 1 FROM Resmi_Tatiller T WHERE T.Tarih=G::date)
          AND EXTRACT(DOW FROM G)::int=ANY(string_to_array(COALESCE(P.Snapshot_Calisma_Gunleri,'1,2,3,4,5'),',')::int[])
        GROUP BY R.User_ID,R.Durum`)).recordset;
    const days = new Map(counts.map(c => [`${c.User_ID}|${c.Durum}`, c.Izin_Gunu]));
    const today = dateKey(businessToday());
    return users.map(u => {
        const periods = history.filter(h => h.User_ID === u.User_ID).map(h => ({ start: dateKey(h.Baslangic_Tarihi), end: dateKey(h.Bitis_Tarihi) }));
        if (u.Ise_Giris_Tarihi) periods.push({ start: dateKey(u.Ise_Giris_Tarihi), end: u.Isten_Cikis_Tarihi ? dateKey(u.Isten_Cikis_Tarihi) : null });
        const since = u.Izin_Devir_Tarihi ? dateKey(u.Izin_Devir_Tarihi) : null;
        const entitlement = annualLeaveEntitlement(periods, today, since);
        const used = days.get(`${u.User_ID}|Onaylandı`) ?? 0;
        return { User_ID: u.User_ID, Ad_Soyad: u.Ad_Soyad, Sicil_No: u.Sicil_No, Departman: u.Departman, Giris_Tarihi_Yok: !periods.length, Devir_Gun: u.Izin_Devir_Gun, Devir_Tarihi: since, ...entitlement,
            Kullanilan: used, Bekleyen: days.get(`${u.User_ID}|Bekliyor`) ?? 0, Kalan: (u.Izin_Devir_Gun ?? 0) + entitlement.Hak_Edilen - used,
            ...(baslangic ? { Talep_Gun: days.get(`${u.User_ID}|Talep`) ?? 0 } : {}) };
    });
}
module.exports = { leaveBalances };
