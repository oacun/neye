const nodemailer = require('nodemailer');

// Настройка транспорта для email
// В продакшене используйте реальные SMTP настройки из .env
const createTransporter = () => {
    // Для разработки используем ethereal.email (тестовый сервис)
    // В продакшене замените на реальный SMTP (Gmail, SendGrid, и т.д.)
    
    if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
        // Продакшен конфигурация
        return nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    } else {
        // Разработка: логируем вместо отправки
        console.log('⚠️ SMTP не настроен. Email будут логироваться в консоль.');
        return null;
    }
};

const sendPasswordResetEmail = async (email, username, resetToken) => {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@igolnoe-ushko.ru',
        to: email,
        subject: 'Восстановление пароля - Игольное ушко',
        html: `
            <h2>Восстановление пароля</h2>
            <p>Здравствуйте, ${username}!</p>
            <p>Вы запросили восстановление пароля для вашего аккаунта на сайте "Игольное ушко".</p>
            <p>Перейдите по ссылке ниже для сброса пароля:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>Ссылка действительна в течение 1 часа.</p>
            <p>Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.</p>
            <br>
            <p>С уважением,<br>Команда "Игольное ушко"</p>
        `,
        text: `
            Восстановление пароля
            
            Здравствуйте, ${username}!
            
            Вы запросили восстановление пароля для вашего аккаунта на сайте "Игольное ушко".
            
            Перейдите по ссылке ниже для сброса пароля:
            ${resetUrl}
            
            Ссылка действительна в течение 1 часа.
            
            Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.
            
            С уважением,
            Команда "Игольное ушко"
        `
    };
    
    if (transporter) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Email отправлен:', info.messageId);
            return true;
        } catch (error) {
            console.error('❌ Ошибка отправки email:', error);
            return false;
        }
    } else {
        // В режиме разработки логируем
        console.log('\n📧 EMAIL (не отправлен, только лог):');
        console.log('To:', email);
        console.log('Subject:', mailOptions.subject);
        console.log('Reset URL:', resetUrl);
        console.log('\n');
        return true;
    }
};

module.exports = {
    sendPasswordResetEmail
};
