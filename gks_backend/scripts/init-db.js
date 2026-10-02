require('dotenv').config({quiet:true});
const {sql}=require('../db');
(async()=>{
 const name=process.env.DB_NAME;
 if(!/^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(name||''))throw new Error('Geçerli DB_NAME gerekli.');
 const pool=await sql.connect({server:process.env.DB_SERVER,port:Number(process.env.DB_PORT||1433),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'master',options:{encrypt:process.env.NODE_ENV==='production'||process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.NODE_ENV!=='production'&&process.env.DB_TRUST_SERVER_CERTIFICATE==='true'}});
 const exists=await pool.request().input('name',sql.NVarChar,name).query('SELECT DB_ID(@name) AS id');
 if(exists.recordset[0].id) console.log('Veritabanı mevcut; değişiklik yapılmadı.');
 else {await pool.request().query(`CREATE DATABASE [${name}]`);console.log('Boş veritabanı oluşturuldu.');}
 await pool.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>sql.close());
