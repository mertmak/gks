// Meaning of a passage between two area types, in the door-type vocabulary
// attendance already uses. null is the outside of the building. Because the
// meaning comes from the areas, an area may have any number of doors.
function passageMeaning(from, to) {
    if (from === null) return 'Ana Giriş';
    if (to === null) return 'Ana Çıkış';
    if (to === 'Yemekhane') return 'Yemekhane Giriş';
    if (from === 'Yemekhane') return 'Yemekhane Çıkış';
    if (to === 'Mola') return 'Mola / Sigara Alanı';
    return 'İç Geçiş';
}
module.exports = { passageMeaning };
