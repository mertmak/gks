const {addSystemLog}=require('../utils/logger');
const router=require('express').Router();
const {sql}=require('../db');
const {inTransaction,httpError}=require('../utils/transaction');
const {verifyToken,verifyAdmin}=require('../middlewares/auth');
const {validate,schemas}=require('../middlewares/validate');
const {attendance}=require('../services/attendance');
const socket=require('../utils/socket');
const {validateQuery,overtimeQuery}=require('../middlewares/query');
router.get('/overtimes',verifyToken,validateQuery(overtimeQuery),async(req,res,next)=>{
    try {res.json((await attendance(req.validatedQuery.baslangic,req.validatedQuery.bitis)).filter(row=>row.Hesaplanan_Dk>0||row.Mesai_Islem_Zamani||row.Izin_Cakismasi));} catch(e){next(e);}
});
async function approve(items,durum,aciklama,actor) {
    const keys=items.map(item=>`${item.user_id}:${item.tarih}`);
    if(new Set(keys).size!==keys.length) {
        const error=new Error('Aynı personel ve gün birden fazla gönderilemez.');error.statusCode=400;throw error;
    }
    // Consistent order and SERIALIZABLE protect concurrent insert/update approvals.
    await inTransaction(async transaction => {
        for(const item of [...items].sort((a,b)=>a.user_id-b.user_id||a.tarih.localeCompare(b.tarih))) {
            // Lock the person before reading its report/decision to avoid shared-lock
            // conversion deadlocks when two administrators decide the same day.
            await new sql.Request(transaction).input('uid',sql.Int,item.user_id)
                .query('SELECT ID FROM Users WITH (UPDLOCK,HOLDLOCK) WHERE ID=@uid');
            const [row]=await attendance(item.tarih,item.tarih,{transaction,userId:item.user_id});
            if(!row) {const error=new Error('Personel bu tarihte rapor kapsamında bulunamadı.');error.statusCode=404;throw error;}
            if(row.Izin_Cakismasi) throw httpError(409, `${row.Sicil_No} sicilli personelin ${item.tarih} gününde birden fazla onaylı izni var. Önce İzinler ekranındaki çakışmayı düzeltin.`);
            const computed=row.Hesaplanan_Dk;
            if(durum==='Onaylandı' && item.onaylanan_dk>Math.min(2880,computed+120)) {
                const error=new Error(`Onaylanan süre 0–${Math.min(2880,computed+120)} dakika arasında olmalıdır. Güncel hesaplanan süre: ${computed} dakika.`);
                error.statusCode=400;throw error;
            }
            const req=new sql.Request(transaction);
            req.input('uid',sql.Int,item.user_id);req.input('day',sql.Date,item.tarih);
            req.input('computed',sql.Int,computed);req.input('approved',sql.Int,durum==='Onaylandı'?item.onaylanan_dk:0);
            req.input('status',sql.NVarChar,durum);req.input('note',sql.NVarChar,aciklama);req.input('actor',sql.NVarChar,actor);
            await req.query(`IF NOT EXISTS(SELECT 1 FROM Users WHERE ID=@uid) THROW 50001,N'Personel bulunamadı.',1;
              UPDATE Mesai_Onaylari WITH (UPDLOCK,HOLDLOCK) SET Hesaplanan_Dk=@computed,Onaylanan_Dk=@approved,Durum=@status,Aciklama=@note,Islemi_Yapan=@actor,Islem_Zamani=GETDATE() WHERE User_ID=@uid AND Tarih=@day;
              IF @@ROWCOUNT=0 INSERT INTO Mesai_Onaylari(User_ID,Tarih,Hesaplanan_Dk,Onaylanan_Dk,Durum,Aciklama,Islemi_Yapan) VALUES(@uid,@day,@computed,@approved,@status,@note,@actor);`);
            await addSystemLog(actor,'MESAİ KARARI',row.Ad_Soyad,row.Sicil_No,
                JSON.stringify({user_id:item.user_id,tarih:item.tarih,onceki_durum:row.Mesai_Durumu,onceki_onaylanan_dk:row.Onaylanan_Dk,durum,hesaplanan_dk:computed,onaylanan_dk:durum==='Onaylandı'?item.onaylanan_dk:0,aciklama}),transaction);
        }
    });
    socket.getIO().emit('overtimes_updated');
    socket.getIO().emit('new_system_log');
}
router.post('/overtimes/approve',verifyToken,verifyAdmin,validate(schemas.mesaiOnaySchema),async(req,res,next)=>{
    try {await approve([req.body],req.body.durum,req.body.aciklama,req.user.kullanici_adi);res.json({success:true,message:'Mesai kaydedildi.'});}catch(e){next(e);}
});
router.post('/overtimes/approve-bulk',verifyToken,verifyAdmin,validate(schemas.mesaiBulkOnaySchema),async(req,res,next)=>{
    try {await approve(req.body.mesailer,req.body.durum,req.body.aciklama,req.user.kullanici_adi);res.json({success:true,message:'Toplu mesai işlemi kaydedildi.'});}catch(e){next(e);}
});
module.exports=router;
