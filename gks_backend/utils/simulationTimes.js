const { shiftWindow } = require('./attendance');
const { parseTimeToMinutes } = require('./dateHelper');
const minute = 60000;

// Use the same wall-clock/overnight window as attendance. Randomness is injectable
// so boundary scenarios remain deterministic in tests.
function simulationTimes(day, shift, random = Math.random) {
    const window = shiftWindow({ ...shift, Tarih: day });
    const jitter = (size, offset = 0) => Math.floor(random() * size) + offset;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const entry = clamp(+window.start + jitter(75, -30) * minute, +window.from + minute, +window.end - minute);
    const exit = clamp(+window.end + jitter(105, -15) * minute, entry + minute, +window.to - minute);
    let mealBase = (entry + exit) / 2;
    if (shift.Yemek_Baslangic != null) {
        const midnight = Date.parse(String(day).slice(0, 10) + 'T00:00:00Z');
        let planned = midnight + parseTimeToMinutes(shift.Yemek_Baslangic) * minute;
        if (planned < +window.start) planned += 1440 * minute;
        if (planned > entry && planned < exit) mealBase = planned;
    }
    const pause = (base, until, delay, minDuration, range) => {
        const start = Math.floor((base + jitter(delay) * minute) / minute) * minute;
        const end = Math.min(start + jitter(range, minDuration) * minute, until - minute);
        return end > start ? { start: new Date(start), end: new Date(end) } : null;
    };
    const meal = pause(mealBase, exit, 20, 30, 20);
    const restLimit = meal ? +meal.start : exit;
    const rest = pause((entry + restLimit) / 2, restLimit, 30, 5, 25);
    return { entry: new Date(entry), exit: new Date(exit), meal, rest };
}

module.exports = { simulationTimes };
