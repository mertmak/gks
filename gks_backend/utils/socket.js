const jwt=require('jsonwebtoken');
const {sql}=require('../db');
const logger=require('./appLogger');
const {currentSchema}=require('../db/context');
let io;
// Each personal simulation copy has its own room; everyone else shares 'ana'.
const room=schema=>schema?'sbx:'+schema:'ana';
async function currentAccount(decoded) {
 if(decoded.sandbox) return decoded.exp*1000>Date.now()&&await require('../services/sandbox').isActive(decoded.sandbox);
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
   client.join(room(client.user.sandbox));
   logger.info('Canlı bağlantı kuruldu.');
  });return io;
 },
 // Emits reach only the room of the current request's data (see db/context.js).
 getIO(){if(!io)throw new Error('Socket.io henüz başlatılmadı.');return io.to(room(currentSchema()));},
 close(){io?.close();}
};
