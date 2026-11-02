const test=require('node:test');const assert=require('node:assert/strict');
const {annualLeaveEntitlement}=require('../utils/annualLeave');
const one=(start,today,end=null)=>annualLeaveEntitlement([{start,end}],today);
test('no leave before the first completed year',()=>{
 const r=one('2025-11-03','2026-11-02');
 assert.deepEqual([r.Kidem_Yil,r.Hak_Edilen,r.Sonraki_Hak_Tarihi,r.Sonraki_Hak_Gun],[0,0,'2026-11-03',14]);
});
test('earned on the anniversary, 14 days up to year five',()=>{
 assert.deepEqual([one('2025-11-02','2026-11-02').Hak_Edilen,one('2021-11-02','2026-11-02').Hak_Edilen],[14,70]);
});
test('20 days for years 6–14, 26 from year 15',()=>{
 assert.equal(one('2020-11-02','2026-11-02').Hak_Edilen,5*14+20);
 const r=one('2011-11-02','2026-11-02');
 assert.equal(r.Kidem_Yil,15);assert.equal(r.Hak_Edilen,5*14+9*20+26);assert.equal(r.Sonraki_Hak_Gun,26);
});
test('previous periods with the same employer are added up',()=>{
 // 200 + 166 = 366 days → one completed year.
 const r=annualLeaveEntitlement([{start:'2023-01-01',end:'2023-07-19'},{start:'2026-05-20',end:null}],'2026-11-01');
 assert.equal(r.Kidem_Gun,366);assert.equal(r.Kidem_Yil,1);assert.equal(r.Hak_Edilen,14);
});
test('future, empty and ended periods',()=>{
 assert.equal(one('2027-01-01','2026-11-02').Kidem_Gun,0);
 assert.equal(annualLeaveEntitlement([],'2026-11-02').Hak_Edilen,0);
 assert.equal(one('2020-01-01','2026-11-02','2021-12-31').Kidem_Yil,2);
});
test('carry-over date counts only anniversaries on or after it',()=>{
 const periods=[{start:'2011-11-02',end:null}];
 assert.equal(annualLeaveEntitlement(periods,'2026-11-02','2025-11-01').Hak_Edilen,20+26);
 assert.equal(annualLeaveEntitlement(periods,'2026-11-02','2026-11-02').Hak_Edilen,26);
 assert.equal(annualLeaveEntitlement(periods,'2026-11-02','2026-11-03').Hak_Edilen,0);
 assert.equal(annualLeaveEntitlement(periods,'2026-11-02','2024-11-02').Hak_Edilen,20+20+26);
});
