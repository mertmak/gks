require('dotenv').config({quiet:true});
const {connectDB,sql}=require('../db');
(async()=>{await connectDB();console.log(await require('../services/demoSeed').seedDemo());})()
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.close());
