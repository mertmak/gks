const test = require('node:test');
const assert = require('node:assert/strict');
const { simulationTimes } = require('../utils/simulationTimes');
const { shiftWindow } = require('../utils/attendance');

test('simulation preserves minute precision and next-day meal/break timestamps', () => {
    const shift = { Mesai_Baslangic: '22:45', Mesai_Bitis: '06:15', Yemek_Baslangic: '02:35' };
    const times = simulationTimes('2026-09-07', shift, () => 0);
    assert.equal(times.entry.toISOString(), '2026-09-07T22:15:00.000Z');
    assert.equal(times.exit.toISOString(), '2026-09-08T06:00:00.000Z');
    assert.equal(times.meal.start.toISOString(), '2026-09-08T02:35:00.000Z');
    assert.equal(times.meal.end.toISOString(), '2026-09-08T03:05:00.000Z');
    assert.equal(times.rest.start.toISOString(), '2026-09-08T00:25:00.000Z');
    const day = simulationTimes('2026-09-07', { Mesai_Baslangic: '09:45', Mesai_Bitis: '18:15' }, () => 0);
    assert.equal(day.entry.toISOString(), '2026-09-07T09:15:00.000Z');
    assert.equal(day.exit.toISOString(), '2026-09-07T18:00:00.000Z');
});

test('short, midnight and long shifts keep pauses ordered inside attendance windows', () => {
    for (const [start,end] of [['23:59','00:01'], ['16:15','00:00'], ['00:01','23:59'], ['09:00','09:01']]) {
        const shift = { Mesai_Baslangic:start, Mesai_Bitis:end, Yemek_Baslangic:'02:35' };
        const window = shiftWindow({ ...shift, Tarih:'2026-09-07' });
        for (const random of [0, 0.5, 0.999999]) {
            const times = simulationTimes('2026-09-07', shift, () => random);
            assert.ok(times.entry >= window.from && times.exit < window.to);
            assert.ok(times.entry < times.exit);
            for (const pause of [times.meal,times.rest].filter(Boolean)) {
                assert.ok(pause.start >= times.entry && pause.end < times.exit);
                assert.ok(pause.start < pause.end);
            }
            if (times.meal && times.rest) assert.ok(times.rest.end < times.meal.start);
        }
    }
});
