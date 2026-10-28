// Four consecutive seven-day buckets, oldest first. Calendar week numbers
// restart at New Year, so they cannot order this range.
const monthlyTrendQuery = `
    SELECT W.Hafta,
        COALESCE(SUM(CAST(L.Basarili_Mi AS INT)), 0) AS Basarili,
        SUM(CASE WHEN L.Basarili_Mi = false THEN 1 ELSE 0 END) AS Yetkisiz
    FROM (VALUES (0), (1), (2), (3)) AS W(Hafta)
    LEFT JOIN Logs L
      ON L.Zaman >= @today + (W.Hafta * 7 - 27)
     AND L.Zaman < @today + (W.Hafta * 7 - 20)
    GROUP BY W.Hafta
    ORDER BY W.Hafta
`;

module.exports = { monthlyTrendQuery };
