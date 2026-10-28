require('dotenv').config({quiet:true});
const pg=require('pg');
const {connectionConfig}=require('../db');
const {assertDatabaseName,createDatabase,databaseExists}=require('../db/admin');
// Creates an empty database; an existing database is left untouched.
(async()=>{
 const name=assertDatabaseName(process.env.DB_NAME);
 const client=new pg.Client(connectionConfig('postgres'));
 await client.connect();
 try {
  if(await databaseExists(client,name)) console.log('Veritabanı mevcut; değişiklik yapılmadı.');
  else {await createDatabase(client,name);console.log('Boş veritabanı oluşturuldu.');}
 } finally { await client.end(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
