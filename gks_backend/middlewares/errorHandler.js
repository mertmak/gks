const errorHandler = (err, req, res, next) => {
    // Parser error messages may quote the request body, including passwords.
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'İstek gövdesi geçerli JSON olmalıdır.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'İstek boyutu en fazla 256 KB olabilir.' });
    console.error("🔥 Sistem Hatası Yakalandı:", err.stack);
    
    // Eğer hata SQL ile ilgili bir unique constraint (çakışma) hatasıysa (Örn: Aynı TC veya Sicil)
    if ([2601, 2627].includes(err.number)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Bu kayıt sistemde zaten mevcut. (Çift kayıt hatası)' 
        });
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = statusCode >= 500 ? 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' : err.message;

    res.status(statusCode).json({
        success: false,
        message: message
    });
};

module.exports = errorHandler;
