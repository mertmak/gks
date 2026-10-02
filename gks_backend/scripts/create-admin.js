require('dotenv').config({quiet:true});
const {connectDB,sql}=require('../db');const {schemas}=require('../middlewares/validate');
(async()=>{
 const data=schemas.ilkKurulumSchema.parse({username:process.env.BOOTSTRAP_USERNAME,password:process.env.BOOTSTRAP_PASSWORD});
 const hash=await require('bcrypt').hash(data.password,12);
 await connectDB();const tx=new sql.Transaction();await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try {
  const req=new sql.Request(tx);const exists=await req.query('SELECT COUNT(*) AS count FROM Yoneticiler WITH(UPDLOCK,HOLDLOCK)');
  if(exists.recordset[0].count) throw new Error('Hesap mevcut; kurulum kapalı.');
  req.input('user',sql.VarChar,data.username);req.input('hash',sql.VarChar,hash);
  await req.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES(@user,@hash,'admin')");await require('../utils/logger').addSystemLog('CLI Kurulum','İLK KURULUM',data.username,'','İlk yönetici hesabı oluşturuldu.',tx);await tx.commit();console.log('İlk yönetici oluşturuldu.');
 }catch(e){await tx.rollback();throw e;}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>sql.close());
