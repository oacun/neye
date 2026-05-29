const winston = require('winston');
const path = require('path');

// Определяем формат логов
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Создаем логгер
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Логи ошибок в отдельный файл
        new winston.transports.File({
            filename: path.join(__dirname, 'logs', 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Все логи в общий файл
        new winston.transports.File({
            filename: path.join(__dirname, 'logs', 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// В режиме разработки также выводим в консоль
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Хелпер функции для удобства
logger.logRequest = (req, statusCode, responseTime) => {
    logger.info({
        type: 'request',
        method: req.method,
        url: req.url,
        statusCode,
        responseTime: `${responseTime}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
};

logger.logAuth = (action, userId, username, success, reason = null) => {
    logger.info({
        type: 'auth',
        action,
        userId,
        username,
        success,
        reason
    });
};

logger.logModeration = (moderatorId, action, targetType, targetId) => {
    logger.info({
        type: 'moderation',
        moderatorId,
        action,
        targetType,
        targetId
    });
};

module.exports = logger;
