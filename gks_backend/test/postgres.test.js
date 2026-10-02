const test = require('node:test');
const assert = require('node:assert/strict');

test('PostgreSQL returns mssql-compatible values and keeps case-insensitive rules', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    const { inTransaction } = require('../utils/transaction');
    const business = require('../config/business');

    await t.test('time, date, timestamp, bigint and boolean keep their JavaScript shapes', async () => {
        await sql.query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis) VALUES('Tip','09:05:30','18:00')");
        const shift = (await sql.query('SELECT * FROM Vardiyalar')).recordset[0];
        assert.deepEqual(shift.Mesai_Baslangic, new Date('1970-01-01T09:05:30Z'));
        assert.equal(shift.Mesai_Baslangic.getUTCHours(), 9);
        assert.equal(shift.Durum, true);
        const row = (await new sql.Request().input('day', sql.Date, '2026-09-07').input('at', sql.DateTime, new Date('2026-09-07T23:59:59.997Z'))
            .query('SELECT @day AS Tarih, @at AS Zaman, COUNT(*) AS n FROM Vardiyalar')).recordset[0];
        assert.deepEqual(row, { Tarih: new Date('2026-09-07T00:00:00Z'), Zaman: new Date('2026-09-07T23:59:59.997Z'), n: 1 });
    });

    await t.test('database defaults use the business timezone wall clock', async () => {
        const { Saat, Tarih } = (await sql.query('SELECT LOCALTIMESTAMP AS Saat, CURRENT_DATE AS Tarih')).recordset[0];
        assert.ok(Math.abs(Saat.getTime() - Date.parse(new Date().toLocaleString('sv-SE', { timeZone: business.timeZone }).replace(' ', 'T') + 'Z')) < 60000);
        assert.equal(Tarih.toISOString().slice(0, 10), business.date());
    });

    await t.test('search ignores case and Turkish accents', async () => {
        await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No) VALUES('Işık Çelik','tr-1','tr-1'),('İŞÇİ ÖZGÜR','tr-2','tr-2')");
        const count = async term => (await new sql.Request().input('q', sql.NVarChar, `%${term}%`)
            .query('SELECT COUNT(*) AS n FROM Users WHERE gks_search(Ad_Soyad) LIKE gks_search(@q)')).recordset[0].n;
        for (const term of ['ISIK', 'ışık', 'celik', 'isci', 'İşçi', 'ozgur']) assert.equal(await count(term), 1, term);
        assert.equal(await count('SIK'), 1);
        assert.equal(await count('yok'), 0);
    });

    await t.test('user name, card and registry numbers are unique regardless of case', async () => {
        const { isUniqueViolation } = require('../utils/dbErrors');
        await sql.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash) VALUES('Admin','x')");
        for (const statement of [
            "INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash) VALUES('ADMIN','x')",
            "INSERT INTO Users(Ad_Soyad,RFID_Kart_No) VALUES('Kopya','TR-1')",
            "INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No) VALUES('Kopya','tr-3','TR-2')",
        ]) await assert.rejects(sql.query(statement), error => isUniqueViolation(error), statement);
        const login = await new sql.Request().input('name', sql.VarChar, 'aDMIN').query('SELECT ID FROM Yoneticiler WHERE gks_ci(Kullanici_Adi)=gks_ci(@name)');
        assert.equal(login.recordset.length, 1);
    });

    await t.test('serialization failures are retried with a fresh transaction', async () => {
        let attempts = 0;
        const count = await inTransaction(async tx => {
            attempts++;
            if (attempts < 3) throw Object.assign(new Error('fixture conflict'), { code: '40001' });
            return (await new sql.Request(tx).query('SELECT COUNT(*) AS n FROM Users')).recordset[0].n;
        });
        assert.equal(attempts, 3);
        assert.equal(count, 2);
        attempts = 0;
        await assert.rejects(inTransaction(async () => { attempts++; throw Object.assign(new Error('always'), { code: '40001' }); }), /always/);
        assert.equal(attempts, 4);
        // A real write conflict between two serializable transactions is retried.
        await sql.query("INSERT INTO Doors(Kapi_Adi) VALUES('Sayaç')");
        const bump = () => inTransaction(async tx => {
            const { Kapi_Adi } = (await new sql.Request(tx).query('SELECT Kapi_Adi FROM Doors')).recordset[0];
            await new Promise(resolve => setTimeout(resolve, 50));
            await new sql.Request(tx).input('name', sql.NVarChar, Kapi_Adi + '+').query('UPDATE Doors SET Kapi_Adi=@name');
        });
        await Promise.all([bump(), bump()]);
        assert.equal((await sql.query('SELECT Kapi_Adi FROM Doors')).recordset[0].Kapi_Adi, 'Sayaç++');
    });

    await t.test('a commit after a swallowed error is reported instead of silently rolled back', async () => {
        const tx = new sql.Transaction();
        await tx.begin();
        await assert.rejects(new sql.Request(tx).query('SELECT 1/0 AS n'));
        await assert.rejects(tx.commit(), error => error.code === '25P02');
    });
});
