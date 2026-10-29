const { sql } = require('../db');
const { simulationTimes } = require('../utils/simulationTimes');
const { shiftWindow } = require('../utils/attendance');

const minute = 60000;
const MAX_PEOPLE = 300;
const wallClock = value => new Date(value).toISOString().slice(0, 19);

// A day's movements for every active person with a shift on that day. The
// browser runs the clock and walks people through the floor plan; card reads
// come back through recordReads, which decides them on the server.
async function dayPlan(day, { late = 0, absent = 0 } = {}, random = Math.random) {
    const people = (await new sql.Request().input('day', sql.Date, day).input('max', sql.Int, MAX_PEOPLE).query(`
        SELECT U.ID, U.Ad_Soyad, U.RFID_Kart_No, P.Snapshot_Vardiya_Adi AS Vardiya_Adi,
               P.Snapshot_Mesai_Baslangic AS Mesai_Baslangic, P.Snapshot_Mesai_Bitis AS Mesai_Bitis,
               P.Snapshot_Yemek_Baslangic AS Yemek_Baslangic, P.Snapshot_Calisma_Gunleri AS Calisma_Gunleri,
               P.Snapshot_Tolerans_Dk AS Tolerans_Dk,
               (SELECT MAX(I.Izin_Turu) FROM Izinler I WHERE I.User_ID=U.ID AND I.Durum='Onaylandı'
                  AND I.Baslangic_Tarihi<=@day AND I.Bitis_Tarihi>=@day) AS Izin_Durumu
        FROM Users U
        JOIN LATERAL (SELECT P.* FROM Personel_Vardiya P WHERE P.User_ID=U.ID AND P.Baslangic_Tarihi<=@day
              AND (P.Bitis_Tarihi IS NULL OR P.Bitis_Tarihi>=@day) ORDER BY P.Baslangic_Tarihi DESC, P.ID DESC LIMIT 1) P ON true
        WHERE U.Durum=true AND U.RFID_Kart_No<>''
          AND (U.Ise_Giris_Tarihi IS NULL OR U.Ise_Giris_Tarihi<=@day)
          AND (U.Isten_Cikis_Tarihi IS NULL OR U.Isten_Cikis_Tarihi>=@day)
        ORDER BY U.ID LIMIT @max`)).recordset;
    const permissions = new Map();
    for (const row of (await sql.query('SELECT User_ID, Door_ID FROM Permissions ORDER BY Door_ID')).recordset) {
        if (!permissions.has(row.User_ID)) permissions.set(row.User_ID, []);
        permissions.get(row.User_ID).push(row.Door_ID);
    }
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
    const kisiler = people.map(person => {
        const base = { id: person.ID, ad_soyad: person.Ad_Soyad, kart: person.RFID_Kart_No, vardiya: person.Vardiya_Adi,
            kapilar: permissions.get(person.ID) || [], gec: false, olaylar: [] };
        if (person.Izin_Durumu) return { ...base, durum: 'İzinli' };
        if (!(person.Calisma_Gunleri || '1,2,3,4,5').split(',').map(Number).includes(weekday)) return { ...base, durum: 'Hafta Tatili' };
        if (random() < absent) return { ...base, durum: 'Devamsız' };
        const times = simulationTimes(day, person, random);
        let entry = +times.entry;
        const lateArrival = random() < late;
        if (lateArrival) {
            const start = +shiftWindow({ ...person, Tarih: day }).start;
            entry = Math.min(start + ((person.Tolerans_Dk || 0) + 5 + Math.floor(random() * 40)) * minute, +times.exit - 60 * minute);
        }
        const olaylar = [{ tur: 'giris', zaman: entry }];
        // As in the bulk generator, most people take a break.
        if (times.rest && random() < 0.7 && +times.rest.start > entry) {
            olaylar.push({ tur: 'mola', zaman: +times.rest.start }, { tur: 'moladan_don', zaman: +times.rest.end });
        }
        if (times.meal && +times.meal.start > entry) olaylar.push({ tur: 'yemek', zaman: +times.meal.start }, { tur: 'yemekten_don', zaman: +times.meal.end });
        olaylar.push({ tur: 'cikis', zaman: +times.exit });
        olaylar.sort((a, b) => a.zaman - b.zaman);
        return { ...base, durum: 'Planlı', gec: lateArrival && entry > +times.entry, olaylar: olaylar.map(event => ({ ...event, zaman: wallClock(event.zaman) })) };
    });
    return { tarih: day, kisiler };
}

const reasons = { door: 'Kapı pasif', card: 'Tanımsız kart', person: 'Personel pasif', permission: 'Kapı yetkisi yok' };

// Decides each read like a controller would (card known, person and door
// active, permission) and stores it in Logs; the owner trigger still runs.
async function recordReads(tx, reads) {
    const cards = reads.map(read => read.kart), doors = reads.map(read => read.kapi_id);
    const facts = (await new sql.Request(tx).input('cards', cards).input('doors', doors).query(`
        SELECT R.n, D.ID AS Door_ID, D.Durum AS Kapi_Durum, U.ID AS User_ID, U.Ad_Soyad, U.Durum AS Personel_Durum,
               EXISTS(SELECT 1 FROM Permissions P WHERE P.User_ID=U.ID AND P.Door_ID=D.ID) AS Yetkili
        FROM unnest(@cards::varchar[], @doors::int[]) WITH ORDINALITY R(kart, door, n)
        LEFT JOIN Doors D ON D.ID=R.door
        LEFT JOIN Users U ON gks_ci(U.RFID_Kart_No)=gks_ci(R.kart) AND U.RFID_Kart_No<>''
        ORDER BY R.n`)).recordset;
    if (facts.some(fact => !fact.Door_ID)) throw Object.assign(new Error('Kapı bulunamadı. Kat planını yeniden yükleyin.'), { statusCode: 404 });
    const results = facts.map(fact => {
        const reason = fact.Kapi_Durum === false ? reasons.door : !fact.User_ID ? reasons.card
            : fact.Personel_Durum === false ? reasons.person : !fact.Yetkili ? reasons.permission : null;
        return { basarili: !reason, neden: reason || 'Geçiş onaylandı', user_id: fact.User_ID ?? null, ad_soyad: fact.Ad_Soyad ?? null };
    });
    await new sql.Request(tx).input('cards', cards).input('doors', doors)
        .input('ok', results.map(result => result.basarili)).input('times', reads.map(read => new Date(read.zaman + 'Z')))
        .query('INSERT INTO Logs(RFID_Kart_No,Door_ID,Basarili_Mi,Zaman) SELECT * FROM unnest(@cards::varchar[],@doors::int[],@ok::boolean[],@times::timestamp[])');
    return results;
}

module.exports = { dayPlan, recordReads, reasons, MAX_PEOPLE };
