require('dotenv').config({quiet:true});
const express=require('express');
const cors=require('cors');
const http=require('http');
const {connectDB,sql}=require('./db');
const socket=require('./utils/socket');
const logger=require('./utils/appLogger');
const {verifyToken}=require('./middlewares/auth');
const app=express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY_HOPS) app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS));
const origin=(process.env.FRONTEND_URL||'http://localhost:5173').split(',').map(s=>s.trim());
app.use(cors({origin}));
app.use(express.json({limit:'256kb'}));
const demo = require('./config/demo');
app.use('/api', require('./middlewares/demo'));
if (demo.enabled) app.use('/api', require('express-rate-limit').rateLimit({ windowMs: 60000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Çok fazla istek. Bir dakika sonra tekrar deneyin.' } }));
app.use('/api', require('./routes/demoRoutes'));
app.get('/api/status',async(req,res)=>{
    try {await sql.query('SELECT 1 AS ready');res.json({success:true,durum:'Başarılı'});}
    catch {res.status(503).json({success:false,message:'Veritabanına erişilemiyor.'});}
});
app.get('/api/features',verifyToken,(req,res)=>res.json({simulation:!demo.enabled&&process.env.NODE_ENV!=='production'&&process.env.ENABLE_SIMULATION==='true'}));
app.use('/api',require('./routes/authRoutes'));
for(const name of ['dashboard','user','door','shift','report','leave','overtime']) app.use('/api',require(`./routes/${name}Routes`));
if(!demo.enabled&&process.env.NODE_ENV!=='production'&&process.env.ENABLE_SIMULATION==='true') app.use('/api',require('./routes/seederRoutes'));
if(process.env.NODE_ENV!=='production') {
    const swagger=require('swagger-ui-express');
    app.use('/api-docs',swagger.serve,swagger.setup(require('./utils/swagger')));
}
app.use((req,res)=>res.status(404).json({success:false,message:'İstenen işlem bulunamadı.'}));
app.use(require('./middlewares/errorHandler'));
const server=http.createServer(app);
async function start() {
    if(process.env.NODE_ENV==='production' && (!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)) throw new Error('Üretimde JWT_SECRET en az 32 karakter olmalıdır.');
    await connectDB();
    if (process.env.NODE_ENV === 'production') {
        const admins = (await sql.query("SELECT Sifre_Hash FROM Yoneticiler WHERE Rol='admin'")).recordset;
        for (const admin of admins) if (await require('bcrypt').compare('admin', admin.Sifre_Hash)) throw new Error('Üretime çıkmadan önce varsayılan yönetici şifresini değiştirin.');
    }
    socket.init(server);
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',resolve);});
    logger.info(`GKS ${process.env.PORT||3000} portunda hazır.`);
}
async function shutdown() {
    const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();
    socket.getIO().close();
    server.close(async()=>{await sql.close();clearTimeout(deadline);process.exit(0);});
}
if(require.main===module) {start().catch(e=>{logger.error(e.message);process.exit(1);});process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);}
module.exports={app,start,server};
