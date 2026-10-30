const test=require('node:test');const assert=require('node:assert/strict');
// Opt-in only; every run creates and removes its own isolated database.
test('database-backed API regression suite',{skip:process.env.RUN_DB_TESTS!=='true'},async t=>{
 await require('../test-support/database').createTestDatabase(t);
 const {connectDB,sql}=require('../db');await connectDB();
 const fixturePassword='Fixture-Admin-Password-123';
 const hash=await require('bcrypt').hash(fixturePassword,10);
 await new sql.Request().input('hash',sql.VarChar,hash).query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('fixture-admin',@hash,'admin'),('fixture-viewer',@hash,'user')");
 await sql.query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis) VALUES('Fixture Day','09:00','18:00'); INSERT INTO Users(Ad_Soyad,RFID_Kart_No,TC_Kimlik,Sicil_No,Ise_Giris_Tarihi) VALUES('Fixture 1','11000000001','22000000001','10001','2026-01-01'),('Fixture 2','11000000002','22000000002','10002','2026-01-01')");
 const {app}=require('../server');const server=require('http').createServer(app);const io=require('../utils/socket').init(server);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}/api`;
 const jwt=require('jsonwebtoken');const accounts=(await sql.query('SELECT ID,Rol,Kullanici_Adi,Token_Version FROM Yoneticiler')).recordset;
 const token=role=>{const a=accounts.find(a=>a.Rol===role);return jwt.sign({id:a.ID,role:a.Rol,kullanici_adi:a.Kullanici_Adi,version:a.Token_Version},process.env.JWT_SECRET,{expiresIn:'5m'});};
 const admin=token('admin'),viewer=token('user');
 const call=async(method,path,body,auth=admin)=>{const res=await fetch(root+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
 const stamp=String(Date.now()).slice(-9),card='88'+stamp,tc='77'+stamp,sicil=stamp.slice(-5);let uid;
 try {
  await t.test('fresh fixture administrator login works',async()=>{const result=await call('POST','/login',{username:'fixture-admin',password:fixturePassword},null);assert.equal(result.status,200);assert.equal(typeof result.data.token,'string');});
  await t.test('health and invalid login are structured',async()=>{assert.equal((await call('GET','/status')).status,200);assert.equal((await call('POST','/login',{})).status,400);});
  await t.test('viewer cannot change doors or approve overtime',async()=>{assert.equal((await call('POST','/doors',{},viewer)).status,403);assert.equal((await call('POST','/overtimes/approve',{},viewer)).status,403);});
  await t.test('setup and simulation are unavailable',async()=>{assert.equal((await call('POST','/ilk-kurulum',{})).status,404);assert.equal((await call('POST','/seeder/run',{})).status,404);});
  await t.test('pagination and invalid date range',async()=>{const page=await call('GET','/users?limit=1&page=2');assert.equal(page.data.data.length,1);assert.equal(page.data.pagination.page,2);assert.equal((await call('GET','/overtimes?baslangic=2026-02-30&bitis=2026-03-01')).status,400);});
  await t.test('create a disposable person with valid form',async()=>{const r=await call('POST','/users',{ad_soyad:'GKS TEST '+stamp,tc,sicil,rfid:card,ise_giris:'2026-01-01'});assert.equal(r.status,200,JSON.stringify(r.data));uid=(await new sql.Request().input('card',sql.NVarChar,card).query('SELECT ID FROM Users WHERE RFID_Kart_No=@card')).recordset[0].ID;});
  if(!uid)throw new Error('Fixture creation failed');
  const shift=(await sql.query('SELECT ID FROM Vardiyalar WHERE Durum=true ORDER BY ID LIMIT 1')).recordset[0].ID;
  await t.test('same-day assignment replacement then cancellation is consistent',async()=>{assert.equal((await call('POST',`/users/${uid}/shift`,{vardiya_id:String(shift)})).status,200);assert.equal((await call('POST',`/users/${uid}/shift`,{vardiya_id:String(shift)})).status,200);assert.equal((await call('POST',`/users/${uid}/shift`,{vardiya_id:''})).status,200);const rows=await new sql.Request().input('id',sql.Int,uid).query('SELECT * FROM Personel_Vardiya WHERE User_ID=@id');assert.equal(rows.recordset.length,0);});
  await t.test('failed bulk approval rolls back earlier rows',async()=>{const r=await call('POST','/overtimes/approve-bulk',{mesailer:[{user_id:uid,tarih:'2026-09-01',hesaplanan_dk:60,onaylanan_dk:0},{user_id:2147483647,tarih:'2026-09-01',hesaplanan_dk:60,onaylanan_dk:0}],durum:'Onaylandı'});assert.equal(r.status,404);const rows=await new sql.Request().input('id',sql.Int,uid).query("SELECT ID FROM Mesai_Onaylari WHERE User_ID=@id AND Tarih='2026-09-01'");assert.equal(rows.recordset.length,0);});
  await t.test('overtime uses server calculation, enforces limit and preserves decision metadata',async()=>{
    await new sql.Request().input('uid',sql.Int,uid).input('shift',sql.Int,shift)
      .query("INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi,Bitis_Tarihi) VALUES(@uid,@shift,'2026-09-07','2026-09-07')");
    await sql.query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('Fixture Entry','Ana Giriş'),('Fixture Exit','Ana Çıkış')");
    await new sql.Request().input('card',sql.NVarChar,card).query(`INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi)
        SELECT @card,ID,CAST(CASE WHEN Kapi_Turu='Ana Giriş' THEN '2026-09-07T09:00:00' ELSE '2026-09-07T19:00:00' END AS timestamp),true FROM Doors`);
    const body={user_id:uid,tarih:'2026-09-07',hesaplanan_dk:2880,onaylanan_dk:180,durum:'Onaylandı',aciklama:'Fixture decision'};
    assert.equal((await call('POST','/overtimes/approve',body)).status,200);
    const read=async()=> (await new sql.Request().input('uid',sql.Int,uid).query("SELECT * FROM Mesai_Onaylari WHERE User_ID=@uid AND Tarih='2026-09-07'")).recordset[0];
    let stored=await read();assert.equal(stored.Hesaplanan_Dk,60);assert.equal(stored.Onaylanan_Dk,180);
    const invalid=await call('POST','/overtimes/approve',{...body,onaylanan_dk:181});
    assert.equal(invalid.status,400);assert.match(invalid.data.message,/180/);assert.equal((await read()).Onaylanan_Dk,180);
    // An earlier valid row must roll back when a later row exceeds its calculated limit.
    assert.equal((await call('POST','/overtimes/approve-bulk',{mesailer:[{...body,onaylanan_dk:0},{...body,tarih:'2026-09-08',onaylanan_dk:121}],durum:'Onaylandı'})).status,400);
    assert.equal((await read()).Onaylanan_Dk,180);
    assert.equal((await call('POST','/overtimes/approve-bulk',{mesailer:[body,body],durum:'Onaylandı'})).status,400);
    for(const durum of ['Reddedildi','Bekliyor','Onaylandı']) {
      assert.equal((await call('POST','/overtimes/approve',{...body,durum,onaylanan_dk:0,hesaplanan_dk:undefined})).status,200);
      stored=await read();assert.equal(stored.Hesaplanan_Dk,60);assert.equal(stored.Onaylanan_Dk,0);assert.equal(stored.Durum,durum);
    }
    const concurrent=await Promise.all([1,2].map(()=>call('POST','/overtimes/approve',{...body,onaylanan_dk:0})));
    assert.deepEqual(concurrent.map(r=>r.status),[200,200]);
    const overtime=(await call('GET','/overtimes?baslangic=2026-09-07&bitis=2026-09-07')).data.find(r=>r.User_ID===uid);
    const daily=(await call('GET','/reports/daily-attendance?tarih=2026-09-07')).data.find(r=>r.User_ID===uid);
    for(const row of [overtime,daily]) {
      assert.equal(row.Hesaplanan_Dk,60);assert.equal(row.Fazla_Mesai_Dk,0);
      assert.equal(row.Mesai_Aciklama,'Fixture decision');assert.equal(row.Mesai_Islemi_Yapan,'fixture-admin');assert.ok(row.Mesai_Islem_Zamani);
    }
  });
  await t.test('password changes revoke old sessions and only change the caller',async()=>{
    const username='test-'+stamp;
    assert.equal((await call('POST','/hesap-ekle',{username,password:'Fixture-Password-123',rol:'user'})).status,200);
    const login=await call('POST','/login',{username,password:'Fixture-Password-123'},null);
    assert.equal(login.status,200);
    const old=login.data.token;
    assert.equal((await call('POST','/sifre-degistir',{eskiSifre:'Incorrect-Fixture-Password',yeniSifre:'New-Fixture-Password-123'},old)).status,401);
    assert.equal((await call('GET','/users',undefined,old)).status,200);
    assert.equal((await call('POST','/login',{username,password:'Fixture-Password-123'},null)).status,200);
    assert.equal((await call('POST','/sifre-degistir',{username:'fixture-admin',eskiSifre:'Fixture-Password-123',yeniSifre:'New-Fixture-Password-123'},old)).status,200);
    assert.equal((await call('GET','/users',undefined,old)).status,401);
    assert.equal((await call('POST','/login',{username,password:'Fixture-Password-123'},null)).status,401);
    assert.equal((await call('POST','/login',{username,password:'New-Fixture-Password-123'},null)).status,200);
    assert.equal((await call('POST','/login',{username:'fixture-admin',password:fixturePassword},null)).status,200);
  });
  await t.test('duplicate personnel names the clashing field',async()=>{const r=await call('POST','/users',{ad_soyad:'GKS DUP '+stamp,tc:'66'+stamp,sicil});assert.equal(r.status,409);assert.match(r.data.message,/sicil numarası/);});
  await t.test('zero approval survives storage and history includes exited staff',async()=>{assert.equal((await call('POST','/overtimes/approve',{user_id:uid,tarih:'2026-08-03',hesaplanan_dk:60,onaylanan_dk:0,durum:'Onaylandı'})).status,200);assert.equal((await call('PATCH',`/users/${uid}/status`,{durum:0,cikis_tarihi:'2026-08-04'})).status,200);const report=await call('GET','/reports/daily-attendance?tarih=2026-08-03');assert.equal(report.status,200);assert.equal(report.data.find(r=>r.User_ID===uid).Fazla_Mesai_Dk,0);const later=await call('GET','/reports/daily-attendance?tarih=2026-08-05');assert.equal(later.data.some(r=>r.User_ID===uid),false);});
  await t.test('profile updates preserve omitted fields and cannot overlap archived employment',async()=>{
    assert.equal((await call('PATCH',`/users/${uid}/status`,{durum:1})).status,200);
    const body={ad_soyad:'GKS Updated Fixture',tc,sicil};
    assert.equal((await call('PUT',`/users/${uid}`,{...body,ise_giris:'2026-08-01'})).status,409);
    const read=async()=>(await new sql.Request().input('id',sql.Int,uid).query('SELECT RFID_Kart_No,Ise_Giris_Tarihi FROM Users WHERE ID=@id')).recordset[0];
    const before=await read();
    assert.equal((await call('PUT',`/users/${uid}`,body)).status,200);
    assert.deepEqual(await read(),before);
    await require('../test-support/failures').failInsertsOn(sql,'SystemLogs','fixture profile audit failure');
    try {
      assert.equal((await call('PUT',`/users/${uid}`,{...body,rfid:'66000000001'})).status,500);
      assert.deepEqual(await read(),before);
    } finally { await require('../test-support/failures').restoreInserts(sql,'SystemLogs'); }
    assert.equal((await call('PUT',`/users/${uid}`,{...body,rfid:'66000000001'})).status,200);
    assert.equal((await read()).RFID_Kart_No,'66000000001');
  });
 } finally {
  await new Promise(r=>io.close(r));await sql.close();
 }
});
