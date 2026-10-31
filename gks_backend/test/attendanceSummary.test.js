const test = require('node:test');
const assert = require('node:assert/strict');
const { periodRange, summarize } = require('../utils/attendanceSummary');
const { periodReportQuery } = require('../middlewares/query');

test('week and month ranges contain the given day', () => {
    assert.deepEqual(periodRange({ donem: 'hafta', baslangic: '2026-10-01' }), { baslangic: '2026-09-28', bitis: '2026-10-04' });
    assert.deepEqual(periodRange({ donem: 'hafta', baslangic: '2026-09-28' }), { baslangic: '2026-09-28', bitis: '2026-10-04' });
    assert.deepEqual(periodRange({ donem: 'hafta', baslangic: '2026-10-04' }), { baslangic: '2026-09-28', bitis: '2026-10-04' });
    assert.deepEqual(periodRange({ donem: 'ay', baslangic: '2028-02-17' }), { baslangic: '2028-02-01', bitis: '2028-02-29' });
    assert.deepEqual(periodRange({ donem: 'ay', baslangic: '2026-12-31' }), { baslangic: '2026-12-01', bitis: '2026-12-31' });
    assert.deepEqual(periodRange({ donem: 'ozel', baslangic: '2026-09-03', bitis: '2026-09-05' }), { baslangic: '2026-09-03', bitis: '2026-09-05' });
});

test('summary totals per person and overall', () => {
    const base = { Gec_Kalma_Dk: 0, Erken_Cikma_Dk: 0, Fazla_Mesai_Dk: 0, Toplam_Yemek_Dk: 0, Toplam_Mola_Dk: 0, Mola_Asimi_Dk: 0, Ilk_Giris: null, Son_Cikis: null };
    const rows = [
        { ...base, User_ID: 1, Ad_Soyad: 'A', Durum: 'Geç Kaldı', Gec_Kalma_Dk: 15, Ilk_Giris: '2026-09-07T09:15:00Z', Son_Cikis: '2026-09-07T18:00:00Z', Toplam_Yemek_Dk: 30, Toplam_Mola_Dk: 20, Mola_Asimi_Dk: 5, Fazla_Mesai_Dk: 40 },
        { ...base, User_ID: 2, Ad_Soyad: 'B', Durum: 'Devamsız' },
        { ...base, User_ID: 1, Ad_Soyad: 'A', Durum: 'Hafta Tatili' },
        { ...base, User_ID: 2, Ad_Soyad: 'B', Durum: 'Yıllık İzin', Izin_Durumu: 'Yıllık İzin' },
        { ...base, User_ID: 2, Ad_Soyad: 'B', Durum: 'İzin Çakışması', Izin_Durumu: null, Izin_Cakismasi: true },
        { ...base, User_ID: 1, Ad_Soyad: 'A', Durum: 'Çıkış Yok', Ilk_Giris: '2026-09-09T09:00:00Z' },
    ];
    const { ozet, toplam } = summarize(rows);
    assert.deepEqual(ozet.map(p => p.User_ID), [1, 2]);
    const [a, b] = ozet;
    assert.equal(a.Gun, 3);
    assert.equal(a.Calisilan_Gun, 2);
    assert.equal(a.Hafta_Tatili, 1);
    assert.equal(a.Gec_Kalma_Sayisi, 1);
    assert.equal(a.Gec_Kalma_Dk, 15);
    assert.equal(a.Calisma_Dk, 525 - 50, 'no exit means no worked minutes for that day');
    assert.equal(a.Fazla_Mesai_Dk, 40);
    assert.equal(a.Mola_Asimi_Dk, 5);
    assert.equal(b.Devamsiz_Gun, 1);
    assert.equal(b.Izinli_Gun, 1);
    assert.equal(toplam.Gun, 6);
    assert.equal(toplam.Calisilan_Gun, 2);
    assert.deepEqual(summarize([]), { ozet: [], toplam: summarize([]).toplam });
});

test('period query limits range and scope', () => {
    const ok = q => periodReportQuery.safeParse(q).success;
    assert.equal(ok({ donem: 'ay', baslangic: '2026-09-01', kapsam: 'tumu' }), true);
    assert.equal(ok({ donem: 'ozel', baslangic: '2026-09-01', bitis: '2026-12-01', kapsam: 'tumu' }), true, '92 days');
    assert.equal(ok({ donem: 'ozel', baslangic: '2026-09-01', bitis: '2026-12-02', kapsam: 'tumu' }), false, '93 days');
    assert.equal(ok({ donem: 'ozel', baslangic: '2026-09-05', bitis: '2026-09-01', kapsam: 'tumu' }), false);
    assert.equal(ok({ donem: 'ozel', baslangic: '2026-09-05', kapsam: 'tumu' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'kisi', personel: '3' }), true);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'kisi', personel: '3,4' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'kisi' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'secili', personel: Array.from({ length: 100 }, (_, i) => i + 1).join(',') }), true);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'secili', personel: Array.from({ length: 101 }, (_, i) => i + 1).join(',') }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'secili', personel: '2147483648' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'secili', personel: '0' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'departman' }), false);
    assert.equal(ok({ donem: 'hafta', baslangic: '2026-09-05', kapsam: 'departman', departman: 'Ofis' }), true);
});
