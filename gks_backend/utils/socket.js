const jwt=require('jsonwebtoken');
const {sql}=require('../db');
const logger=require('./appLogger');
let io;
async function currentAccount(decoded) {
 const result=await new sql.Request().input('id',sql.Int,decoded.id).query('SELECT Rol,Token_Version FROM Yoneticiler WHERE ID=@id');
 const user=result.recordset[0];
 return !!user&&user.Rol===decoded.role&&user.Token_Version===(decoded.version??0)&&decoded.exp*1000>Date.now();
}
module.exports={
 init(server) {
  io=new (require('socket.io').Server)(server,{cors:{origin:(process.env.FRONTEND_URL||'http://localhost:5173').split(',').map(s=>s.trim())}});
  io.use(async(client,next)=>{
   try {
    const decoded=jwt.verify(client.handshake.auth?.token,process.env.JWT_SECRET);
    if(!await currentAccount(decoded)) throw new Error('Revoked');
    client.user=decoded;next();
   }catch {next(new Error('Oturum geçersiz. Lütfen yeniden giriş yapın.'));}
  });
  io.on('connection',client=>{
   const expiry=setTimeout(()=>client.disconnect(true),Math.max(0,client.user.exp*1000-Date.now()));expiry.unref();
   const check=setInterval(async()=>{try{if(!await currentAccount(client.user))client.disconnect(true);}catch{client.disconnect(true);}},30000);check.unref();
   client.on('disconnect',()=>{clearTimeout(expiry);clearInterval(check);});
   logger.info('Canlı bağlantı kuruldu.');
  });return io;
 },
 getIO(){if(!io)throw new Error('Socket.io henüz başlatılmadı.');return io;}
};
