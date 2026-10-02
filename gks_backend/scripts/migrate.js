require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');
const {connectDB,sql}=require('../db');
(async()=>{
 await connectDB();
 await sql.query("IF OBJECT_ID('dbo.GksMigrations','U') IS NULL CREATE TABLE dbo.GksMigrations(Name nvarchar(200) NOT NULL PRIMARY KEY,AppliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())");
 const root=path.resolve(__dirname,'../../database/migrations');
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.sql')).sort()) {
  const tx=new sql.Transaction();await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
   const request=new sql.Request(tx);request.input('name',sql.NVarChar,name);
   const exists=await request.query('SELECT Name FROM dbo.GksMigrations WITH (UPDLOCK,HOLDLOCK) WHERE Name=@name');
   if(!exists.recordset.length) {
    await new sql.Request(tx).batch(fs.readFileSync(path.join(root,name),'utf8'));
    await request.query('INSERT INTO dbo.GksMigrations(Name) VALUES(@name)');
    console.log('Applied:',name);
   } else console.log('Already applied:',name);
   await tx.commit();
  }catch(e){await tx.rollback();throw e;}
 }
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;}).finally(()=>sql.close());
