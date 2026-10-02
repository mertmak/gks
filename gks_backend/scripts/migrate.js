require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {connectDB,sql}=require('../db');
const locks=require('../db/locks');
// Each file runs in its own transaction under one advisory lock, so parallel
// runs apply a migration once. Applied files must never change (checksum).
async function locked(work) {
 const tx=new sql.Transaction();await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
 try {
  const client=tx.activeClient();
  await client.query('SELECT pg_advisory_xact_lock($1)',[locks.migrations]);
  const result=await work(client);await tx.commit();return result;
 }catch(e){if(tx.client)await tx.rollback().catch(()=>{});throw e;}
}
(async()=>{
 await connectDB();
 await locked(client=>client.query("CREATE TABLE IF NOT EXISTS GksMigrations(Name varchar(200) NOT NULL PRIMARY KEY,Checksum char(64) NOT NULL,AppliedAt timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'))"));
 const root=path.resolve(__dirname,'../../database/migrations');
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.sql')).sort()) {
  const text=fs.readFileSync(path.join(root,name),'utf8');
  const checksum=crypto.createHash('sha256').update(text).digest('hex');
  await locked(async client=>{
   const exists=(await client.query('SELECT Checksum FROM GksMigrations WHERE Name=$1',[name])).rows[0];
   if(exists) {
    if(exists.checksum!==checksum) throw new Error(`Uygulanmış migration değiştirilmiş: ${name}`);
    console.log('Already applied:',name);
    return;
   }
   await client.query(text);
   await client.query('INSERT INTO GksMigrations(Name,Checksum) VALUES($1,$2)',[name,checksum]);
   console.log('Applied:',name);
  });
 }
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;}).finally(()=>sql.close());
