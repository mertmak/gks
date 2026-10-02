const router=require('express').Router();
const {verifyToken}=require('../middlewares/auth');
const {attendance}=require('../services/attendance');
const {businessToday}=require('../utils/attendance');
const {validateQuery,reportQuery}=require('../middlewares/query');
router.get('/reports/daily-attendance',verifyToken,validateQuery(reportQuery),async(req,res,next)=>{
    try {const day=req.validatedQuery.tarih??businessToday();res.json(await attendance(day,day));} catch(e){next(e);}
});
module.exports=router;
