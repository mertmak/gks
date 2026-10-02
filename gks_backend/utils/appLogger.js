const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const logger = createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        new transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error', maxsize: 10485760, maxFiles: 5 }),
        new transports.File({ filename: path.join(logsDir, 'combined.log'), maxsize: 10485760, maxFiles: 5 }),
    ],
});

{
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, stack }) =>
                stack ? `${timestamp} [${level}]: ${message}\n${stack}` : `${timestamp} [${level}]: ${message}`
            )
        ),
    }));
}

module.exports = logger;
