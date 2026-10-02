// DB'den gelen TIME değerini (Date | ISO string | "HH:mm:ss") dakikaya çevirir
const parseTimeToMinutes = (timeObj) => {
    if (!timeObj) return 0;

    let hours, minutes;

    if (timeObj instanceof Date) {
        // mssql driver Date olarak getirir, UTC saatini kullan
        hours = timeObj.getUTCHours();
        minutes = timeObj.getUTCMinutes();
    } else {
        const str = timeObj.toString();
        // "1970-01-01T09:00:00.000Z" veya "09:00:00" gibi formatları yakala
        const timePart = str.includes('T') ? str.split('T')[1].substring(0, 5) : str.substring(0, 5);
        const parts = timePart.split(':');
        hours   = parseInt(parts[0], 10) || 0;
        minutes = parseInt(parts[1], 10) || 0;
    }

    return hours * 60 + minutes;
};

// DB'den gelen TIME değerini "HH:mm" formatına çevirir
const formatTimeStr = (dbTime) => {
    if (!dbTime) return null;

    if (dbTime instanceof Date) {
        const h = String(dbTime.getUTCHours()).padStart(2, '0');
        const m = String(dbTime.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    const str = dbTime.toString();
    return str.includes('T') ? str.split('T')[1].substring(0, 5) : str.substring(0, 5);
};

// İki Date arasındaki dakika farkını döner (pozitif)
const diffMinutes = (start, end) => {
    if (!start || !end) return 0;
    return Math.floor((new Date(end) - new Date(start)) / 60000);
};

module.exports = { parseTimeToMinutes, formatTimeStr, diffMinutes };
