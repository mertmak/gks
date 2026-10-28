import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTemplateShift, isDayShift } from '../src/utils/shifts.js';

const day = { ID: 1, Mesai_Baslangic: '1970-01-01T09:00:00.000Z', Mesai_Bitis: '1970-01-01T18:00:00.000Z' };
const night = { ID: 2, Mesai_Baslangic: '1970-01-01T22:00:00.000Z', Mesai_Bitis: '1970-01-01T06:00:00.000Z' };

test('the generator defaults to the oldest day shift, not the newest listed one', () => {
  assert.equal(isDayShift(day), true);
  assert.equal(isDayShift(night), false);
  assert.equal(defaultTemplateShift([night, day]), day);
  assert.equal(defaultTemplateShift([{ ...day, ID: 3 }, night, day]), day);
  assert.equal(defaultTemplateShift([night]), night);
  assert.equal(defaultTemplateShift([]), null);
  assert.equal(isDayShift({ Mesai_Baslangic: '08:30', Mesai_Bitis: '17:00' }), true);
});
