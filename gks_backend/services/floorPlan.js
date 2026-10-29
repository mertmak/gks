const { sql } = require('../db');
const { httpError } = require('../utils/transaction');
const { addDoorLog } = require('../utils/logger');

// Ready-made office used on an empty plan. Areas share borders on a 20 px grid;
// door slots sit on those borders, a null side being the outside.
const templateAreas = [
    { ref: 'lobi', bolge_adi: 'Lobi', bolge_turu: 'Lobi', x: 40, y: 200, genislik: 200, yukseklik: 240 },
    { ref: 'ofis', bolge_adi: 'Ofis', bolge_turu: 'Ofis', x: 240, y: 40, genislik: 480, yukseklik: 400 },
    { ref: 'yemekhane', bolge_adi: 'Yemekhane', bolge_turu: 'Yemekhane', x: 240, y: 440, genislik: 300, yukseklik: 200 },
    { ref: 'toplanti', bolge_adi: 'Toplantı Odası', bolge_turu: 'Diğer', x: 540, y: 440, genislik: 180, yukseklik: 200 },
    { ref: 'mola', bolge_adi: 'Mola Alanı', bolge_turu: 'Mola', x: 720, y: 40, genislik: 200, yukseklik: 200 },
];
const templateSlots = {
    'Ana Giriş': [[null, 'lobi', 40, 280], [null, 'lobi', 40, 320]],
    'Ana Çıkış': [[null, 'lobi', 40, 360], [null, 'lobi', 40, 400]],
    'İç Geçiş': [['lobi', 'ofis', 240, 280], ['ofis', 'toplanti', 620, 440], ['lobi', 'ofis', 240, 360]],
    'Yemekhane Giriş': [['ofis', 'yemekhane', 300, 440], ['ofis', 'yemekhane', 360, 440]],
    'Yemekhane Çıkış': [['ofis', 'yemekhane', 440, 440], ['ofis', 'yemekhane', 500, 440]],
    'Mola / Sigara Alanı': [['ofis', 'mola', 720, 120], ['ofis', 'mola', 720, 180]],
};

async function readPlan(tx) {
    const request = () => new sql.Request(tx);
    const bolgeler = (await request().query('SELECT * FROM Bolgeler ORDER BY ID')).recordset;
    const kapilar = (await request().query(`
        SELECT D.ID, D.Kapi_Adi, D.Kapi_Turu, D.Durum, D.Plan_X, D.Plan_Y, D.Bolge_A_ID, D.Bolge_B_ID,
               (SELECT COUNT(*)::int FROM Permissions P JOIN Users U ON U.ID=P.User_ID WHERE P.Door_ID=D.ID AND U.Durum) AS Yetkili_Sayisi
        FROM Doors D ORDER BY D.ID`)).recordset;
    return { bolgeler, kapilar };
}

// The request is the whole plan: missing areas are deleted and doors that
// are not listed are taken off the plan. Areas are addressed by `ref`, so new
// ones can be referenced by doors before they have an ID.
async function savePlan(tx, { bolgeler, kapilar }) {
    const request = () => new sql.Request(tx);
    const areas = new Set((await request().query('SELECT ID FROM Bolgeler FOR UPDATE')).recordset.map(row => row.ID));
    const doors = new Set((await request().query('SELECT ID FROM Doors FOR UPDATE')).recordset.map(row => row.ID));
    if (bolgeler.some(area => area.id && !areas.has(area.id))) throw httpError(404, 'Bölge bulunamadı. Planı yeniden yükleyin.');
    if (kapilar.some(door => !doors.has(door.id))) throw httpError(404, 'Kapı bulunamadı. Planı yeniden yükleyin.');
    const kept = new Set(bolgeler.map(area => area.id).filter(Boolean));
    for (const id of areas) if (!kept.has(id)) await request().input('id', sql.Int, id).query('DELETE FROM Bolgeler WHERE ID=@id');
    const ids = new Map();
    for (const area of bolgeler) {
        const input = request().input('id', sql.Int, area.id || null).input('ad', sql.NVarChar, area.bolge_adi).input('tur', sql.NVarChar, area.bolge_turu)
            .input('x', sql.Int, area.x).input('y', sql.Int, area.y).input('w', sql.Int, area.genislik).input('h', sql.Int, area.yukseklik);
        const saved = await input.query(area.id
            ? 'UPDATE Bolgeler SET Bolge_Adi=@ad, Bolge_Turu=@tur, X=@x, Y=@y, Genislik=@w, Yukseklik=@h WHERE ID=@id RETURNING ID'
            : 'INSERT INTO Bolgeler(Bolge_Adi, Bolge_Turu, X, Y, Genislik, Yukseklik) VALUES(@ad, @tur, @x, @y, @w, @h) RETURNING ID');
        ids.set(area.ref, saved.recordset[0].ID);
    }
    await request().query('UPDATE Doors SET Plan_X=NULL, Plan_Y=NULL, Bolge_A_ID=NULL, Bolge_B_ID=NULL WHERE Plan_X IS NOT NULL');
    for (const door of kapilar) {
        await request().input('id', sql.Int, door.id).input('x', sql.Int, door.plan_x).input('y', sql.Int, door.plan_y)
            .input('a', sql.Int, door.bolge_a ? ids.get(door.bolge_a) : null).input('b', sql.Int, door.bolge_b ? ids.get(door.bolge_b) : null)
            .query('UPDATE Doors SET Plan_X=@x, Plan_Y=@y, Bolge_A_ID=@a, Bolge_B_ID=@b WHERE ID=@id');
    }
}

async function updatePlan(tx, plan, user) {
    await savePlan(tx, plan);
    await addDoorLog(user, 'KAT PLANI GÜNCELLENDİ', 'Kat Planı', `${plan.bolgeler.length} bölge, ${plan.kapilar.length} yerleşik kapı.`, tx);
}

// Places the existing doors by type (active ones first) and adds a door for
// every type that has no active door, so the template is usable at once.
async function applyTemplate(tx, user) {
    const request = () => new sql.Request(tx);
    if ((await request().query('SELECT ID FROM Bolgeler LIMIT 1')).recordset.length) {
        throw httpError(409, 'Kat planı boş değil. Şablon yalnız bölgesi olmayan plana uygulanır.');
    }
    const doors = (await request().query('SELECT ID, Kapi_Turu, Durum FROM Doors ORDER BY ID FOR UPDATE')).recordset;
    let created = 0;
    for (const type of Object.keys(templateSlots)) {
        if (doors.some(door => door.Durum !== false && door.Kapi_Turu === type)) continue;
        const name = `Plan ${type}`;
        const row = (await request().input('ad', sql.NVarChar, name).input('tur', sql.NVarChar, type)
            .query("INSERT INTO Doors(Kapi_Adi, Kapi_Turu, Departman, Konum, Durum) VALUES(@ad, @tur, '', 'Kat planı şablonu', true) RETURNING ID")).recordset[0];
        doors.push({ ID: row.ID, Kapi_Turu: type, Durum: true });
        await addDoorLog(user, 'YENİ KAPI', name, `Kapı türü: ${type}. Kat planı şablonuyla eklendi.`, tx);
        created++;
    }
    doors.sort((x, y) => (y.Durum !== false) - (x.Durum !== false) || x.ID - y.ID);
    const used = Object.fromEntries(Object.keys(templateSlots).map(type => [type, 0]));
    const kapilar = [];
    for (const door of doors) {
        const type = templateSlots[door.Kapi_Turu] ? door.Kapi_Turu : 'İç Geçiş';
        const slot = templateSlots[type][used[type]++];
        if (!slot) continue;
        const [bolge_a, bolge_b, plan_x, plan_y] = slot;
        kapilar.push({ id: door.ID, plan_x, plan_y, bolge_a, bolge_b });
    }
    await updatePlan(tx, { bolgeler: templateAreas, kapilar }, user);
    return { created, placed: kapilar.length };
}

module.exports = { readPlan, updatePlan, applyTemplate, templateAreas, templateSlots };
