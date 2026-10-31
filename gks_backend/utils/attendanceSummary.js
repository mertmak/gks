const { diffMinutes } = require('./dateHelper');
const day = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0,10);

// hafta = Monday–Sunday and ay = calendar month around `baslangic`; ozel keeps the given range.
function periodRange({donem,baslangic,bitis}) {
    const start = Date.parse(`${baslangic}T00:00:00Z`);
    if(donem==='hafta') {const monday=start-((new Date(start).getUTCDay()+6)%7)*day;return {baslangic:iso(monday),bitis:iso(monday+6*day)};}
    if(donem==='ay') {const d=new Date(start);return {baslangic:iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)),bitis:iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0))};}
    return {baslangic,bitis};
}

const fields = ['Gun','Calisilan_Gun','Devamsiz_Gun','Izinli_Gun','Hafta_Tatili','Gec_Kalma_Sayisi','Gec_Kalma_Dk','Erken_Cikma_Dk','Calisma_Dk','Fazla_Mesai_Dk','Yemek_Dk','Mola_Dk','Mola_Asimi_Dk'];
const empty = () => Object.fromEntries(fields.map(f=>[f,0]));
function add(total,row) {
    total.Gun++;
    if(row.Ilk_Giris) total.Calisilan_Gun++;
    if(row.Durum==='Devamsız') total.Devamsiz_Gun++;
    if(row.Izin_Durumu && !row.Izin_Cakismasi) total.Izinli_Gun++;
    if(row.Durum==='Hafta Tatili') total.Hafta_Tatili++;
    if(row.Gec_Kalma_Dk>0) total.Gec_Kalma_Sayisi++;
    total.Gec_Kalma_Dk+=row.Gec_Kalma_Dk;
    total.Erken_Cikma_Dk+=row.Erken_Cikma_Dk;
    // Time on site between first entry and last exit, minus meal and break.
    if(row.Ilk_Giris && row.Son_Cikis) total.Calisma_Dk+=Math.max(0,diffMinutes(row.Ilk_Giris,row.Son_Cikis)-row.Toplam_Yemek_Dk-row.Toplam_Mola_Dk);
    total.Fazla_Mesai_Dk+=row.Fazla_Mesai_Dk;
    total.Yemek_Dk+=row.Toplam_Yemek_Dk;
    total.Mola_Dk+=row.Toplam_Mola_Dk;
    total.Mola_Asimi_Dk+=row.Mola_Asimi_Dk;
    return total;
}

// One row per person (in first-seen order) and the grand total over all rows.
function summarize(rows) {
    const people = new Map();
    const toplam = empty();
    for(const row of rows) {
        if(!people.has(row.User_ID)) people.set(row.User_ID,{User_ID:row.User_ID,Ad_Soyad:row.Ad_Soyad,Sicil_No:row.Sicil_No,Departman:row.Departman,...empty()});
        add(people.get(row.User_ID),row);
        add(toplam,row);
    }
    return {ozet:[...people.values()],toplam};
}

module.exports = {periodRange,summarize};
