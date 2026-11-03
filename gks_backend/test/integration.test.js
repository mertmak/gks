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
  await t.test('official holiday turns a shift day into Resmi Tatil and is admin-only',async()=>{
    await new sql.Request().input('uid',sql.Int,uid).input('shift',sql.Int,shift)
      .query("INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi,Bitis_Tarihi) VALUES(@uid,@shift,'2026-09-08','2026-09-08')");
    const status=async()=>(await call('GET','/reports/daily-attendance?tarih=2026-09-08')).data.find(r=>r.User_ID===uid).Durum;
    assert.equal(await status(),'Devamsız');
    assert.equal((await call('POST','/holidays',{tarih:'2026-09-08',tatil_adi:'Fixture Bayramı'},viewer)).status,403);
    assert.equal((await call('POST','/holidays',{tarih:'2026-09-08',tatil_adi:'Fixture Bayramı'})).status,200);
    assert.equal((await call('POST','/holidays',{tarih:'2026-09-08',tatil_adi:'İkinci'})).status,409);
    assert.equal(await status(),'Resmi Tatil');
    const holiday=(await call('GET','/holidays',undefined,viewer)).data.find(h=>h.Tatil_Adi==='Fixture Bayramı');
    assert.equal((await call('DELETE',`/holidays/${holiday.ID}`)).status,200);
    assert.equal((await call('DELETE',`/holidays/${holiday.ID}`)).status,404);
    assert.equal(await status(),'Devamsız');
    assert.equal((await sql.query("SELECT COUNT(*) AS n FROM SystemLogs WHERE Islem_Tipi='RESMİ TATİL'")).recordset[0].n,2);
  });
  await t.test('annual leave balance counts shift working days without official holidays',async()=>{
    const person=(await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No,Ise_Giris_Tarihi) VALUES('Fixture Bakiye','"+card+"9','B"+sicil+"','2019-01-01') RETURNING ID")).recordset[0].ID;
    const q=text=>new sql.Request().input('uid',sql.Int,person).query(text);
    await q("INSERT INTO Personel_Calisma_Gecmisi(User_ID,Baslangic_Tarihi,Bitis_Tarihi) VALUES(@uid,'2010-01-01','2010-12-31')");
    await q(`INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Durum) VALUES
      (@uid,'Yıllık İzin','2026-09-07','2026-09-13','Onaylandı'),(@uid,'Yıllık İzin','2026-09-14','2026-09-15','Bekliyor'),
      (@uid,'Yıllık İzin','2026-09-16','2026-09-18','Reddedildi'),(@uid,'Raporlu','2026-09-21','2026-09-22','Onaylandı')`);
    await sql.query("INSERT INTO Resmi_Tatiller(Tarih,Tatil_Adi) VALUES('2026-09-09','Fixture Tatil')");
    const {annualLeaveEntitlement}=require('../utils/annualLeave');const {businessToday,dateKey}=require('../utils/attendance');
    const expected=annualLeaveEntitlement([{start:'2010-01-01',end:'2010-12-31'},{start:'2019-01-01',end:null}],dateKey(businessToday()));
    const one=await call('GET',`/leaves/balances?user_id=${person}&baslangic=2026-09-21&bitis=2026-09-27`,undefined,viewer);
    assert.equal(one.status,200);
    // Mon–Sun week, no shift → Mon–Fri default, minus the Wednesday holiday.
    assert.deepEqual(one.data.map(r=>[r.Hak_Edilen,r.Kidem_Yil,r.Kullanilan,r.Bekleyen,r.Kalan,r.Talep_Gun]),[[expected.Hak_Edilen,expected.Kidem_Yil,4,2,expected.Hak_Edilen-4,5]]);
    assert.ok(expected.Kidem_Yil>=8);
    const all=await call('GET','/leaves/balances',undefined,viewer);
    assert.equal(all.status,200);assert.equal(all.data.find(r=>r.User_ID===person).Kullanilan,4);assert.equal(all.data[0].Talep_Gun,undefined);
    assert.equal((await call('GET','/leaves/balances?baslangic=2026-09-21&bitis=2026-09-27')).status,400);
    assert.equal((await call('GET',`/leaves/balances?user_id=${person}&baslangic=2026-09-21`)).status,400);
    assert.equal((await call('GET','/leaves/balances?user_id=2147483647')).status,404);
    // Carry-over: 10 days on 2026-09-10; only the leave days from that date on (Thu, Fri) count.
    assert.equal((await call('PUT',`/leaves/balances/${person}`,{devir_gun:10,devir_tarihi:'2026-09-10'},viewer)).status,403);
    assert.equal((await call('PUT',`/leaves/balances/${person}`,{devir_gun:10,devir_tarihi:null})).status,400);
    assert.equal((await call('PUT',`/leaves/balances/${person}`,{devir_gun:10,devir_tarihi:'2026-09-10'})).status,200);
    const since=annualLeaveEntitlement([{start:'2010-01-01',end:'2010-12-31'},{start:'2019-01-01',end:null}],dateKey(businessToday()),'2026-09-10');
    const carried=(await call('GET',`/leaves/balances?user_id=${person}`)).data[0];
    assert.deepEqual([carried.Devir_Gun,carried.Devir_Tarihi,carried.Hak_Edilen,carried.Kullanilan,carried.Kalan],[10,'2026-09-10',since.Hak_Edilen,2,10+since.Hak_Edilen-2]);
    assert.equal((await call('PUT',`/leaves/balances/${person}`,{devir_gun:null,devir_tarihi:null})).status,200);
    assert.equal((await call('GET',`/leaves/balances?user_id=${person}`)).data[0].Kullanilan,4);
    assert.equal((await call('PUT','/leaves/balances/2147483647',{devir_gun:0,devir_tarihi:'2026-01-01'})).status,404);
    assert.equal((await sql.query("SELECT COUNT(*) AS n FROM SystemLogs WHERE Islem_Tipi='İZİN DEVRİ'")).recordset[0].n,2);
    for(const table of ['Izinler','Personel_Calisma_Gecmisi']) await q(`DELETE FROM ${table} WHERE User_ID=@uid`);
    await q('DELETE FROM Users WHERE ID=@uid');await sql.query("DELETE FROM Resmi_Tatiller WHERE Tatil_Adi='Fixture Tatil'");
  });
  await t.test('pending leave is approved or rejected once, by an admin, without overlap',async()=>{
    const person=(await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No) VALUES('Fixture Onay','"+card+"8','C"+sicil+"') RETURNING ID")).recordset[0].ID;
    const q=text=>new sql.Request().input('uid',sql.Int,person).query(text);
    // Legacy overlap written directly: a pending leave inside an approved one.
    const ids=(await q(`INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Durum) VALUES
      (@uid,'Yıllık İzin','2026-10-05','2026-10-09','Onaylandı'),(@uid,'Mazeret İzni','2026-10-07','2026-10-07','Bekliyor'),
      (@uid,'Yıllık İzin','2026-10-19','2026-10-20','Bekliyor') RETURNING ID`)).recordset.map(r=>r.ID);
    const decide=(id,body,token)=>call('PUT',`/leaves/${id}/durum`,body,token);
    assert.equal((await decide(ids[2],{durum:'Onaylandı'},viewer)).status,403);
    assert.equal((await decide(ids[2],{durum:'Bekliyor'})).status,400);
    assert.equal((await decide(2147483647,{durum:'Onaylandı'})).status,404);
    assert.equal((await decide(ids[0],{durum:'Reddedildi'})).status,409);
    assert.equal((await decide(ids[1],{durum:'Onaylandı'})).status,409);
    assert.equal((await decide(ids[1],{durum:'Reddedildi',aciklama:'Çakışıyor'})).status,200);
    assert.equal((await decide(ids[2],{durum:'Onaylandı'})).status,200);
    assert.equal((await decide(ids[2],{durum:'Reddedildi'})).status,409);
    const rows=(await q('SELECT ID,Durum FROM Izinler WHERE User_ID=@uid ORDER BY ID')).recordset.map(r=>r.Durum);
    assert.deepEqual(rows,['Onaylandı','Reddedildi','Onaylandı']);
    const logs=(await sql.query("SELECT Islem_Tipi,Detay FROM SystemLogs WHERE Islem_Tipi IN ('İZİN ONAYI','İZİN RED') ORDER BY ID")).recordset;
    assert.deepEqual(logs.map(l=>[l.Islem_Tipi,l.Detay]),[['İZİN RED','2026-10-07 - 2026-10-07: Mazeret İzni · Çakışıyor'],['İZİN ONAYI','2026-10-19 - 2026-10-20: Yıllık İzin']]);
    await q('DELETE FROM Izinler WHERE User_ID=@uid');await q('DELETE FROM Users WHERE ID=@uid');
  });
  await t.test('presence lists who entered and has not left, with meal location',async()=>{
    const ids=(await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No) VALUES('Fixture İçeride','"+card+"7','D"+sicil+"'),('Fixture Çıktı','"+card+"6','E"+sicil+"') RETURNING ID")).recordset.map(r=>r.ID);
    const doors=(await sql.query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('P Giriş','Ana Giriş'),('P Çıkış','Ana Çıkış'),('P Yemek','Yemekhane Giriş') RETURNING ID")).recordset.map(r=>r.ID);
    const log=(c,d,z)=>new sql.Request().input('c',sql.NVarChar,card+c).input('d',sql.Int,doors[d]).input('z',sql.NVarChar,z).query('INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES(@c,@d,CAST(@z AS timestamp),true)');
    await log('7',0,'2026-07-01 22:00');await log('7',2,'2026-07-02 01:30');
    await log('6',0,'2026-07-02 08:00');await log('6',1,'2026-07-02 12:00');
    const at=async q=>(await call('GET','/presence?'+q,undefined,viewer)).data.kisiler.filter(k=>ids.includes(k.User_ID)).map(k=>[k.Ad_Soyad,k.Konum,k.Son_Kapi]);
    assert.deepEqual(await at('tarih=2026-07-02&saat=10:00'),[['Fixture Çıktı','Bina içi','P Giriş'],['Fixture İçeride','Yemekhane','P Yemek']]);
    assert.deepEqual(await at('tarih=2026-07-02&saat=12:00'),[['Fixture İçeride','Yemekhane','P Yemek']]);
    // Older than 24 hours: a forgotten exit no longer counts as inside.
    assert.deepEqual(await at('tarih=2026-07-02&saat=22:01'),[]);
    assert.equal((await call('GET','/presence?saat=25:00')).status,400);
    assert.equal((await call('GET','/presence')).status,200);
    await new sql.Request().input('ids',sql.IntArray,ids).query('DELETE FROM Logs WHERE User_ID=ANY(@ids)');
    await new sql.Request().input('ids',sql.IntArray,ids).query('DELETE FROM Users WHERE ID=ANY(@ids)');
    await new sql.Request().input('ids',sql.IntArray,doors).query('DELETE FROM Doors WHERE ID=ANY(@ids)');
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
