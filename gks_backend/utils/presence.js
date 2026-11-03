// Who is inside at a moment, from accepted reads in the 24 hours before it (night shifts included).
// Mirrors calculateAttendance: the last Ana Giriş without a later Ana Çıkış means inside;
// a meal lasts until Yemekhane Çıkış and a break until the next non-break read.
const LOOKBACK_MS = 24 * 3600000;

function presence(events) {
    const people = new Map();
    for (const e of events) {
        if (e.Kapi_Turu === 'Ana Giriş') { people.set(e.User_ID, { Giris_Zamani: e.Zaman, Konum: 'Bina içi', Son_Okutma: e.Zaman, Son_Kapi: e.Kapi_Adi }); continue; }
        const p = people.get(e.User_ID);
        if (!p) continue;
        if (e.Kapi_Turu === 'Ana Çıkış') { people.delete(e.User_ID); continue; }
        if (e.Kapi_Turu === 'Yemekhane Giriş') p.Konum = 'Yemekhane';
        else if (e.Kapi_Turu === 'Mola / Sigara Alanı') p.Konum = 'Mola alanı';
        else if (e.Kapi_Turu === 'Yemekhane Çıkış' || p.Konum === 'Mola alanı') p.Konum = 'Bina içi';
        Object.assign(p, { Son_Okutma: e.Zaman, Son_Kapi: e.Kapi_Adi });
    }
    return people;
}

module.exports = { presence, LOOKBACK_MS };
