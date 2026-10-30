import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNav, pageTitle } from '../src/utils/nav.js';

const links = nav => nav.flatMap(entry => entry.items ? entry.items.map(item => item.to) : [entry.to]);

test('viewer menu hides admin pages', () => {
  const nav = buildNav({ admin: false });
  assert.ok(!links(nav).includes('/personel/duzenleme'));
  assert.ok(links(nav).includes('/personel/liste'));
});

test('admin sees every page; simulations live in Tesis Tasarımı', () => {
  const nav = buildNav({ admin: true });
  assert.ok(links(nav).includes('/personel/toplu'));
  assert.ok(links(nav).includes('/tesis-tasarimi'));
  assert.ok(!links(nav).includes('/simulasyon'));
});

test('page title comes from the menu label', () => {
  const nav = buildNav({ admin: true });
  assert.equal(pageTitle(nav, '/denetim/kapi'), 'Kapı Değişiklikleri');
  assert.equal(pageTitle(nav, '/gecis-hareketleri'), 'Geçiş Hareketleri');
  assert.equal(pageTitle(nav, '/settings'), 'Hesap Ayarları');
  assert.equal(pageTitle(nav, '/olmayan'), undefined);
});
