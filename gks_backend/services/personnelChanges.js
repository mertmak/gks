const {sql}=require('../db');
const {httpError}=require('../utils/transaction');
const {businessToday,dateKey}=require('../utils/attendance');
async function changePersonnel({kind,userId,target,value,actor}) {
 const tx=new sql.Transaction();await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try {
  const select=new sql.Request(tx);
  let where='1=1';
  if(userId) {select.input('uid',sql.Int,userId);where='ID=@uid';}
  else {
   if(kind==='status') {select.input('current',sql.Bit,value.durum===0?1:0);where='Durum=@current';} else where='Durum=1';
   if(target.hedef_turu!=='Tumu') {select.input('target',sql.NVarChar,target.hedef_deger);where+=target.hedef_turu==='Sirket'?' AND Sirket=@target':' AND Departman=@target';}
  }
  const users=(await select.query(`SELECT ID,Ad_Soyad,Sicil_No,Durum,Ise_Giris_Tarihi,Isten_Cikis_Tarihi,Cikis_Nedeni FROM Users WITH(UPDLOCK,HOLDLOCK) WHERE ${where} ORDER BY ID`)).recordset;
  if(!users.length) {const e=new Error('Eşleşen personel bulunamadı.');e.status=404;throw e;}
  if(kind==='shift' && value.vardiya_id) {
   const found=await new sql.Request(tx).input('id',sql.Int,value.vardiya_id).query('SELECT ID FROM Vardiyalar WHERE ID=@id AND Durum=1');
   if(!found.recordset.length) {const e=new Error('Aktif bir vardiya seçiniz.');e.status=400;throw e;}
  }
  if(kind==='doors') for(const id of value.doorIds) {
   const found=await new sql.Request(tx).input('id',sql.Int,id).query('SELECT ID FROM Doors WHERE ID=@id AND Durum=1');
   if(!found.recordset.length) {const e=new Error('Seçilen kapılardan biri aktif değil.');e.status=400;throw e;}
  }
  let changed=0;
  for(const user of users) {
   const req=new sql.Request(tx);req.input('id',sql.Int,user.ID);
   if(kind==='shift') {
    req.input('today',sql.Date,businessToday());req.input('vid',sql.Int,value.vardiya_id??null);
    await req.query(`DELETE FROM Personel_Vardiya WHERE User_ID=@id AND Baslangic_Tarihi=@today;
      UPDATE Personel_Vardiya SET Bitis_Tarihi=DATEADD(day,-1,@today) WHERE User_ID=@id AND Baslangic_Tarihi<@today AND (Bitis_Tarihi IS NULL OR Bitis_Tarihi>=@today);
      IF @vid IS NOT NULL INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) VALUES(@id,@vid,@today);`);
   } else if(kind==='doors') {
    await req.query('DELETE FROM Permissions WHERE User_ID=@id');
    for(const door of value.doorIds) await new sql.Request(tx).input('uid',sql.Int,user.ID).input('door',sql.Int,door).query('INSERT INTO Permissions(User_ID,Door_ID) VALUES(@uid,@door)');
   } else {
    if(Number(user.Durum) === value.durum) continue;
    const today=businessToday();
    const start=user.Ise_Giris_Tarihi ? dateKey(user.Ise_Giris_Tarihi) : null;
    const end=user.Isten_Cikis_Tarihi ? dateKey(user.Isten_Cikis_Tarihi) : null;
    req.input('today',sql.Date,today);
    if(value.durum===0) {
      if((start && value.cikis_tarihi<start) || value.cikis_tarihi>today) throw httpError(400,'Çıkış tarihi mevcut işe giriş ile bugün arasında olmalıdır.');
    } else if(end && end<today) {
      await req.query(`INSERT INTO Personel_Calisma_Gecmisi(User_ID,Baslangic_Tarihi,Bitis_Tarihi,Cikis_Nedeni)
        SELECT ID,Ise_Giris_Tarihi,Isten_Cikis_Tarihi,Cikis_Nedeni FROM Users WHERE ID=@id;
        UPDATE Users SET Ise_Giris_Tarihi=@today WHERE ID=@id;`);
    } else if(end && end>today) {
      throw httpError(409,'Gelecek tarihli çıkış kaydı yeniden aktifleştirilemez.');
    } else if(!end) {
      await req.query('UPDATE Users SET Ise_Giris_Tarihi=@today WHERE ID=@id');
    }
    // Reopening on the exit day reverses that day's exit, with no artificial gap.
    req.input('active',sql.Bit,value.durum);req.input('exit',sql.Date,value.durum===0?value.cikis_tarihi:null);req.input('reason',sql.NVarChar,value.durum===0?value.cikis_nedeni:null);
    await req.query('UPDATE Users SET Durum=@active,Isten_Cikis_Tarihi=@exit,Cikis_Nedeni=@reason WHERE ID=@id');
   }
   changed++;
   await new sql.Request(tx).input('actor',sql.NVarChar,actor).input('kind',sql.NVarChar,{shift:'VARDİYA GÜNCELLEME',doors:'YETKİ GÜNCELLEME',status:'PERSONEL DURUMU'}[kind]).input('name',sql.NVarChar,user.Ad_Soyad).input('sicil',sql.NVarChar,user.Sicil_No||'').input('detail',sql.NVarChar,JSON.stringify(value)).query('INSERT INTO SystemLogs(Islemi_Yapan,Islem_Tipi,Personel_Ad,Sicil_No,Detay) VALUES(@actor,@kind,@name,@sicil,@detail)');
  }
  await tx.commit();return changed;
 } catch(e){await tx.rollback();throw e;}
}
module.exports={changePersonnel};
