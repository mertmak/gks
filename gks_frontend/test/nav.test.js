import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNav, pageTitle } from '../src/utils/nav.js';

const links = nav => nav.flatMap(entry => entry.items ? entry.items.map(item => item.to) : [entry.to]);

test('viewer menu hides admin pages and simulation', () => {
  const nav = buildNav({ admin: false, simulation: false });
  assert.ok(!links(nav).includes('/personel/duzenleme'));
  assert.ok(!links(nav).includes('/simulasyon'));
  assert.ok(links(nav).includes('/personel/liste'));
});

test('admin with simulation sees every page', () => {
  const nav = buildNav({ admin: true, simulation: true });
  assert.ok(links(nav).includes('/personel/toplu'));
  assert.ok(links(nav).includes('/simulasyon'));
});

test('page title comes from the menu label', () => {
  const nav = buildNav({ admin: true, simulation: false });
  assert.equal(pageTitle(nav, '/denetim/kapi'), 'Kapı Değişiklikleri');
  assert.equal(pageTitle(nav, '/gecis-hareketleri'), 'Geçiş Hareketleri');
  assert.equal(pageTitle(nav, '/settings'), 'Hesap Ayarları');
  assert.equal(pageTitle(nav, '/olmayan'), undefined);
});
