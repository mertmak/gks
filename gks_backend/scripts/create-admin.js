require('dotenv').config({quiet:true});
const {connectDB,sql}=require('../db');const {schemas}=require('../middlewares/validate');
const {inTransaction,advisoryLock}=require('../utils/transaction');const locks=require('../db/locks');
(async()=>{
 const data=schemas.ilkKurulumSchema.parse({username:process.env.BOOTSTRAP_USERNAME,password:process.env.BOOTSTRAP_PASSWORD});
 const hash=await require('bcrypt').hash(data.password,12);
 await connectDB();
 await inTransaction(async tx=>{
  await advisoryLock(tx,locks.panelAccounts);
  const req=new sql.Request(tx);
  const exists=await req.query('SELECT COUNT(*) AS count FROM Yoneticiler');
  if(exists.recordset[0].count) throw new Error('Hesap mevcut; kurulum kapalı.');
  req.input('user',sql.VarChar,data.username);req.input('hash',sql.VarChar,hash);
  await req.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES(@user,@hash,'admin')");await require('../utils/logger').addSystemLog('CLI Kurulum','İLK KURULUM',data.username,'','İlk yönetici hesabı oluşturuldu.',tx);
 });
 console.log('İlk yönetici oluşturuldu.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>sql.close());
