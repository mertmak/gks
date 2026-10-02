// Four consecutive seven-day buckets, oldest first. Calendar week numbers
// restart at New Year and depend on DATEFIRST, so they cannot order this range.
const monthlyTrendQuery = `
    SELECT W.Hafta,
        COALESCE(SUM(CAST(L.Basarili_Mi AS INT)), 0) AS Basarili,
        SUM(CASE WHEN L.Basarili_Mi = 0 THEN 1 ELSE 0 END) AS Yetkisiz
    FROM (VALUES (0), (1), (2), (3)) AS W(Hafta)
    LEFT JOIN Logs L
      ON L.Zaman >= DATEADD(day, W.Hafta * 7 - 27, @today)
     AND L.Zaman < DATEADD(day, W.Hafta * 7 - 20, @today)
    GROUP BY W.Hafta
    ORDER BY W.Hafta
`;

module.exports = { monthlyTrendQuery };
