const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 004 must carry an existing rectangle plan over to floors and polygons.
test('004 moves an existing plan onto a ground floor as polygons', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    const root = path.resolve(__dirname, '../../database/migrations');
    await require('../test-support/database').createTestDatabase(t, { beforeMigration: async client => {
        await client.query('CREATE TABLE GksMigrations(Name varchar(200) NOT NULL PRIMARY KEY,Checksum char(64) NOT NULL,AppliedAt timestamp NOT NULL DEFAULT now())');
        for (const name of ['001_initial.sql', '002_sandbox.sql', '003_kat_plani.sql']) {
            const text = fs.readFileSync(path.join(root, name), 'utf8');
            await client.query(text);
            await client.query('INSERT INTO GksMigrations(Name,Checksum) VALUES($1,$2)', [name, crypto.createHash('sha256').update(text).digest('hex')]);
        }
        await client.query("INSERT INTO bolgeler(bolge_adi,bolge_turu,x,y,genislik,yukseklik) VALUES('Lobi','Lobi',40,200,200,240)");
        await client.query("INSERT INTO doors(kapi_adi,kapi_turu,plan_x,plan_y,bolge_b_id) SELECT 'Giriş','Ana Giriş',40,280,id FROM bolgeler");
        await client.query("INSERT INTO users(ad_soyad,rfid_kart_no) VALUES('Eski Kayıt','40000000001')");
        await client.query("INSERT INTO logs(rfid_kart_no,door_id,basarili_mi) SELECT '40000000001',id,true FROM doors");
    } });
    const { connectDB, sql } = require('../db');
    await connectDB();
    const floors = (await sql.query('SELECT ID, Kat_Adi, Sira FROM Katlar')).recordset;
    assert.deepEqual(floors.map(floor => [floor.Kat_Adi, floor.Sira]), [['Zemin Kat', 0]]);
    const area = (await sql.query('SELECT * FROM Bolgeler')).recordset[0];
    assert.deepEqual(area, { ID: area.ID, Kat_ID: floors[0].ID, Bolge_Adi: 'Lobi', Bolge_Turu: 'Lobi', Noktalar: [[40, 200], [240, 200], [240, 440], [40, 440]], Dikey_Grup: null });
    const door = (await sql.query('SELECT Bolge_B_ID, Yon_Kisiti FROM Doors')).recordset[0];
    assert.deepEqual(door, { Bolge_B_ID: area.ID, Yon_Kisiti: 'Çift' });
    assert.equal((await sql.query('SELECT Gecis_Anlami FROM Logs')).recordset[0].Gecis_Anlami, null, 'old reads keep using the door type');
});
