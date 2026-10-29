const { sql } = require('../db');
const { httpError } = require('../utils/transaction');
const { addDoorLog } = require('../utils/logger');

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// Ready-made plans used on an empty plan. Areas share borders on a 20 px grid;
// door slots [bolge_a, bolge_b, x, y] sit on those borders, null being the
// outside. `minimum` is the number of active doors needed per type (1 if not
// listed).
const templates = {
    ofis: {
        name: 'Ofis',
        katlar: [{ ref: 'zemin', kat_adi: 'Zemin Kat', sira: 0 }],
        bolgeler: [
            { ref: 'lobi', kat: 'zemin', bolge_adi: 'Lobi', bolge_turu: 'Lobi', noktalar: rect(40, 200, 200, 240) },
            { ref: 'ofis', kat: 'zemin', bolge_adi: 'Ofis', bolge_turu: 'Ofis', noktalar: rect(240, 40, 480, 400) },
            { ref: 'yemekhane', kat: 'zemin', bolge_adi: 'Yemekhane', bolge_turu: 'Yemekhane', noktalar: rect(240, 440, 300, 200) },
            { ref: 'toplanti', kat: 'zemin', bolge_adi: 'Toplantı Odası', bolge_turu: 'Diğer', noktalar: rect(540, 440, 180, 200) },
            { ref: 'mola', kat: 'zemin', bolge_adi: 'Mola Alanı', bolge_turu: 'Mola', noktalar: rect(720, 40, 200, 200) },
        ],
        slots: {
            'Ana Giriş': [[null, 'lobi', 40, 280], [null, 'lobi', 40, 320]],
            'Ana Çıkış': [[null, 'lobi', 40, 360], [null, 'lobi', 40, 400]],
            // The second inner door is the way back from the break area.
            'İç Geçiş': [['lobi', 'ofis', 240, 280], ['ofis', 'mola', 720, 200], ['ofis', 'toplanti', 620, 440], ['lobi', 'ofis', 240, 360]],
            'Yemekhane Giriş': [['ofis', 'yemekhane', 300, 440], ['ofis', 'yemekhane', 360, 440]],
            'Yemekhane Çıkış': [['ofis', 'yemekhane', 440, 440], ['ofis', 'yemekhane', 500, 440]],
            'Mola / Sigara Alanı': [['ofis', 'mola', 720, 80], ['ofis', 'mola', 720, 140]],
        },
        minimum: { 'İç Geçiş': 2 },
    },
    // Two floors joined by a staircase; the cafeteria has two entrances
    // (production floor and staircase) to show that areas, not doors, decide.
    fabrika: {
        name: 'Fabrika',
        katlar: [{ ref: 'zemin', kat_adi: 'Zemin Kat', sira: 0 }, { ref: 'ust', kat_adi: '1. Kat', sira: 1 }],
        bolgeler: [
            { ref: 'lobi', kat: 'zemin', bolge_adi: 'Lobi', bolge_turu: 'Lobi', noktalar: rect(40, 200, 200, 240) },
            { ref: 'soyunma', kat: 'zemin', bolge_adi: 'Soyunma Odası', bolge_turu: 'Soyunma', noktalar: rect(240, 200, 200, 240) },
            // L-shaped: the production hall wraps around the warehouse.
            { ref: 'uretim', kat: 'zemin', bolge_adi: 'Üretim Alanı', bolge_turu: 'Üretim', noktalar: [[440, 40], [1340, 40], [1340, 240], [1040, 240], [1040, 440], [440, 440]] },
            { ref: 'depo', kat: 'zemin', bolge_adi: 'Depo', bolge_turu: 'Depo', noktalar: rect(1040, 240, 300, 200) },
            { ref: 'yemekhane', kat: 'zemin', bolge_adi: 'Yemekhane', bolge_turu: 'Yemekhane', noktalar: rect(440, 440, 400, 260) },
            { ref: 'merdiven0', kat: 'zemin', bolge_adi: 'Merdiven', bolge_turu: 'Merdiven/Asansör', dikey_grup: 'Merdiven', noktalar: rect(240, 440, 200, 160) },
            { ref: 'merdiven1', kat: 'ust', bolge_adi: 'Merdiven', bolge_turu: 'Merdiven/Asansör', dikey_grup: 'Merdiven', noktalar: rect(240, 440, 200, 160) },
            { ref: 'ofis', kat: 'ust', bolge_adi: 'Ofis', bolge_turu: 'Ofis', noktalar: rect(240, 40, 600, 400) },
            { ref: 'mola', kat: 'ust', bolge_adi: 'Mola Alanı', bolge_turu: 'Mola', noktalar: rect(840, 40, 200, 200) },
        ],
        slots: {
            'Ana Giriş': [[null, 'lobi', 40, 280]],
            'Ana Çıkış': [[null, 'lobi', 40, 360]],
            'İç Geçiş': [['lobi', 'soyunma', 240, 320], ['soyunma', 'uretim', 440, 320], ['uretim', 'depo', 1180, 240],
                ['soyunma', 'merdiven0', 340, 440], ['merdiven1', 'ofis', 340, 440], ['ofis', 'mola', 840, 200]],
            'Yemekhane Giriş': [['uretim', 'yemekhane', 560, 440], ['merdiven0', 'yemekhane', 440, 520]],
            'Yemekhane Çıkış': [['uretim', 'yemekhane', 720, 440]],
            'Mola / Sigara Alanı': [['ofis', 'mola', 840, 120]],
        },
        minimum: { 'İç Geçiş': 6, 'Yemekhane Giriş': 2 },
    },
};

async function readPlan(tx) {
    const request = () => new sql.Request(tx);
    const katlar = (await request().query('SELECT ID, Kat_Adi, Sira FROM Katlar ORDER BY Sira, ID')).recordset;
    const bolgeler = (await request().query('SELECT ID, Kat_ID, Bolge_Adi, Bolge_Turu, Noktalar, Dikey_Grup FROM Bolgeler ORDER BY ID')).recordset;
    const kapilar = (await request().query(`
        SELECT D.ID, D.Kapi_Adi, D.Kapi_Turu, D.Durum, D.Plan_X, D.Plan_Y, D.Bolge_A_ID, D.Bolge_B_ID, D.Yon_Kisiti,
               (SELECT COUNT(*)::int FROM Permissions P JOIN Users U ON U.ID=P.User_ID WHERE P.Door_ID=D.ID AND U.Durum) AS Yetkili_Sayisi
        FROM Doors D ORDER BY D.ID`)).recordset;
    return { katlar, bolgeler, kapilar };
}

// Rows of `table` locked for the save; a sent ID that does not exist means
// the client's plan is stale.
async function lockIds(tx, table, sent, message) {
    const ids = new Set((await new sql.Request(tx).query(`SELECT ID FROM ${table} FOR UPDATE`)).recordset.map(row => row.ID));
    if (sent.some(id => id && !ids.has(id))) throw httpError(404, message);
    return ids;
}

// The request is the whole plan: missing floors and areas are deleted and
// doors that are not listed are taken off the plan. Rows are addressed by
// `ref`, so new ones can be referenced before they have an ID. Areas are
// saved before floors are deleted, so an area can move to another floor.
async function savePlan(tx, { katlar, bolgeler, kapilar }) {
    const request = () => new sql.Request(tx);
    const floors = await lockIds(tx, 'Katlar', katlar.map(floor => floor.id), 'Kat bulunamadı. Planı yeniden yükleyin.');
    const areas = await lockIds(tx, 'Bolgeler', bolgeler.map(area => area.id), 'Bölge bulunamadı. Planı yeniden yükleyin.');
    await lockIds(tx, 'Doors', kapilar.map(door => door.id), 'Kapı bulunamadı. Planı yeniden yükleyin.');
    const floorIds = new Map(), areaIds = new Map();
    for (const floor of katlar) {
        const saved = await request().input('id', sql.Int, floor.id || null).input('ad', sql.NVarChar, floor.kat_adi).input('sira', sql.Int, floor.sira)
            .query(floor.id ? 'UPDATE Katlar SET Kat_Adi=@ad, Sira=@sira WHERE ID=@id RETURNING ID' : 'INSERT INTO Katlar(Kat_Adi, Sira) VALUES(@ad, @sira) RETURNING ID');
        floorIds.set(floor.ref, saved.recordset[0].ID);
    }
    for (const area of bolgeler) {
        const input = request().input('id', sql.Int, area.id || null).input('kat', sql.Int, floorIds.get(area.kat)).input('ad', sql.NVarChar, area.bolge_adi)
            .input('tur', sql.NVarChar, area.bolge_turu).input('noktalar', sql.NVarChar, JSON.stringify(area.noktalar)).input('grup', sql.NVarChar, area.dikey_grup || null);
        const saved = await input.query(area.id
            ? 'UPDATE Bolgeler SET Kat_ID=@kat, Bolge_Adi=@ad, Bolge_Turu=@tur, Noktalar=CAST(@noktalar AS jsonb), Dikey_Grup=@grup WHERE ID=@id RETURNING ID'
            : 'INSERT INTO Bolgeler(Kat_ID, Bolge_Adi, Bolge_Turu, Noktalar, Dikey_Grup) VALUES(@kat, @ad, @tur, CAST(@noktalar AS jsonb), @grup) RETURNING ID');
        areaIds.set(area.ref, saved.recordset[0].ID);
    }
    const keptAreas = new Set(areaIds.values()), keptFloors = new Set(floorIds.values());
    for (const id of areas) if (!keptAreas.has(id)) await request().input('id', sql.Int, id).query('DELETE FROM Bolgeler WHERE ID=@id');
    for (const id of floors) if (!keptFloors.has(id)) await request().input('id', sql.Int, id).query('DELETE FROM Katlar WHERE ID=@id');
    await request().query("UPDATE Doors SET Plan_X=NULL, Plan_Y=NULL, Bolge_A_ID=NULL, Bolge_B_ID=NULL, Yon_Kisiti='Çift' WHERE Plan_X IS NOT NULL OR Yon_Kisiti<>'Çift'");
    for (const door of kapilar) {
        await request().input('id', sql.Int, door.id).input('x', sql.Int, door.plan_x).input('y', sql.Int, door.plan_y)
            .input('a', sql.Int, door.bolge_a ? areaIds.get(door.bolge_a) : null).input('b', sql.Int, door.bolge_b ? areaIds.get(door.bolge_b) : null)
            .input('yon', sql.NVarChar, door.yon_kisiti || 'Çift')
            .query('UPDATE Doors SET Plan_X=@x, Plan_Y=@y, Bolge_A_ID=@a, Bolge_B_ID=@b, Yon_Kisiti=@yon WHERE ID=@id');
    }
}

async function updatePlan(tx, plan, user) {
    await savePlan(tx, plan);
    await addDoorLog(user, 'KAT PLANI GÜNCELLENDİ', 'Kat Planı', `${plan.katlar.length} kat, ${plan.bolgeler.length} bölge, ${plan.kapilar.length} yerleşik kapı.`, tx);
}

// Places the existing doors by type (active ones first) and adds the missing
// active doors. Where simulations run, the added doors are permitted for every
// active person so the door simulation can use the template at once; elsewhere
// permissions stay an explicit admin decision.
async function applyTemplate(tx, user, { grant = false, template = 'ofis' } = {}) {
    const { slots, minimum, katlar, bolgeler } = templates[template];
    const request = () => new sql.Request(tx);
    if ((await request().query('SELECT ID FROM Bolgeler LIMIT 1')).recordset.length) {
        throw httpError(409, 'Kat planı boş değil. Şablon yalnız bölgesi olmayan plana uygulanır.');
    }
    const doors = (await request().query('SELECT ID, Kapi_Turu, Durum FROM Doors ORDER BY ID FOR UPDATE')).recordset;
    let created = 0;
    for (const type of Object.keys(slots)) {
        const active = doors.filter(door => door.Durum !== false && door.Kapi_Turu === type).length;
        for (let i = active; i < (minimum[type] || 1); i++) {
            const name = i ? `Plan ${type} ${i + 1}` : `Plan ${type}`;
            const row = (await request().input('ad', sql.NVarChar, name).input('tur', sql.NVarChar, type)
                .query("INSERT INTO Doors(Kapi_Adi, Kapi_Turu, Departman, Konum, Durum) VALUES(@ad, @tur, '', 'Kat planı şablonu', true) RETURNING ID")).recordset[0];
            const permitted = grant && (await request().input('door', sql.Int, row.ID)
                .query('INSERT INTO Permissions(User_ID, Door_ID) SELECT ID, @door FROM Users WHERE Durum=true')).rowsAffected[0];
            doors.push({ ID: row.ID, Kapi_Turu: type, Durum: true });
            await addDoorLog(user, 'YENİ KAPI', name, `Kapı türü: ${type}. Kat planı şablonuyla eklendi${grant ? `; ${permitted} aktif personele yetki verildi` : ''}.`, tx);
            created++;
        }
    }
    doors.sort((x, y) => (y.Durum !== false) - (x.Durum !== false) || x.ID - y.ID);
    const used = Object.fromEntries(Object.keys(slots).map(type => [type, 0]));
    const kapilar = [];
    for (const door of doors) {
        const type = slots[door.Kapi_Turu] ? door.Kapi_Turu : 'İç Geçiş';
        const slot = slots[type][used[type]++];
        if (!slot) continue;
        const [bolge_a, bolge_b, plan_x, plan_y] = slot;
        kapilar.push({ id: door.ID, plan_x, plan_y, bolge_a, bolge_b });
    }
    await updatePlan(tx, { katlar, bolgeler, kapilar }, user);
    return { created, placed: kapilar.length };
}

module.exports = { readPlan, updatePlan, applyTemplate, templates };
