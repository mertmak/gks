const { sql } = require('../db');
const { inTransaction, advisoryLock } = require('../utils/transaction');
const locks = require('../db/locks');
const { referenceDate, accountName } = require('../config/demo');
const { templates, savePlan } = require('./floorPlan');
const version = 'v1-2026-09-07';
// Added later as its own step, so `seed:demo` also adds it to a demo seeded before.
const planVersion = 'v2-kat-plani';

const seeded = async (tx, value) => (await new sql.Request(tx).input('version', sql.NVarChar, value)
    .query('SELECT Version FROM GksSeedState WHERE Version=@version')).recordset.length > 0;

// The Office template's areas with the six demo doors, plus a lobby turnstile
// every demo person may use. Demo Kapı 6 (inner door, even-numbered people
// only) is the way back from the break area, as in the seeded logs.
async function seedPlan(tx) {
    const request = () => new sql.Request(tx);
    if (await seeded(tx, planVersion) || (await request().query('SELECT ID FROM Bolgeler LIMIT 1')).recordset.length) return false;
    const doors = Object.fromEntries((await request().query("SELECT ID, Kapi_Adi FROM Doors WHERE Kapi_Adi LIKE 'Demo Kapı _'")).recordset.map(door => [door.Kapi_Adi, door.ID]));
    if (Object.keys(doors).length !== 6) return false;
    const turnstile = (await request().query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Departman,Konum) VALUES('Demo Kapı 7','İç Geçiş','Demo Birim','Lobi Turnikesi') RETURNING ID")).recordset[0].ID;
    await request().input('door', sql.Int, turnstile).query('INSERT INTO Permissions(User_ID,Door_ID) SELECT ID,@door FROM Users');
    const { katlar, bolgeler } = templates.ofis;
    const place = (id, bolge_a, bolge_b, plan_x, plan_y, yon_kisiti) => ({ id, bolge_a, bolge_b, plan_x, plan_y, yon_kisiti });
    await savePlan(tx, { katlar, bolgeler, kapilar: [
        place(doors['Demo Kapı 1'], null, 'lobi', 40, 280, 'A→B'),
        place(doors['Demo Kapı 2'], null, 'lobi', 40, 360, 'B→A'),
        place(turnstile, 'lobi', 'ofis', 240, 320),
        place(doors['Demo Kapı 3'], 'ofis', 'yemekhane', 300, 440),
        place(doors['Demo Kapı 4'], 'ofis', 'yemekhane', 440, 440),
        place(doors['Demo Kapı 5'], 'ofis', 'mola', 720, 80),
        place(doors['Demo Kapı 6'], 'ofis', 'mola', 720, 200),
    ] });
    // Dated like the rest of the demo history, not on the day the step runs.
    await request().query("INSERT INTO DoorLogs(Islem_Tipi,Kapi_Adi,Detay,Islemi_Yapan,Tarih) VALUES('KAT PLANI GÜNCELLENDİ','Kat Planı','Sentetik kat planı hazırlandı: 1 kat, 5 bölge, 7 yerleşik kapı.','Demo Senaryosu','2026-09-07T08:00:00')");
    await request().input('version', sql.NVarChar, planVersion).query('INSERT INTO GksSeedState(Version) VALUES(@version)');
    return true;
}

async function seedDemo() {
    const name = process.env.DB_NAME || '';
    if (!/^gks(?:demo|test)_[a-z0-9_]+$/.test(name) || process.env.DEMO_SEED_CONFIRM !== name) {
        throw new Error('Seed yalnız gksdemo_/gkstest_ veritabanında, DEMO_SEED_CONFIRM=DB_NAME ile çalışır.');
    }
    return inTransaction(async tx => {
        const request = () => new sql.Request(tx);
        // Concurrent seed runs wait here; the loser then sees the version row.
        await advisoryLock(tx, locks.demoSeed);
        await request().query('CREATE TABLE IF NOT EXISTS GksSeedState(Version varchar(100) PRIMARY KEY)');
        if (await seeded(tx, version)) return { alreadySeeded: true, plan: await seedPlan(tx) };
        for (const table of ['Users','Doors','Vardiyalar','Logs','Izinler','Mesai_Onaylari','DoorLogs']) {
            if ((await request().query(`SELECT ID FROM ${table} LIMIT 1`)).recordset.length) throw new Error('Demo seed boş iş tabloları gerektirir; mevcut veriler silinmedi.');
        }
        // Local installs may bootstrap their first administrator before seeding.
        // Preserve that audit record, but never seed over other business history.
        if ((await request().query("SELECT ID FROM SystemLogs WHERE Islem_Tipi IS NULL OR Islem_Tipi<>'İLK KURULUM' OR Islemi_Yapan IS NULL OR Islemi_Yapan<>'CLI Kurulum' LIMIT 1")).recordset.length) {
            throw new Error('Demo seed boş iş tabloları gerektirir; mevcut veriler silinmedi.');
        }
        const account = (await request().input('name', sql.VarChar, accountName).query('SELECT Rol FROM Yoneticiler WHERE gks_ci(Kullanici_Adi)=gks_ci(@name)')).recordset[0];
        if (account && account.Rol !== 'user') throw new Error('Demo hesabı yalnız user rolünde olabilir.');
        if (!account) {
            const hash = await require('bcrypt').hash(require('crypto').randomUUID(), 10);
            await request().input('name', sql.VarChar, accountName).input('hash', sql.VarChar, hash)
                .query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol,Olusturulma_Tarihi) VALUES(@name,@hash,'user','2026-09-01')");
        }
        const shift = async (label, start, end) => (await request().input('label', sql.NVarChar,label).input('start',sql.NVarChar,start).input('end',sql.NVarChar,end)
            .query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Tolerans_Dk,Mola_Hakki_Dk,Calisma_Gunleri) VALUES(@label,@start,@end,10,30,'1,2,3,4,5') RETURNING ID")).recordset[0].ID;
        const day = await shift('Sentetik Gündüz','09:00','18:00');const night=await shift('Sentetik Gece','22:00','06:00');
        const types=['Ana Giriş','Ana Çıkış','Yemekhane Giriş','Yemekhane Çıkış','Mola / Sigara Alanı','İç Geçiş'];const doors={};
        for(const [i,type] of types.entries()) doors[type]=(await request().input('name',sql.NVarChar,`Demo Kapı ${i+1}`).input('type',sql.NVarChar,type)
            .query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Departman,Konum) VALUES(@name,@type,'Demo Birim','Sentetik Alan') RETURNING ID")).recordset[0].ID;
        const users=[];
        for(let i=1;i<=12;i++) {
            const card=String(99000000000+i);
            const id=(await request().input('name',sql.NVarChar,`Demo Personel ${String(i).padStart(2,'0')}`).input('card',sql.NVarChar,card)
                .input('tc',sql.NVarChar,String(88000000000+i)).input('sicil',sql.NVarChar,String(10000+i)).input('system',sql.NVarChar,String(77000000000+i))
                .input('dept',sql.NVarChar,`Demo Birim ${i%3+1}`).query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,TC_Kimlik,Sicil_No,Sistem_ID,Departman,Sirket,Gorev,Ise_Giris_Tarihi) VALUES(@name,@card,@tc,@sicil,@system,@dept,'Sentetik Kuruluş','Demo Görevi','2026-08-01') RETURNING ID")).recordset[0].ID;
            await request().input('uid',sql.Int,id).input('shift',sql.Int,i===2?night:day).query("INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) VALUES(@uid,@shift,'2026-08-01')");
            for(const type of types.slice(0,i%2===0?6:4)) await request().input('uid',sql.Int,id).input('did',sql.Int,doors[type]).query('INSERT INTO Permissions(User_ID,Door_ID) VALUES(@uid,@did)');
            users.push({id,card});
        }
        const event=async (person,type,time,ok=true,date=referenceDate) => {
            await request().input('card',sql.NVarChar,users[person-1].card).input('door',sql.Int,doors[type]).input('time',sql.DateTime,new Date(`${date}T${time}:00Z`)).input('ok',sql.Bit,ok)
                .query('INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES(@card,@door,@time,@ok)');
        };
        const work=async (person,start,end) => {await event(person,'Ana Giriş',start);if(end)await event(person,'Ana Çıkış',end);};
        await work(1,'09:00','18:00');
        await event(2,'Ana Giriş','22:00');await event(2,'Ana Çıkış','06:30',true,'2026-09-08');
        await work(3,'09:09','18:00');await work(4,'09:11','18:00');await work(5,'09:00','17:30');await work(6,'09:00',null);
        // 7 absent; 8 approved leave; 9 holiday work and normal Monday.
        await request().input('uid',sql.Int,users[7].id).query("INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Aciklama,Olusturulma_Tarihi) VALUES(@uid,'Yıllık İzin','2026-09-07','2026-09-07','Sentetik izin senaryosu','2026-09-01')");
        await work(9,'09:00','18:00');
        for(const [type,time] of [['Ana Giriş','09:00'],['Yemekhane Giriş','12:00'],['Yemekhane Çıkış','13:00'],['Mola / Sigara Alanı','14:00'],['İç Geçiş','14:20'],['Ana Çıkış','18:00']]) await event(9,type,time,true,'2026-09-06');
        for(const person of [10,11,12]) await work(person,'09:00','19:00');
        await event(10,'Yemekhane Giriş','12:00');await event(10,'Yemekhane Çıkış','13:00');await event(10,'Mola / Sigara Alanı','15:00');await event(10,'İç Geçiş','15:45');
        for(const [person,status,approved] of [[10,'Onaylandı',60],[11,'Onaylandı',0],[12,'Reddedildi',0]]) await request().input('uid',sql.Int,users[person-1].id).input('status',sql.NVarChar,status).input('minutes',sql.Int,approved)
            .query("INSERT INTO Mesai_Onaylari(User_ID,Tarih,Hesaplanan_Dk,Onaylanan_Dk,Durum,Aciklama,Islemi_Yapan,Islem_Zamani) VALUES(@uid,'2026-09-07',60,@minutes,@status,'Sentetik karar örneği','Demo Senaryosu','2026-09-08T09:00:00')");
        await event(1,'İç Geçiş','10:00',false);
        await request().query("INSERT INTO SystemLogs(Islem_Tipi,Personel_Ad,Detay,Islemi_Yapan,Tarih) VALUES('DEMO HAZIRLIK','Demo Personel 01','Sentetik vardiya ve izin senaryoları hazırlandı.','Demo Senaryosu','2026-09-07T08:00:00'); INSERT INTO DoorLogs(Islem_Tipi,Kapi_Adi,Detay,Islemi_Yapan,Tarih) VALUES('DEMO YETKİ','Demo Kapı 1','Sentetik kapı yetkileri hazırlandı.','Demo Senaryosu','2026-09-07T08:00:00')");
        await request().input('version',sql.NVarChar,version).query('INSERT INTO GksSeedState(Version) VALUES(@version)');
        return {alreadySeeded:false,referenceDate,personnel:users.length,plan:await seedPlan(tx)};
    });
}
module.exports={seedDemo};
