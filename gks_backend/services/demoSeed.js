const { sql } = require('../db');
const { inTransaction, advisoryLock } = require('../utils/transaction');
const locks = require('../db/locks');
const { referenceDate, accountName } = require('../config/demo');
const { templates, savePlan } = require('./floorPlan');
const { attendance } = require('./attendance');
const factory = require('./demoCompany');
const version = 'v4-resmi-tatil-2026-11-01';

const seeded = async tx => (await new sql.Request(tx).input('version', sql.NVarChar, version)
    .query('SELECT Version FROM GksSeedState WHERE Version=@version')).recordset.length > 0;

// One INSERT ... unnest per 5000 rows; `columns` maps each column to its SQL type.
async function insertRows(tx, table, columns, rows) {
    const names = Object.keys(columns);
    for (let i = 0; i < rows.length; i += 5000) {
        const chunk = rows.slice(i, i + 5000);
        const request = new sql.Request(tx);
        names.forEach((name, j) => request.input(`c${j}`, chunk.map(row => row[name] ?? null)));
        await request.query(`INSERT INTO ${table}(${names.join(',')}) SELECT * FROM unnest(${names.map((name, j) => `@c${j}::${columns[name]}[]`).join(',')})`);
    }
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
        if (await seeded(tx)) return { alreadySeeded: true };
        for (const table of ['Users','Doors','Vardiyalar','Logs','Izinler','Mesai_Onaylari','DoorLogs','Katlar','Resmi_Tatiller']) {
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
                .query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol,Olusturulma_Tarihi) VALUES(@name,@hash,'user','2025-10-20')");
        }

        const data = factory.build();
        await insertRows(tx, 'Resmi_Tatiller', { Tarih: 'date', Tatil_Adi: 'varchar' },
            factory.holidays.flatMap(([start, end, Tatil_Adi]) => { const out = []; for (let d = start; d <= end; d = factory.addDays(d, 1)) out.push({ Tarih: d, Tatil_Adi }); return out; }));
        const shiftIds = {}, doorIds = {};
        for (const s of factory.shifts) {
            shiftIds[s.key] = (await request().input('ad', sql.NVarChar, s.Vardiya_Adi).input('bas', sql.NVarChar, s.Mesai_Baslangic).input('bit', sql.NVarChar, s.Mesai_Bitis)
                .input('ybas', sql.NVarChar, s.Yemek_Baslangic).input('ybit', sql.NVarChar, s.Yemek_Bitis).input('tol', sql.Int, s.Tolerans_Dk).input('mola', sql.Int, s.Mola_Hakki_Dk).input('gunler', sql.NVarChar, s.Calisma_Gunleri)
                .query('INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Yemek_Baslangic,Yemek_Bitis,Tolerans_Dk,Mola_Hakki_Dk,Calisma_Gunleri) VALUES(@ad,@bas,@bit,@ybas,@ybit,@tol,@mola,@gunler) RETURNING ID')).recordset[0].ID;
        }
        for (const door of factory.doors) {
            doorIds[door.key] = (await request().input('ad', sql.NVarChar, door.Kapi_Adi).input('tur', sql.NVarChar, door.Kapi_Turu).input('dep', sql.NVarChar, door.Departman).input('konum', sql.NVarChar, door.Konum)
                .query('INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Departman,Konum) VALUES(@ad,@tur,@dep,@konum) RETURNING ID')).recordset[0].ID;
        }
        await insertRows(tx, 'Users', { Ad_Soyad: 'varchar', RFID_Kart_No: 'varchar', Durum: 'boolean', TC_Kimlik: 'varchar', Sicil_No: 'varchar', Sirket: 'varchar', Departman: 'varchar',
            Gorev: 'varchar', Sistem_ID: 'varchar', Ise_Giris_Tarihi: 'date', Isten_Cikis_Tarihi: 'date', Cikis_Nedeni: 'varchar' }, data.users);
        const ids = new Map((await request().query('SELECT ID, Sicil_No FROM Users')).recordset.map(row => [row.Sicil_No, row.ID]));
        const id = person => person ? ids.get(person.Sicil_No) : null;
        await insertRows(tx, 'Permissions', { User_ID: 'int', Door_ID: 'int' }, data.permissions.map(p => ({ User_ID: id(p.person), Door_ID: doorIds[p.door] })));
        await insertRows(tx, 'Personel_Vardiya', { User_ID: 'int', Vardiya_ID: 'int', Baslangic_Tarihi: 'date', Bitis_Tarihi: 'date' },
            data.assignments.map(a => ({ User_ID: id(a.person), Vardiya_ID: shiftIds[a.shift], Baslangic_Tarihi: a.start, Bitis_Tarihi: a.end })));
        await insertRows(tx, 'Personel_Calisma_Gecmisi', { User_ID: 'int', Baslangic_Tarihi: 'date', Bitis_Tarihi: 'date', Cikis_Nedeni: 'varchar' },
            data.history.map(h => ({ ...h, User_ID: id(h.person) })));
        await insertRows(tx, 'Izinler', { User_ID: 'int', Izin_Turu: 'varchar', Baslangic_Tarihi: 'date', Bitis_Tarihi: 'date', Aciklama: 'varchar', Durum: 'varchar', Olusturulma_Tarihi: 'timestamp' },
            data.leaves.map(l => ({ ...l, User_ID: id(l.person) })));
        // Owners are set from the card holder at the time of the pass (lost cards
        // were replaced), so the capture trigger is bypassed for the history.
        await request().query('ALTER TABLE Logs DISABLE TRIGGER tr_logs_capture_owner');
        await insertRows(tx, 'Logs', { RFID_Kart_No: 'varchar', Door_ID: 'int', Zaman: 'timestamp', Basarili_Mi: 'boolean', User_ID: 'int' },
            data.logs.map(l => ({ RFID_Kart_No: l.card, Door_ID: doorIds[l.door], Zaman: l.Zaman, Basarili_Mi: l.Basarili_Mi, User_ID: id(l.person) })));
        await request().query('ALTER TABLE Logs ENABLE TRIGGER tr_logs_capture_owner');

        // Overtime is decided on the server's own calculation, as the approval route does.
        const decisions = factory.overtimeDecisions(await attendance(factory.firstDay, referenceDate, { transaction: tx }), data.approver);
        await insertRows(tx, 'Mesai_Onaylari', { User_ID: 'int', Tarih: 'date', Hesaplanan_Dk: 'int', Onaylanan_Dk: 'int', Durum: 'varchar', Aciklama: 'varchar', Islemi_Yapan: 'varchar', Islem_Zamani: 'timestamp' }, decisions);
        const systemLogs = [...data.systemLogs, ...decisions.map(d => ({ Tarih: d.Islem_Zamani, Islem_Tipi: 'MESAİ KARARI', Personel_Ad: d.Ad_Soyad, Sicil_No: d.Sicil_No, Islemi_Yapan: d.Islemi_Yapan,
            Detay: JSON.stringify({ user_id: d.User_ID, tarih: d.Tarih, onceki_durum: 'Bekliyor', onceki_onaylanan_dk: 0, durum: d.Durum, hesaplanan_dk: d.Hesaplanan_Dk, onaylanan_dk: d.Onaylanan_Dk, aciklama: d.Aciklama }) })),
            ...data.assignments.filter(a => a.rotation).map(a => ({ Tarih: `${a.start}T07:30:00`, Islem_Tipi: 'VARDİYA GÜNCELLEME', Personel_Ad: a.person.Ad_Soyad, Sicil_No: a.person.Sicil_No,
                Islemi_Yapan: data.hr, Detay: JSON.stringify({ vardiya_id: shiftIds[a.shift] }) }))]
            .sort((a, b) => a.Tarih.localeCompare(b.Tarih));
        await insertRows(tx, 'SystemLogs', { Islem_Tipi: 'varchar', Personel_Ad: 'varchar', Sicil_No: 'varchar', Detay: 'text', Islemi_Yapan: 'varchar', Tarih: 'timestamp' }, systemLogs);
        await insertRows(tx, 'DoorLogs', { Islem_Tipi: 'varchar', Kapi_Adi: 'varchar', Detay: 'text', Islemi_Yapan: 'varchar', Tarih: 'timestamp' }, data.doorLogs);

        // Doors take the factory template's slots in order; the gates are one-way.
        const { katlar, bolgeler, slots } = templates.fabrika;
        const used = {};
        const kapilar = factory.doors.map(door => {
            const [bolge_a, bolge_b, plan_x, plan_y] = slots[door.Kapi_Turu][used[door.Kapi_Turu] = (used[door.Kapi_Turu] ?? -1) + 1];
            return { id: doorIds[door.key], bolge_a, bolge_b, plan_x, plan_y, yon_kisiti: { 'Ana Giriş': 'A→B', 'Ana Çıkış': 'B→A' }[door.Kapi_Turu] };
        });
        await savePlan(tx, { katlar, bolgeler, kapilar });
        await request().input('version', sql.NVarChar, version).query('INSERT INTO GksSeedState(Version) VALUES(@version)');
        return { alreadySeeded: false, referenceDate, personnel: data.users.length, logs: data.logs.length };
    });
}
module.exports = { seedDemo };
