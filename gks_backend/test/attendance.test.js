const test=require('node:test');const assert=require('node:assert/strict');
const {calculateAttendance}=require('../utils/attendance');
const {validate,schemas}=require('../middlewares/validate');
const row={Tarih:'2026-09-07',RFID_Kart_No:'fixture',Vardiya_Adi:'Day',Mesai_Baslangic:'09:00',Mesai_Bitis:'18:00',Calisma_Gunleri:'1,2,3,4,5',Tolerans_Dk:10,Mola_Hakki_Dk:30};
const event=(type,date)=>({RFID_Kart_No:'fixture',Kapi_Turu:type,Zaman:date});
test('approved zero never falls back to computed overtime',()=>{
 const result=calculateAttendance({...row,Mesai_Durumu:'Onaylandı',Onaylanan_Dk:0},[event('Ana Giriş','2026-09-07T09:00:00Z'),event('Ana Çıkış','2026-09-07T19:00:00Z')]);
 assert.equal(result.Hesaplanan_Dk,60);assert.equal(result.Fazla_Mesai_Dk,0);
});
test('overnight shift matches next day exit and excludes next shift',()=>{
 const result=calculateAttendance({...row,Mesai_Baslangic:'22:00',Mesai_Bitis:'06:00'},[event('Ana Giriş','2026-09-07T22:00:00Z'),event('Ana Çıkış','2026-09-08T06:30:00Z'),event('Ana Giriş','2026-09-08T22:00:00Z')]);
 assert.equal(result.Durum,'Normal');assert.equal(result.Hesaplanan_Dk,30);assert.equal(result.Erken_Cikma_Dk,0);
});
test('midnight is a valid shift end',()=>{
 const result=calculateAttendance({...row,Mesai_Baslangic:'16:00',Mesai_Bitis:'00:00'},[event('Ana Giriş','2026-09-07T16:00:00Z'),event('Ana Çıkış','2026-09-08T00:00:00Z')]);
 assert.equal(result.Durum,'Normal');assert.equal(result.Hesaplanan_Dk,0);
});
test('unordered break logs are sorted and deducted from holiday work',()=>{
 const result=calculateAttendance({...row,Tarih:'2026-09-06'},[event('Ana Çıkış','2026-09-06T18:00:00Z'),event('Yemekhane Çıkış','2026-09-06T14:00:00Z'),event('Ana Giriş','2026-09-06T09:00:00Z'),event('Yemekhane Giriş','2026-09-06T13:00:00Z')]);
 assert.equal(result.Hesaplanan_Dk,480);assert.equal(result.Toplam_Yemek_Dk,60);
});
test('invalid body returns 400 instead of crashing on Zod errors',()=>{
 let status;let body;validate(schemas.loginSchema)({body:{}},{status(n){status=n;return this;},json(v){body=v;}},()=>assert.fail());assert.equal(status,400);assert.equal(body.success,false);
});
test('HTML form values normalize to numbers and nullable meal times',()=>{
 const result=schemas.vardiyaSchema.parse({vardiya_adi:'Day',mesai_baslangic:'09:00',mesai_bitis:'18:00',yemek_baslangic:'',yemek_bitis:'',tolerans_dk:'10',mola_hakki_dk:'30'});
 assert.equal(result.tolerans_dk,10);assert.equal(result.yemek_baslangic,null);
 assert.equal(schemas.bulkShiftSchema.parse({hedef_turu:'Tumu',vardiya_id:''}).vardiya_id,null);
});
test('invalid calendar dates, reversed ranges and unspecified targets rejected',()=>{
 assert.equal(schemas.izinEkleSchema.safeParse({user_id:1,izin_turu:'İzin',baslangic:'2026-02-30',bitis:'2026-03-01'}).success,false);
 assert.equal(schemas.izinEkleSchema.safeParse({user_id:1,izin_turu:'İzin',baslangic:'2026-03-02',bitis:'2026-03-01'}).success,false);
 assert.equal(schemas.bulkShiftSchema.safeParse({hedef_turu:'Departman',vardiya_id:'1'}).success,false);
 assert.equal(schemas.personelDoorsSchema.safeParse({doorIds:[1,1]}).success,false);
});
test('tolerance applies to the full delay and early exit has no tolerance',()=>{
 for(const [minute,late] of [[9,0],[10,0],[11,11]]) {
  const result=calculateAttendance(row,[event('Ana Giriş',`2026-09-07T09:${String(minute).padStart(2,'0')}:00Z`),event('Ana Çıkış','2026-09-07T17:59:00Z')]);
  assert.equal(result.Gec_Kalma_Dk,late);assert.equal(result.Erken_Cikma_Dk,1);
 }
});
test('absence, missing checkout, leave and holiday remain distinct',()=>{
 assert.equal(calculateAttendance(row,[]).Durum,'Devamsız');
 assert.equal(calculateAttendance(row,[event('Ana Çıkış','2026-09-07T18:00:00Z')]).Durum,'Giriş Yok');
 assert.equal(calculateAttendance(row,[event('Ana Giriş','2026-09-07T09:00:00Z')]).Durum,'Çıkış Yok');
 assert.equal(calculateAttendance({...row,Izin_Durumu:'Yıllık İzin'},[]).Durum,'Yıllık İzin');
 assert.equal(calculateAttendance({...row,Tarih:'2026-09-06'},[]).Durum,'Hafta Tatili');
});
test('open meal is reported without inventing duration and breaks include excess',()=>{
 const result=calculateAttendance(row,[event('Ana Giriş','2026-09-07T09:00:00Z'),event('Mola / Sigara Alanı','2026-09-07T10:00:00Z'),event('İç Geçiş','2026-09-07T10:40:00Z'),event('Yemekhane Giriş','2026-09-07T13:00:00Z'),event('Ana Çıkış','2026-09-07T18:00:00Z')]);
 assert.equal(result.Toplam_Mola_Dk,40);assert.equal(result.Mola_Asimi_Dk,10);assert.equal(result.Toplam_Yemek_Dk,0);assert.equal(result.Acik_Yemek,true);
});
