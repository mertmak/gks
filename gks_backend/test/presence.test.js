const test=require('node:test');const assert=require('node:assert/strict');
const {presence}=require('../utils/presence');
const ev=(User_ID,Kapi_Turu,Zaman)=>({User_ID,Kapi_Turu,Zaman,Kapi_Adi:Kapi_Turu});
test('entry without exit is inside; exit removes',()=>{
 const p=presence([ev(1,'Ana Giriş','08:00'),ev(2,'Ana Giriş','08:05'),ev(2,'Ana Çıkış','17:00'),ev(3,'İç Geçiş','09:00')]);
 assert.deepEqual([...p.keys()],[1]);assert.equal(p.get(1).Konum,'Bina içi');assert.equal(p.get(1).Giris_Zamani,'08:00');
});
test('meal and break locations',()=>{
 const p=presence([ev(1,'Ana Giriş','08:00'),ev(1,'Yemekhane Giriş','12:00'),ev(1,'İç Geçiş','12:10'),
  ev(2,'Ana Giriş','08:00'),ev(2,'Mola / Sigara Alanı','10:00'),ev(3,'Ana Giriş','08:00'),ev(3,'Mola / Sigara Alanı','10:00'),ev(3,'İç Geçiş','10:15'),
  ev(4,'Ana Giriş','08:00'),ev(4,'Yemekhane Giriş','12:00'),ev(4,'Yemekhane Çıkış','12:30')]);
 assert.deepEqual([1,2,3,4].map(id=>p.get(id).Konum),['Yemekhane','Mola alanı','Bina içi','Bina içi']);
 assert.equal(p.get(1).Son_Okutma,'12:10');
});
test('re-entry after exit starts a new stay',()=>{
 const p=presence([ev(1,'Ana Giriş','08:00'),ev(1,'Yemekhane Giriş','12:00'),ev(1,'Ana Çıkış','12:05'),ev(1,'Ana Giriş','13:00')]);
 assert.deepEqual([p.get(1).Giris_Zamani,p.get(1).Konum],['13:00','Bina içi']);
});
