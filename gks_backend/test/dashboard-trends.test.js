const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyTrendQuery } = require('../services/dashboardTrends');

test('28-day trend keeps four ordered weeks across New Year, including empty weeks', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    await sql.query(`
      INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES(N'Trend Fixture',N'Ana Giriş');
      INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi)
      SELECT N'trend-fixture',D.ID,V.Zaman,V.Basarili
      FROM Doors D CROSS JOIN (VALUES
        (CAST('2026-12-13T23:59:59' AS datetime),1),
        (CAST('2026-12-14T00:00:00' AS datetime),1),
        (CAST('2026-12-20T23:59:59' AS datetime),0),
        (CAST('2026-12-28T00:00:00' AS datetime),1),
        (CAST('2027-01-03T23:59:59' AS datetime),1),
        (CAST('2027-01-04T00:00:00' AS datetime),0),
        (CAST('2027-01-10T23:59:59' AS datetime),1),
        (CAST('2027-01-11T00:00:00' AS datetime),1)
      ) V(Zaman,Basarili);
    `);
    const expected = [
        { Hafta: 0, Basarili: 1, Yetkisiz: 1 },
        { Hafta: 1, Basarili: 0, Yetkisiz: 0 },
        { Hafta: 2, Basarili: 2, Yetkisiz: 0 },
        { Hafta: 3, Basarili: 1, Yetkisiz: 1 },
    ];
    for (const firstDay of [1, 7]) {
        const result = await new sql.Request().input('today', sql.Date, '2027-01-10')
            .query(`SET DATEFIRST ${firstDay}; ${monthlyTrendQuery}`);
        assert.deepEqual(result.recordset, expected);
    }
    const empty = await new sql.Request().input('today', sql.Date, '2028-01-10').query(monthlyTrendQuery);
    assert.deepEqual(empty.recordset.map(row => [row.Basarili, row.Yetkisiz]), [[0,0],[0,0],[0,0],[0,0]]);
});
