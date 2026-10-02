const { sql } = require('../db');
const { inTransaction } = require('../utils/transaction');
const { referenceDate, accountName } = require('../config/demo');
const version = 'v1-2026-09-07';

async function seedDemo() {
    const name = process.env.DB_NAME || '';
    if (!/^Gks(?:Demo|Test)_[A-Za-z0-9_]+$/.test(name) || process.env.DEMO_SEED_CONFIRM !== name) {
        throw new Error('Seed yalnız GksDemo_/GksTest_ veritabanında, DEMO_SEED_CONFIRM=DB_NAME ile çalışır.');
    }
    return inTransaction(async tx => {
        const request = () => new sql.Request(tx);
        await request().query("IF OBJECT_ID('dbo.GksSeedState','U') IS NULL CREATE TABLE dbo.GksSeedState(Version nvarchar(100) PRIMARY KEY)");
        if ((await request().input('version', sql.NVarChar, version).query('SELECT Version FROM GksSeedState WITH(UPDLOCK,HOLDLOCK) WHERE Version=@version')).recordset.length) return { alreadySeeded: true };
        for (const table of ['Users','Doors','Vardiyalar','Logs','Izinler','Mesai_Onaylari','DoorLogs']) {
            if ((await request().query(`SELECT TOP 1 ID FROM ${table}`)).recordset.length) throw new Error('Demo seed boş iş tabloları gerektirir; mevcut veriler silinmedi.');
        }
        // Local installs may bootstrap their first administrator before seeding.
        // Preserve that audit record, but never seed over other business history.
        if ((await request().query("SELECT TOP 1 ID FROM SystemLogs WHERE Islem_Tipi IS NULL OR Islem_Tipi<>N'İLK KURULUM' OR Islemi_Yapan IS NULL OR Islemi_Yapan<>N'CLI Kurulum'")).recordset.length) {
            throw new Error('Demo seed boş iş tabloları gerektirir; mevcut veriler silinmedi.');
        }
        const account = (await request().input('name', sql.VarChar, accountName).query('SELECT Rol FROM Yoneticiler WHERE Kullanici_Adi=@name')).recordset[0];
        if (account && account.Rol !== 'user') throw new Error('Demo hesabı yalnız user rolünde olabilir.');
        if (!account) {
            const hash = await require('bcrypt').hash(require('crypto').randomUUID(), 10);
            await request().input('name', sql.VarChar, accountName).input('hash', sql.VarChar, hash)
                .query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol,Olusturulma_Tarihi) VALUES(@name,@hash,'user','2026-09-01')");
        }
        const shift = async (label, start, end) => (await request().input('label', sql.NVarChar,label).input('start',sql.NVarChar,start).input('end',sql.NVarChar,end)
            .query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Tolerans_Dk,Mola_Hakki_Dk,Calisma_Gunleri) OUTPUT INSERTED.ID VALUES(@label,@start,@end,10,30,'1,2,3,4,5')")).recordset[0].ID;
        const day = await shift('Sentetik Gündüz','09:00','18:00');const night=await shift('Sentetik Gece','22:00','06:00');
        const types=['Ana Giriş','Ana Çıkış','Yemekhane Giriş','Yemekhane Çıkış','Mola / Sigara Alanı','İç Geçiş'];const doors={};
        for(const [i,type] of types.entries()) doors[type]=(await request().input('name',sql.NVarChar,`Demo Kapı ${i+1}`).input('type',sql.NVarChar,type)
            .query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Departman,Konum) OUTPUT INSERTED.ID VALUES(@name,@type,N'Demo Birim',N'Sentetik Alan')")).recordset[0].ID;
        const users=[];
        for(let i=1;i<=12;i++) {
            const card=String(99000000000+i);
            const id=(await request().input('name',sql.NVarChar,`Demo Personel ${String(i).padStart(2,'0')}`).input('card',sql.NVarChar,card)
                .input('tc',sql.NVarChar,String(88000000000+i)).input('sicil',sql.NVarChar,String(10000+i)).input('system',sql.NVarChar,String(77000000000+i))
                .input('dept',sql.NVarChar,`Demo Birim ${i%3+1}`).query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,TC_Kimlik,Sicil_No,Sistem_ID,Departman,Sirket,Gorev,Ise_Giris_Tarihi) OUTPUT INSERTED.ID VALUES(@name,@card,@tc,@sicil,@system,@dept,N'Sentetik Kuruluş',N'Demo Görevi','2026-08-01')")).recordset[0].ID;
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
        await request().input('uid',sql.Int,users[7].id).query("INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Aciklama,Olusturulma_Tarihi) VALUES(@uid,N'Yıllık İzin','2026-09-07','2026-09-07',N'Sentetik izin senaryosu','2026-09-01')");
        await work(9,'09:00','18:00');
        for(const [type,time] of [['Ana Giriş','09:00'],['Yemekhane Giriş','12:00'],['Yemekhane Çıkış','13:00'],['Mola / Sigara Alanı','14:00'],['İç Geçiş','14:20'],['Ana Çıkış','18:00']]) await event(9,type,time,true,'2026-09-06');
        for(const person of [10,11,12]) await work(person,'09:00','19:00');
        await event(10,'Yemekhane Giriş','12:00');await event(10,'Yemekhane Çıkış','13:00');await event(10,'Mola / Sigara Alanı','15:00');await event(10,'İç Geçiş','15:45');
        for(const [person,status,approved] of [[10,'Onaylandı',60],[11,'Onaylandı',0],[12,'Reddedildi',0]]) await request().input('uid',sql.Int,users[person-1].id).input('status',sql.NVarChar,status).input('minutes',sql.Int,approved)
            .query("INSERT INTO Mesai_Onaylari(User_ID,Tarih,Hesaplanan_Dk,Onaylanan_Dk,Durum,Aciklama,Islemi_Yapan,Islem_Zamani) VALUES(@uid,'2026-09-07',60,@minutes,@status,N'Sentetik karar örneği',N'Demo Senaryosu','2026-09-08T09:00:00')");
        await event(1,'İç Geçiş','10:00',false);
        await request().query("INSERT INTO SystemLogs(Islem_Tipi,Personel_Ad,Detay,Islemi_Yapan,Tarih) VALUES(N'DEMO HAZIRLIK',N'Demo Personel 01',N'Sentetik vardiya ve izin senaryoları hazırlandı.',N'Demo Senaryosu','2026-09-07T08:00:00'); INSERT INTO DoorLogs(Islem_Tipi,Kapi_Adi,Detay,Islemi_Yapan,Tarih) VALUES(N'DEMO YETKİ',N'Demo Kapı 1',N'Sentetik kapı yetkileri hazırlandı.',N'Demo Senaryosu','2026-09-07T08:00:00')");
        await request().input('version',sql.NVarChar,version).query('INSERT INTO GksSeedState(Version) VALUES(@version)');
        return {alreadySeeded:false,referenceDate,personnel:users.length};
    });
}
module.exports={seedDemo};
