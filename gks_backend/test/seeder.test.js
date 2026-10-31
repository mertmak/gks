const test = require('node:test');
const assert = require('node:assert/strict');

test('simulation is atomic and accepts quoted names', {skip: process.env.RUN_SIM_TESTS !== 'true'}, async t => {
  await require('../test-support/database').createTestDatabase(t);
  const {sql,connectDB} = require('../db');
  await connectDB();
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/api',require('../routes/seederRoutes'));
  const server = require('http').createServer(app);
  const io = require('../utils/socket').init(server);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let account, shift;
  try {
    const count = (await sql.query('SELECT COUNT(*) AS n FROM Users')).recordset[0].n;
    assert.equal(count, 0, 'Refuse to modify a populated database');
    account = (await sql.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('simulation-test','unused','admin') RETURNING ID")).recordset[0].ID;
    shift = (await sql.query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis) VALUES('Test','09:00','18:00') RETURNING ID")).recordset[0].ID;
    const token = require('jsonwebtoken').sign({id:account,version:0,role:'admin'},process.env.JWT_SECRET,{expiresIn:'5m'});
    const call = async body => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/seeder/run`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
      return {status:res.status,data:await res.json()};
    };
    const body = {userAction:'append',doorAction:'append',logAction:'append',personelSayisi:2,kapiSayisi:2,vardiyaId:shift,startDateStr:'2026-09-07',endDateStr:'2026-09-07',customIsimler:"O'Neil",customSoyisimler:"D'Angelo",customDepartmanlar:"Ar'Ge",customKapilar:'Ana Giriş,Ana Çıkış'};
    const result = await call(body);
    assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal((await sql.query("SELECT Ad_Soyad FROM Users WHERE Ad_Soyad LIKE 'O%'")).recordset[0].Ad_Soyad,"O'Neil D'Angelo");
    assert.ok((await sql.query('SELECT Ad_Soyad,Departman FROM Users')).recordset.every(row => row.Ad_Soyad === "O'Neil D'Angelo" && row.Departman === "Ar'Ge"));
    assert.ok((await sql.query('SELECT COUNT(*) AS n FROM Logs')).recordset[0].n >= 2);
    assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Logs WHERE User_ID IS NULL')).recordset[0].n, 0);
    const before = (await sql.query('SELECT COUNT(*) AS n FROM Doors')).recordset[0].n;
    assert.equal((await call({...body,customKapilar:'x'.repeat(200)+',Ana Giriş'})).status,500);
    assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Doors')).recordset[0].n,before);
    assert.equal((await call({...body,logAction:'reset_all'})).status,400);
    await t.test('simulation rejects invalid IDs and uses overnight minute offsets in SQL', async () => {
      for (const vardiyaId of [true, null, '', '1x', 2147483648]) {
        assert.equal((await call({ ...body, vardiyaId })).status, 400);
      }
      assert.equal((await call({ ...body, vardiyaId:2147483647 })).status, 404);
      assert.equal((await call({ ...body, endDateStr:'2026-10-08' })).status, 400);
      await sql.query(`UPDATE Vardiyalar SET Mesai_Baslangic='22:45',Mesai_Bitis='06:15',Yemek_Baslangic='02:35' WHERE ID=${shift}`);
      const lastId = (await sql.query('SELECT MAX(ID) AS ID FROM Logs')).recordset[0].ID;
      const result = await call({ ...body, userAction:'keep', kapiSayisi:4, customKapilar:'Yemekhane Giriş,Yemekhane Çıkış,Mola / Sigara Alanı,İç Geçiş' });
      assert.equal(result.status, 200);
      const logs = (await sql.query(`SELECT L.Zaman,D.Kapi_Turu FROM Logs L JOIN Doors D ON D.ID=L.Door_ID WHERE L.ID>${lastId} AND L.Basarili_Mi=true`)).recordset;
      const entry = logs.filter(row => row.Kapi_Turu === 'Ana Giriş');
      const exit = logs.filter(row => row.Kapi_Turu === 'Ana Çıkış');
      const meals = logs.filter(row => row.Kapi_Turu.startsWith('Yemekhane'));
      assert.ok(entry.length && exit.length && meals.length);
      assert.ok(entry.every(row => row.Zaman >= new Date('2026-09-07T22:15:00Z') && row.Zaman <= new Date('2026-09-07T23:29:00Z')));
      assert.ok(exit.every(row => row.Zaman >= new Date('2026-09-08T06:00:00Z') && row.Zaman <= new Date('2026-09-08T07:44:00Z')));
      assert.ok(meals.every(row => row.Zaman >= new Date('2026-09-08T02:35:00Z') && row.Zaman <= new Date('2026-09-08T03:43:00Z')));
    });
    await t.test('replace drops the range before writing, including the night shift\'s morning exit', async () => {
      const lastId = (await sql.query('SELECT MAX(ID) AS ID FROM Logs')).recordset[0].ID;
      const result = await call({ ...body, userAction:'keep', doorAction:'keep', logAction:'replace' });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      // 22:45–06:15 shift: its 24h window is 14:30 → 14:30 next day.
      const old = window => sql.query(`SELECT COUNT(*) AS n FROM Logs WHERE ID<=${lastId} AND Zaman${window}`).then(r => r.recordset[0].n);
      assert.equal(await old(">='2026-09-07T14:30:00'"), 0);
      assert.ok(await old("<'2026-09-07T14:30:00'") > 0, 'logs outside the window stay');
      assert.ok((await sql.query('SELECT COUNT(*) AS n FROM Logs')).recordset[0].n > 0);
    });
  } finally {
    await new Promise(resolve => io.close(resolve)); await sql.close();
  }
});
