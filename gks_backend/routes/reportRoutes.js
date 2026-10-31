const router=require('express').Router();
const {verifyToken}=require('../middlewares/auth');
const {attendance}=require('../services/attendance');
const {businessToday}=require('../utils/attendance');
const {periodRange,summarize}=require('../utils/attendanceSummary');
const {validateQuery,reportQuery,periodReportQuery}=require('../middlewares/query');
router.get('/reports/daily-attendance',verifyToken,validateQuery(reportQuery),async(req,res,next)=>{
    try {const day=req.validatedQuery.tarih??businessToday();res.json(await attendance(day,day));} catch(e){next(e);}
});
router.get('/reports/attendance',verifyToken,validateQuery(periodReportQuery),async(req,res,next)=>{
    try {
        const q=req.validatedQuery;const range=periodRange(q);
        const gunler=await attendance(range.baslangic,range.bitis,{userIds:['kisi','secili'].includes(q.kapsam)?q.personel:undefined,departman:q.kapsam==='departman'?q.departman:undefined});
        res.json({...range,gunler,...summarize(gunler)});
    } catch(e){next(e);}
});
module.exports=router;
