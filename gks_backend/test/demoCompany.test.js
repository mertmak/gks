const test = require('node:test');
const assert = require('node:assert/strict');
const factory = require('../services/demoCompany');

test('the demo factory is reproducible and its identifiers look real', () => {
    const data = factory.build();
    assert.equal(JSON.stringify(factory.build()), JSON.stringify(data), 'same seed, same company');
    const valid = tc => {
        const d = [...tc].map(Number);
        return d[0] !== 0 && d[9] === (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10
            && d[10] === d.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;
    };
    assert.ok(valid('10000000146'), 'the check follows the published rule');
    for (const user of data.users) {
        assert.ok(valid(user.TC_Kimlik), user.TC_Kimlik);
        assert.match(user.RFID_Kart_No, /^\d{11}$/);
        assert.match(user.Sicil_No, /^\d{5}$/);
    }
    for (const field of ['Ad_Soyad', 'TC_Kimlik', 'RFID_Kart_No', 'Sicil_No', 'Sistem_ID']) {
        assert.equal(new Set(data.users.map(user => user[field])).size, data.users.length, field);
    }
});

test('a person never holds two leave records on the same day', () => {
    const seen = new Set();
    for (const leave of factory.build().leaves.filter(leave => leave.Durum !== 'Reddedildi')) {
        for (let day = leave.Baslangic_Tarihi; day <= leave.Bitis_Tarihi; day = factory.addDays(day, 1)) {
            const key = `${leave.person.Sicil_No} ${day}`;
            assert.ok(!seen.has(key), key);
            seen.add(key);
        }
    }
});
