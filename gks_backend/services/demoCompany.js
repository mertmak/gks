// Deterministic synthetic factory for the public demo: one year of people,
// shift rotations, leave and door passes ending on the demo reference day.
// Every company, person, ID and card number here is invented.
const { referenceDate } = require('../config/demo');

const company = 'Selvitepe Döküm ve Makine San. A.Ş.';
const contractor = 'Akdere Tesis Hizmetleri Ltd. Şti.';
const firstDay = '2025-11-01';
const setupDay = '2025-10-20';
// Two-week rotation periods start on Sundays, counted from the Sunday before the
// first day: a Monday change would put Monday's morning entry in the old night
// shift's Sunday window.
const rotationStart = '2025-10-26';

const DAY = 86400000;
const toDate = key => new Date(`${key}T00:00:00Z`);
const addDays = (key, n) => new Date(+toDate(key) + n * DAY).toISOString().slice(0, 10);
const dayDiff = (from, to) => Math.round((toDate(to) - toDate(from)) / DAY);
const weekday = key => toDate(key).getUTCDay();
const stamp = (key, minute, second = 0) => new Date(+toDate(key) + minute * 60000 + second * 1000).toISOString().slice(0, 19);
const days = (from, to) => Array.from({ length: Math.max(0, dayDiff(from, to) + 1) }, (_, i) => addDays(from, i));
const minutes = text => text.split(':').reduce((h, m) => h * 60 + Number(m));

const shifts = [
    { key: 'sabah', Vardiya_Adi: 'Sabah Vardiyası', Mesai_Baslangic: '07:00', Mesai_Bitis: '15:00', Yemek_Baslangic: '11:00', Yemek_Bitis: '11:30', Tolerans_Dk: 5, Mola_Hakki_Dk: 30, Calisma_Gunleri: '1,2,3,4,5,6' },
    { key: 'aksam', Vardiya_Adi: 'Akşam Vardiyası', Mesai_Baslangic: '15:00', Mesai_Bitis: '23:00', Yemek_Baslangic: '19:00', Yemek_Bitis: '19:30', Tolerans_Dk: 5, Mola_Hakki_Dk: 30, Calisma_Gunleri: '1,2,3,4,5,6' },
    { key: 'gece', Vardiya_Adi: 'Gece Vardiyası', Mesai_Baslangic: '23:00', Mesai_Bitis: '07:00', Yemek_Baslangic: '03:00', Yemek_Bitis: '03:30', Tolerans_Dk: 5, Mola_Hakki_Dk: 30, Calisma_Gunleri: '1,2,3,4,5' },
    { key: 'ofis', Vardiya_Adi: 'Merkez Ofis', Mesai_Baslangic: '08:00', Mesai_Bitis: '18:00', Yemek_Baslangic: '12:00', Yemek_Bitis: '13:00', Tolerans_Dk: 10, Mola_Hakki_Dk: 30, Calisma_Gunleri: '1,2,3,4,5' },
].map(shift => {
    // Minutes from the shift day's midnight; the night shift ends the next day.
    const start = minutes(shift.Mesai_Baslangic), end = minutes(shift.Mesai_Bitis), meal = minutes(shift.Yemek_Baslangic);
    return { ...shift, start, end: end + (end <= start ? 1440 : 0), meal: meal + (meal < start ? 1440 : 0), days: shift.Calisma_Gunleri.split(',').map(Number) };
});
const shiftByKey = Object.fromEntries(shifts.map(shift => [shift.key, shift]));
const cycles = { uc: ['sabah', 'aksam', 'gece'], iki: ['sabah', 'aksam'], ofis: ['ofis'] };

// Listed in the order of the factory floor-plan template slots (services/floorPlan.js).
const doors = [
    ['giris', 'A Kapısı Giriş Turnikesi', 'Ana Giriş', 'Güvenlik', 'Ana bina girişi'],
    ['cikis', 'A Kapısı Çıkış Turnikesi', 'Ana Çıkış', 'Güvenlik', 'Ana bina girişi'],
    ['soyunma', 'Soyunma Odası Girişi', 'İç Geçiş', 'İdari İşler', 'Zemin kat'],
    ['uretim', 'Üretim Holü Turnikesi', 'İç Geçiş', 'Üretim', 'Zemin kat'],
    ['depo', 'Depo Geçiş Kapısı', 'İç Geçiş', 'Depo ve Sevkiyat', 'Zemin kat'],
    ['merdiven', 'Merdiven Kapısı', 'İç Geçiş', 'İdari İşler', 'Zemin kat'],
    ['idari', 'İdari Kat Girişi', 'İç Geçiş', 'İdari İşler', '1. kat'],
    ['terasDonus', 'Teras Dönüş Kapısı', 'İç Geçiş', 'İdari İşler', '1. kat'],
    ['yemekUretim', 'Yemekhane Girişi (Üretim)', 'Yemekhane Giriş', 'İdari İşler', 'Zemin kat'],
    ['yemekIdari', 'Yemekhane Girişi (Merdiven)', 'Yemekhane Giriş', 'İdari İşler', 'Zemin kat'],
    ['yemekCikis', 'Yemekhane Çıkışı', 'Yemekhane Çıkış', 'İdari İşler', 'Zemin kat'],
    ['teras', 'Teras Sigara Alanı', 'Mola / Sigara Alanı', 'İdari İşler', '1. kat'],
].map(([key, Kapi_Adi, Kapi_Turu, Departman, Konum]) => ({ key, Kapi_Adi, Kapi_Turu, Departman, Konum }));

const common = ['giris', 'cikis', 'soyunma', 'yemekUretim', 'yemekIdari', 'yemekCikis'];
const access = {
    uretim: [...common, 'uretim'],
    saha: [...common, 'uretim', 'depo'],
    ofis: [...common, 'merdiven', 'idari', 'terasDonus', 'teras'],
    tum: doors.map(door => door.key),
};
// [departman, kişi, vardiya düzeni, kapı erişimi, görevler (sırayla, sonuncusu tekrarlanır), şirket]
const departments = [
    ['Dökümhane', 18, 'uc', 'uretim', ['Vardiya Amiri', 'Döküm Ustası', 'Ergitme Operatörü', 'Maça Operatörü', 'Döküm Operatörü']],
    ['Talaşlı İmalat', 16, 'uc', 'uretim', ['Vardiya Amiri', 'CNC Ayar Ustası', 'Torna Operatörü', 'CNC Operatörü']],
    ['Montaj', 12, 'iki', 'uretim', ['Ekip Lideri', 'Montaj Teknisyeni', 'Montaj Operatörü']],
    ['Kalite Kontrol', 7, 'uc', 'saha', ['Kalite Şefi', 'Ölçüm Teknisyeni', 'Kalite Kontrol Teknisyeni']],
    ['Bakım Onarım', 7, 'iki', 'tum', ['Bakım Şefi', 'Elektrik Bakım Teknisyeni', 'Mekanik Bakım Teknisyeni']],
    ['Depo ve Sevkiyat', 9, 'iki', 'saha', ['Depo Sorumlusu', 'Forklift Operatörü', 'Sevkiyat Elemanı']],
    ['Üretim Planlama', 4, 'ofis', 'ofis', ['Planlama Şefi', 'Planlama Uzmanı']],
    ['Satın Alma', 3, 'ofis', 'ofis', ['Satın Alma Şefi', 'Satın Alma Uzmanı']],
    ['İnsan Kaynakları', 3, 'ofis', 'ofis', ['İK Müdürü', 'İK Uzmanı', 'Bordro Uzmanı']],
    ['Muhasebe ve Finans', 4, 'ofis', 'ofis', ['Mali İşler Müdürü', 'Muhasebe Uzmanı']],
    ['Bilgi Teknolojileri', 2, 'ofis', 'tum', ['BT Sorumlusu', 'Sistem Destek Uzmanı']],
    ['İş Sağlığı ve Güvenliği', 2, 'ofis', 'tum', ['İSG Uzmanı', 'İşyeri Hemşiresi']],
    ['Satış ve Pazarlama', 4, 'ofis', 'ofis', ['Satış Müdürü', 'Satış Temsilcisi', 'Dış Ticaret Uzmanı', 'Satış Temsilcisi']],
    ['Ar-Ge', 3, 'ofis', 'ofis', ['Ar-Ge Şefi', 'Tasarım Mühendisi']],
    ['Yönetim', 3, 'ofis', 'tum', ['Genel Müdür', 'Fabrika Müdürü', 'Yönetici Asistanı']],
    ['Güvenlik', 6, 'uc', 'tum', ['Güvenlik Şefi', 'Güvenlik Görevlisi'], contractor],
    ['Temizlik', 4, 'iki', 'tum', ['Temizlik Görevlisi'], contractor],
];
// Production closes on New Year's Day and the two religious holidays; the
// office closes on every official holiday that falls on its working days.
const holidays = [
    ['2026-01-01', '2026-01-01', 'Yılbaşı', true],
    ['2026-03-20', '2026-03-22', 'Ramazan Bayramı', true],
    ['2026-04-23', '2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', false],
    ['2026-05-01', '2026-05-01', 'Emek ve Dayanışma Günü', false],
    ['2026-05-19', '2026-05-19', 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı', false],
    ['2026-05-27', '2026-05-30', 'Kurban Bayramı', true],
    ['2026-07-15', '2026-07-15', 'Demokrasi ve Millî Birlik Günü', false],
    ['2026-10-29', '2026-10-29', 'Cumhuriyet Bayramı', false],
];

const maleNames = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'İsmail', 'Osman', 'Yusuf', 'Murat', 'Ömer', 'Ramazan', 'Halil', 'Süleyman', 'Abdullah', 'Mahmut', 'Recep', 'Salih', 'Fatih', 'Kemal', 'Kadir', 'Emre', 'Burak', 'Serkan', 'Volkan', 'Onur', 'Tolga', 'Uğur', 'Erkan', 'Cengiz', 'Okan', 'Barış', 'Gökhan', 'Sinan', 'Levent', 'Orhan', 'Tuncay', 'Ercan', 'Bayram', 'Yasin', 'Enes', 'Furkan', 'Oğuz', 'Caner', 'Erdem', 'Selim', 'Kerem', 'Cem', 'Hakan', 'Sedat', 'Nihat', 'Zafer', 'Taner', 'Metin', 'Yunus', 'Eren', 'Berk', 'Alper', 'Tarık'];
const femaleNames = ['Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep', 'Elif', 'Meryem', 'Şerife', 'Zehra', 'Sultan', 'Hülya', 'Derya', 'Esra', 'Merve', 'Büşra', 'Gamze', 'Seda', 'Özlem', 'Pınar', 'Tuğba', 'Ebru', 'Sibel', 'Aslı', 'Burcu', 'Ceren', 'Dilek', 'Gülşen', 'Nur', 'Sevgi', 'Yasemin', 'Canan', 'Neslihan', 'Selin', 'İrem', 'Damla', 'Melike', 'Hande', 'Aylin', 'Nazlı', 'Ece'];
const surnames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Özcan', 'Korkmaz', 'Çakır', 'Erdoğan', 'Yavuz', 'Can', 'Acar', 'Şen', 'Aktaş', 'Güler', 'Yalçın', 'Güneş', 'Bozkurt', 'Bulut', 'Keskin', 'Ünal', 'Turan', 'Gül', 'Özer', 'Işık', 'Kaplan', 'Avcı', 'Sarı', 'Tekin', 'Taş', 'Köse', 'Yüksel', 'Ateş', 'Aksoy', 'Karataş', 'Tunç', 'Altun', 'Erdem', 'Uçar', 'Duman', 'Akın', 'Kocabaş', 'Sevim', 'Ekinci', 'Toprak', 'Karakaya', 'Kalkan', 'Çiftçi', 'Gündoğdu', 'Önal', 'Uysal', 'Tuncer', 'Başaran', 'Akgül', 'Coşkun', 'Durmaz', 'Karaca', 'Ergin', 'Sezer', 'Tosun'];

// mulberry32: the same seed always builds the same company.
function random(seed) {
    return () => {
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Turkish ID check digits: 10th = (7·odd − even) mod 10, 11th = sum of the first ten mod 10.
function tcKimlik(rand) {
    const d = [1 + Math.floor(rand() * 9), ...Array.from({ length: 8 }, () => Math.floor(rand() * 10))];
    d.push((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10);
    d.push(d.reduce((sum, digit) => sum + digit, 0) % 10);
    return d.join('');
}

const username = name => name.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => 'cgiosu'['çğıöşü'.indexOf(c)]).replace(/\s+/g, '.');

function build() {
    const rand = random(20261030);
    const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
    const pick = list => list[Math.floor(rand() * list.length)];
    const chance = p => rand() < p;
    const unique = (used, make) => { let value; do value = make(); while (used.has(value)); used.add(value); return value; };
    const usedNames = new Set(), usedTc = new Set(), usedCards = new Set(), usedSystem = new Set();
    const number = () => String(between(1, 9)) + Array.from({ length: 10 }, () => between(0, 9)).join('');
    const workday = key => { while ([0, 6].includes(weekday(key))) key = addDays(key, 1); return key; };
    const randomDay = (from, to) => addDays(from, between(0, dayDiff(from, to)));

    const people = [];
    const deptCount = {};
    const addPerson = (dept, hire) => {
        const [Departman, , pattern, doorAccess, titles, Sirket = company] = dept;
        const i = deptCount[Departman] = (deptCount[Departman] ?? -1) + 1;
        const female = chance(pattern === 'ofis' ? 0.5 : Departman === 'Temizlik' ? 0.6 : 0.12);
        const person = {
            Ad_Soyad: unique(usedNames, () => `${pick(female ? femaleNames : maleNames)} ${pick(surnames)}`), female,
            Departman, Sirket, Gorev: titles[Math.min(i, titles.length - 1)], pattern, team: i % cycles[pattern].length,
            access: access[doorAccess], leader: i === 0, TC_Kimlik: unique(usedTc, () => tcKimlik(rand)),
            Sistem_ID: unique(usedSystem, number), cards: [{ no: unique(usedCards, number), from: '2000-01-01' }],
            periods: [[hire, null]], smoker: chance(0.3), lateProne: chance(0.08),
        };
        people.push(person);
        return person;
    };
    for (const dept of departments) for (let i = 0; i < dept[1]; i++) {
        // Leaders have been here longer; most staff joined in recent years.
        const back = Math.floor((i === 0 ? 0.4 + rand() * 0.6 : rand() ** 1.7) * 16 * 365);
        addPerson(dept, workday(addDays('2025-09-01', -back)));
    }
    people.sort((a, b) => a.periods[0][0].localeCompare(b.periods[0][0]));
    const deptByName = Object.fromEntries(departments.map(dept => [dept[0], dept]));
    const hires = ['Dökümhane', 'Talaşlı İmalat', 'Montaj', 'Dökümhane', 'Depo ve Sevkiyat', 'Talaşlı İmalat', 'Kalite Kontrol', 'Dökümhane', 'Montaj', 'Satış ve Pazarlama', 'Talaşlı İmalat', 'Depo ve Sevkiyat']
        .map((name, k) => {
            let hire = addDays(firstDay, 16 + k * 27 + between(0, 6));
            while (weekday(hire) !== 1) hire = addDays(hire, 1);
            const person = addPerson(deptByName[name], hire);
            person.Gorev = deptByName[name][4].at(-1);
            person.leader = false;
            person.newHire = true;
            return person;
        });
    let sicil = 10000;
    for (const person of people) person.Sicil_No = String(sicil += between(1, 3));

    // Departures, one rehire and two lost cards, all among non-leaders.
    const candidates = people.filter(person => !person.leader && !person.newHire);
    const take = () => candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
    for (const reason of ['İstifa', 'İstifa', 'Emeklilik', 'Askerlik', 'İstifa (başka işyerine geçiş)', 'Karşılıklı anlaşma (ikale)', 'İstifa']) {
        const person = take();
        person.periods[0][1] = workday(randomDay(addDays(firstDay, 20), addDays(referenceDate, -14)));
        person.Cikis_Nedeni = reason;
    }
    for (const person of [hires[1], hires[5]]) {
        person.periods[0][1] = workday(addDays(person.periods[0][0], between(30, 55)));
        person.Cikis_Nedeni = 'Deneme süresinde fesih';
    }
    const rehired = candidates.filter(person => person.pattern !== 'ofis')[0];
    candidates.splice(candidates.indexOf(rehired), 1);
    rehired.history = { start: rehired.periods[0][0], end: '2026-01-16', reason: 'İstifa' };
    rehired.periods = [[rehired.periods[0][0], '2026-01-16'], ['2026-04-06', null]];
    for (const person of [take(), take()]) person.cards.push({ no: unique(usedCards, number), from: workday(randomDay('2026-01-05', '2026-09-30')) });

    const employed = (person, key) => person.periods.some(([from, to]) => from <= key && (!to || key <= to));
    const cardOn = (person, key) => person.cards.filter(card => card.from <= key).at(-1).no;

    // Personel_Vardiya rows: office staff keep one shift, field teams rotate every two weeks.
    const assignments = [];
    const periodStart = k => addDays(rotationStart, k * 14);
    for (const person of people) for (const [from, to] of person.periods) {
        const cycle = cycles[person.pattern];
        if (cycle.length === 1) { assignments.push({ person, shift: cycle[0], start: from, end: to }); continue; }
        const first = Math.max(0, Math.floor(dayDiff(rotationStart, from) / 14));
        for (let k = first; periodStart(k) <= (to ?? referenceDate); k++) {
            const next = addDays(periodStart(k + 1), -1);
            const end = to && to <= next ? to : !to && periodStart(k + 1) > referenceDate ? null : next;
            assignments.push({ person, shift: cycle[(person.team + k) % cycle.length], start: k === first ? from : periodStart(k), end, rotation: k > first });
        }
    }
    const byPerson = new Map(people.map(person => [person, []]));
    for (const row of assignments) byPerson.get(row.person).push(row);
    const shiftOn = (person, key) => {
        const row = byPerson.get(person).find(a => a.start <= key && (!a.end || key <= a.end));
        return row && shiftByKey[row.shift];
    };
    const worksOn = (person, key) => !!shiftOn(person, key)?.days.includes(weekday(key));

    // Leave: official holidays first, then personal leave that never overlaps.
    const leaves = [];
    const busy = new Map(people.map(person => [person, new Map()]));
    const addLeave = (person, start, end, Izin_Turu, Aciklama, Durum = 'Onaylandı', created) => {
        const span = days(start, end);
        if (!span.length || span.some(key => !employed(person, key) || busy.get(person).has(key))) return false;
        if (Durum !== 'Reddedildi') for (const key of span) busy.get(person).set(key, Durum);
        leaves.push({ person, Izin_Turu, Baslangic_Tarihi: start, Bitis_Tarihi: end, Aciklama, Durum,
            Olusturulma_Tarihi: stamp(created > referenceDate ? referenceDate : created, between(510, 1050)) });
        return true;
    };
    for (const [start, end, name, closed] of holidays) for (const person of people) {
        if ((person.pattern === 'ofis' || closed) && days(start, end).some(key => worksOn(person, key))) {
            addLeave(person, start, end, 'Resmi Tatil', name, 'Onaylandı', addDays(start, -10));
        }
    }
    const lastLeaveDay = addDays(referenceDate, 40);
    const tryLeave = (person, from, to, length, ...rest) => {
        for (let attempt = 0; attempt < 12; attempt++) {
            const start = workday(randomDay(from, to));
            const status = typeof rest[2] === 'function' ? rest[2](start) : rest[2];
            if (addLeave(person, start, addDays(start, length), rest[0], rest[1], status, rest[0] === 'Raporlu' ? addDays(start, 1) : addDays(start, -between(5, 25)))) return true;
        }
        return false;
    };
    const futureStatus = start => start > referenceDate && chance(0.5) ? 'Bekliyor' : 'Onaylandı';
    for (const person of people) {
        for (let n = between(1, 3); n > 0; n--) {
            const summer = chance(0.5);
            tryLeave(person, summer ? '2026-06-15' : firstDay, summer ? '2026-09-04' : lastLeaveDay, between(2, 8), 'Yıllık İzin',
                pick(['', '', summer ? 'Yaz tatili' : 'Aile ziyareti', 'Memleket ziyareti']), futureStatus);
        }
        if (chance(0.4)) tryLeave(person, firstDay, referenceDate, between(0, 2), 'Raporlu', 'Sağlık raporu', 'Onaylandı');
        if (chance(0.12)) tryLeave(person, firstDay, referenceDate, between(0, 4), 'Raporlu', 'Hastane raporu', 'Onaylandı');
        if (chance(0.18)) tryLeave(person, firstDay, referenceDate, 0, 'Mazeret İzni', pick(['Resmi daire işlemi', 'Taşınma', 'Okul toplantısı', 'Ailevi nedenler']), 'Onaylandı');
    }
    const fathers = people.filter(person => !person.female && person.periods.length === 1 && !person.periods[0][1]);
    for (const [Izin_Turu, Aciklama, length] of [['Mazeret İzni', 'Babalık izni', 4], ['Mazeret İzni', 'Babalık izni', 4], ['Mazeret İzni', 'Evlilik izni', 2], ['Mazeret İzni', 'Vefat izni', 2], ['Ücretsiz İzin', 'Kişisel nedenler', 9]]) {
        tryLeave(pick(fathers), firstDay, referenceDate, length, Izin_Turu, Aciklama, 'Onaylandı');
    }
    for (let n = 0; n < 4; n++) tryLeave(pick(fathers), '2026-07-01', referenceDate, between(3, 6), 'Yıllık İzin', 'Sipariş yoğunluğu nedeniyle uygun görülmedi', 'Reddedildi');
    const onLeave = (person, key) => busy.get(person).get(key) === 'Onaylandı';

    // Door passes. Timestamps are business wall-clock time.
    const logs = [];
    const pass = (person, key, minute, door, ok = true, second = between(0, 59)) => logs.push({ person, card: cardOn(person, key), door, Zaman: stamp(key, minute, second), Basarili_Mi: ok });
    const workDay = (person, key, shift) => {
        if (chance(0.005)) return; // unexplained absence
        const office = person.pattern === 'ofis';
        let arrive = shift.start - between(4, 25);
        if (chance(person.lateProne ? 0.12 : 0.025)) arrive = shift.start + shift.Tolerans_Dk + between(1, 35);
        const roll = rand();
        // On time is the shift's last minute (no early exit, no overtime). Saturday
        // evening overtime would cross into a Sunday morning shift's window.
        const overtime = office ? 0.05 : shift.key === 'aksam' && weekday(key) === 6 ? 0 : 0.08;
        const exit = roll < 0.015 ? shift.end - between(15, 120) : roll < 0.015 + overtime ? shift.end + between(30, 150) : shift.end - 1;
        pass(person, key, arrive, 'giris');
        pass(person, key, arrive + between(2, 7), office ? 'idari' : 'uretim');
        let meal = [arrive + 60, arrive + 60];
        if (chance(0.85)) {
            const start = shift.meal + between(0, office ? 20 : 10), end = start + between(office ? 25 : 18, office ? 50 : 30);
            if (start > arrive + 30 && end < exit - 10) {
                pass(person, key, start, office ? 'yemekIdari' : 'yemekUretim');
                pass(person, key, end, 'yemekCikis');
                meal = [start, end];
            }
        }
        if (office && person.smoker) {
            for (const [from, to] of [[arrive + 60, meal[0] - 30], [meal[1] + 30, exit - 40]]) {
                if (to <= from || !chance(0.7)) continue;
                const at = between(from, to);
                pass(person, key, at, 'teras');
                pass(person, key, at + (chance(0.04) ? between(25, 40) : between(6, 13)), 'terasDonus');
            }
        }
        if (!person.access.includes(office ? 'uretim' : 'merdiven') && chance(0.003)) pass(person, key, arrive + between(60, 200), office ? 'uretim' : 'merdiven', false);
        if (!chance(0.004)) pass(person, key, exit, 'cikis', true, exit === shift.end - 1 ? between(1, 59) : undefined);
    };
    // Weekend overtime: production on some Sundays, planning and finance on some Saturdays.
    const extraDay = (person, key, shift) => {
        const sunday = weekday(key) === 0;
        if (sunday && shift.key !== 'gece' && shiftOn(person, addDays(key, -1)).key !== 'gece' && ['Dökümhane', 'Talaşlı İmalat', 'Montaj', 'Depo ve Sevkiyat'].includes(person.Departman) && chance(0.06)) {
            const arrive = 7 * 60 + between(35, 55);
            pass(person, key, arrive, 'giris');
            pass(person, key, arrive + between(2, 6), 'uretim');
            pass(person, key, 12 * 60 + between(0, 10), 'yemekUretim');
            pass(person, key, 12 * 60 + between(25, 35), 'yemekCikis');
            pass(person, key, 16 * 60 + between(0, 30), 'cikis');
        } else if (!sunday && ['Üretim Planlama', 'Muhasebe ve Finans'].includes(person.Departman) && chance(0.05)) {
            const arrive = 8 * 60 + between(45, 70);
            pass(person, key, arrive, 'giris');
            pass(person, key, arrive + between(2, 6), 'idari');
            pass(person, key, 14 * 60 + between(0, 40), 'cikis');
        }
    };
    for (const person of people) for (const key of days(firstDay, referenceDate)) {
        if (!employed(person, key) || onLeave(person, key)) continue;
        const shift = shiftOn(person, key);
        if (!shift) continue;
        if (shift.days.includes(weekday(key))) workDay(person, key, shift);
        else extraDay(person, key, shift);
    }
    for (const person of people) for (const [, to] of person.periods) {
        // A former employee's card is refused at the gate a few days later.
        if (to && to < referenceDate) pass(person, workday(addDays(to, between(2, 4))), 7 * 60 + between(40, 59), 'giris', false);
    }
    for (const key of days(firstDay, referenceDate)) {
        if (weekday(key) !== 0 && chance(0.3)) logs.push({ person: null, card: unique(usedCards, number), door: 'giris', Zaman: stamp(key, between(400, 510), between(0, 59)), Basarili_Mi: false });
    }
    logs.sort((a, b) => a.Zaman.localeCompare(b.Zaman));

    // Audit history written by the people who would have done the work.
    const hr = username(people.find(person => person.Gorev === 'İK Uzmanı').Ad_Soyad);
    const it = username(people.find(person => person.Gorev === 'BT Sorumlusu').Ad_Soyad);
    const systemLogs = [], doorLogs = [];
    const audit = (Tarih, Islem_Tipi, person, Detay, Islemi_Yapan = hr) => systemLogs.push({ Tarih, Islem_Tipi, Personel_Ad: person.Ad_Soyad ?? person, Sicil_No: person.Sicil_No ?? '', Detay, Islemi_Yapan });
    for (const shift of shifts) audit(stamp(setupDay, 600 + between(0, 30)), 'VARDİYA', shift.Vardiya_Adi, `${shift.Mesai_Baslangic}–${shift.Mesai_Bitis}, günler: ${shift.Calisma_Gunleri}`);
    for (const door of doors) doorLogs.push({ Tarih: stamp(setupDay, 660 + between(0, 50)), Islem_Tipi: 'YENİ KAPI', Kapi_Adi: door.Kapi_Adi, Detay: `Kapı türü: ${door.Kapi_Turu}. Konum: ${door.Konum}.`, Islemi_Yapan: it });
    doorLogs.push({ Tarih: stamp(setupDay, 780), Islem_Tipi: 'KAT PLANI GÜNCELLENDİ', Kapi_Adi: 'Kat Planı', Detay: `2 kat, 9 bölge, ${doors.length} yerleşik kapı.`, Islemi_Yapan: it });
    for (const person of people) {
        if (person.newHire) audit(stamp(addDays(person.periods[0][0], -3), between(540, 1000)), 'YENİ KAYIT', person, `Sisteme yeni eklendi. Departman: ${person.Departman}`);
        for (const [from, to] of person.periods) {
            if (to && to <= referenceDate) audit(stamp(to, between(960, 1050)), 'PERSONEL DURUMU', person, JSON.stringify({ durum: 0, cikis_tarihi: to, cikis_nedeni: person.history?.end === to ? person.history.reason : person.Cikis_Nedeni }));
            if (from >= firstDay && person.history && from !== person.history.start) audit(stamp(from, between(500, 540)), 'PERSONEL DURUMU', person, JSON.stringify({ durum: 1 }));
        }
        for (const card of person.cards.slice(1)) audit(stamp(card.from, between(480, 520)), 'GÜNCELLEME', person, 'Personel bilgileri güncellendi. Kayıp kart yerine yeni kart tanımlandı.');
    }
    for (const leave of leaves) {
        if (leave.Izin_Turu !== 'Resmi Tatil') audit(leave.Olusturulma_Tarihi, 'İZİN GİRİŞİ', leave.person, `${leave.Baslangic_Tarihi} - ${leave.Bitis_Tarihi}: ${leave.Izin_Turu} (${leave.Durum})`);
    }

    const users = people.map(person => ({
        person, Ad_Soyad: person.Ad_Soyad, RFID_Kart_No: person.cards.at(-1).no, Durum: !person.periods.at(-1)[1],
        TC_Kimlik: person.TC_Kimlik, Sicil_No: person.Sicil_No, Sirket: person.Sirket, Departman: person.Departman, Gorev: person.Gorev,
        Sistem_ID: person.Sistem_ID, Ise_Giris_Tarihi: person.periods.at(-1)[0], Isten_Cikis_Tarihi: person.periods.at(-1)[1], Cikis_Nedeni: person.periods.at(-1)[1] ? person.Cikis_Nedeni : null,
    }));
    const history = people.filter(person => person.history).map(person => ({ person, Baslangic_Tarihi: person.history.start, Bitis_Tarihi: person.history.end, Cikis_Nedeni: person.history.reason }));
    const permissions = people.flatMap(person => person.access.map(door => ({ person, door })));
    return { users, permissions, assignments, history, leaves, logs, systemLogs, doorLogs, hr, approver: username(people.find(person => person.Gorev === 'İK Müdürü').Ad_Soyad) };
}

// Overtime older than a week is decided on the following Monday; the last
// week stays pending so the approval screen has work in it.
function overtimeDecisions(rows, approver) {
    const rand = random(1029);
    const pick = list => list[Math.floor(rand() * list.length)];
    return rows.filter(row => row.Hesaplanan_Dk > 0 && row.TarihStr <= addDays(referenceDate, -7)).map(row => {
        const rejected = rand() < 0.08;
        const weekend = row.Durum.startsWith('Tatil Mesaisi');
        const minutes = row.Hesaplanan_Dk;
        const decided = addDays(row.TarihStr, 8 - weekday(row.TarihStr) || 7);
        return {
            User_ID: row.User_ID, Tarih: row.TarihStr, Hesaplanan_Dk: minutes, Onaylanan_Dk: rejected ? 0 : Math.floor(minutes / 15) * 15 || minutes,
            Durum: rejected ? 'Reddedildi' : 'Onaylandı', Islemi_Yapan: approver, Islem_Zamani: stamp(decided, 540 + Math.floor(rand() * 120), Math.floor(rand() * 60)),
            Aciklama: rejected ? 'Ön onay alınmadan kalındı' : weekend ? 'Hafta sonu çalışması' : pick(['Sipariş yetiştirme', 'Arıza müdahalesi', 'Vardiya devri', 'Sevkiyat yetiştirme', 'Planlı fazla çalışma']),
            Ad_Soyad: row.Ad_Soyad, Sicil_No: row.Sicil_No,
        };
    });
}

module.exports = { build, overtimeDecisions, shifts, doors, firstDay, company, contractor, tcKimlik, addDays };
