const { parseTimeToMinutes, diffMinutes } = require('./dateHelper');
const dayMs = 86400000;
const asDate = value => new Date(value instanceof Date ? value.getTime() : `${String(value).slice(0,10)}T00:00:00Z`);
const dateKey = value => asDate(value).toISOString().slice(0,10);
const businessToday = () => require('../config/demo').enabled ? require('../config/demo').referenceDate : require('../config/business').date();
// Existing SQL DATETIME values are business wall-clock times, represented by the
// MSSQL driver as UTC Dates. Do not add the browser/server timezone a second time.
function shiftWindow(row) {
    const day = asDate(row.Tarih);
    const startMinute = parseTimeToMinutes(row.Mesai_Baslangic);
    const endMinute = parseTimeToMinutes(row.Mesai_Bitis);
    const duration = endMinute > startMinute ? endMinute-startMinute : 1440-startMinute+endMinute;
    const start = new Date(+day + startMinute*60000);
    const end = new Date(+start + duration*60000);
    // Adjacent equal shifts get non-overlapping 24h event windows.
    const boundary = new Date(+start - Math.floor((1440-duration)/2)*60000);
    return {start,end,from:boundary,to:new Date(+boundary+dayMs)};
}
function calculateAttendance(row, logs) {
    const window = shiftWindow(row);
    const events = logs.filter(l => (Object.hasOwn(l, 'User_ID') ? l.User_ID === row.User_ID : l.RFID_Kart_No === row.RFID_Kart_No) && +new Date(l.Zaman) >= +window.from && +new Date(l.Zaman) < +window.to).sort((a,b)=>+new Date(a.Zaman)-+new Date(b.Zaman));
    const first = events.find(l=>l.Kapi_Turu==='Ana Giriş');
    const last = [...events].reverse().find(l=>l.Kapi_Turu==='Ana Çıkış' && first && +new Date(l.Zaman)>=+new Date(first.Zaman));
    const holiday = !(row.Calisma_Gunleri || '1,2,3,4,5').split(',').map(Number).includes(asDate(row.Tarih).getUTCDay());
    let mealStart,breakStart,meal=0,rest=0;
    for(const e of events) {
        if(!first || +new Date(e.Zaman)<+new Date(first.Zaman) || (last && +new Date(e.Zaman)>+new Date(last.Zaman))) continue;
        if(e.Kapi_Turu==='Yemekhane Giriş') mealStart ??= e.Zaman;
        else if(e.Kapi_Turu==='Yemekhane Çıkış' && mealStart) {meal += Math.max(0,diffMinutes(mealStart,e.Zaman));mealStart=null;}
        if(e.Kapi_Turu==='Mola / Sigara Alanı') breakStart ??= e.Zaman;
        else if(breakStart) {rest+=Math.max(0,diffMinutes(breakStart,e.Zaman));breakStart=null;}
    }
    let status='Normal',late=0,early=0,computed=0;
    const leaveConflict = row.Onayli_Izin_Sayisi > 1;
    if(leaveConflict) status='İzin Çakışması';
    else if(row.Izin_Durumu) status=row.Izin_Durumu;
    else if(!row.Vardiya_Adi) status='Vardiya Yok';
    else if(!first) status=events.some(e=>e.Kapi_Turu==='Ana Çıkış')?'Giriş Yok':holiday?'Hafta Tatili':'Devamsız';
    else {
        if(holiday) {status=last?'Tatil Mesaisi':'Tatil Mesaisi / Çıkış Yok';if(last) computed=Math.max(0,diffMinutes(first.Zaman,last.Zaman)-meal-rest);}
        else {
            const delay=diffMinutes(window.start,first.Zaman);
            if(delay>(row.Tolerans_Dk||0)) {late=delay;status='Geç Kaldı';}
            if(last) {early=Math.max(0,diffMinutes(last.Zaman,window.end));computed=Math.max(0,diffMinutes(window.end,last.Zaman));if(early) status=late?'Geç Kaldı / Erken Çıktı':'Erken Çıktı';}
            else status=late?'Geç Kaldı / Çıkış Yok':'Çıkış Yok';
        }
    }
    const excess=Math.max(0,rest-(row.Mola_Hakki_Dk||0));
    if(excess && first && !row.Izin_Durumu && !leaveConflict) status=status==='Normal'?'Mola Aşımı':status+' / Mola Aşımı';
    return {...row,Izin_Cakismasi:leaveConflict,TarihStr:dateKey(row.Tarih),Ilk_Giris:first?.Zaman||null,Son_Cikis:last?.Zaman||null,Durum:status,Gec_Kalma_Dk:late,Erken_Cikma_Dk:early,Hesaplanan_Dk:computed,Fazla_Mesai_Dk:row.Mesai_Durumu==='Onaylandı'?(row.Onaylanan_Dk??0):0,Mesai_Durumu:row.Mesai_Durumu||'Bekliyor',Onaylanan_Dk:row.Onaylanan_Dk??0,Acik_Yemek:!!mealStart,Acik_Mola:!!breakStart,Toplam_Yemek_Dk:meal,Toplam_Mola_Dk:rest,Mola_Asimi_Dk:excess};
}
module.exports={calculateAttendance,shiftWindow,businessToday,dateKey};
