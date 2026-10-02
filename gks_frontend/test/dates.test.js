import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { businessDate, previousMonthDate, shiftDateDays } from '../src/utils/dates.js';
import { configureDemo } from '../src/utils/demo.js';

test('calendar filter defaults preserve month ends and leap days in every host timezone', () => {
  const previousTZ = process.env.TZ;
  try {
    for (const timezone of ['Europe/Istanbul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      assert.equal(previousMonthDate('2026-03-31'), '2026-02-28', timezone);
      assert.equal(previousMonthDate('2024-03-31'), '2024-02-29', timezone);
      assert.equal(previousMonthDate('2026-01-31'), '2025-12-31', timezone);
      assert.equal(shiftDateDays('2026-01-03', -7), '2025-12-27', timezone);
      assert.equal(shiftDateDays('2026-03-10', -7), '2026-03-03', timezone);
      assert.equal(businessDate(new Date('2026-09-22T21:30:00Z')), '2026-09-23', timezone);
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('demo defaults keep the scenario date while explicit dates still use business timezone', () => {
  configureDemo({ demo: true, referenceDate: '2026-09-07' });
  try {
    assert.equal(businessDate(), '2026-09-07');
    assert.equal(shiftDateDays(businessDate(), -7), '2026-08-31');
    assert.equal(previousMonthDate(businessDate()), '2026-08-07');
    assert.equal(businessDate(new Date('2026-09-22T21:30:00Z')), '2026-09-23');
  } finally { configureDemo({ demo: false, referenceDate: null }); }
});

test('local browser dates use the server business timezone instead of a fixed Istanbul day', () => {
  configureDemo({ demo: false, referenceDate: null, businessTimeZone: 'America/Los_Angeles' });
  try {
    assert.equal(businessDate(new Date('2026-09-22T21:30:00Z')), '2026-09-22');
  } finally { configureDemo({ demo: false, referenceDate: null }); }
});
