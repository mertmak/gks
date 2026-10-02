const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
    console.error('HATA: JWT_SECRET ortam değişkeni tanımlı değil. Uygulama güvenli şekilde başlatılamaz.');
    process.exit(1);
}

const SECRET_KEY = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const token = bearerHeader.split(' ')[1]; 
        jwt.verify(token, SECRET_KEY, async (err, authData) => {
            if (err) {
                return res.status(401).json({ success: false, message: 'Token geçersiz veya süresi dolmuş.' });
            } else {
                try {
                    const { sql } = require('../db');
                    const result = await new sql.Request().input('id', sql.Int, authData.id).query('SELECT Rol,Kullanici_Adi,Token_Version FROM Yoneticiler WHERE ID=@id');
                    const account = result.recordset[0];
                    if (!account || account.Rol !== authData.role || account.Token_Version !== (authData.version ?? 0)) return res.status(401).json({success:false,message:'Oturum artık geçerli değil.'});
                    req.user = { ...authData, kullanici_adi: account.Kullanici_Adi };
                    next();
                } catch (e) { next(e); }
            }
        });
    } else {
        res.status(401).json({ success: false, message: 'Erişim reddedildi. Token bulunamadı.' });
    }
};

const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next(); 
    } else {
        res.status(403).json({ success: false, message: 'Bu işlem için YÖNETİCİ yetkisine sahip olmalısınız!' });
    }
};

module.exports = { verifyToken, verifyAdmin, SECRET_KEY };