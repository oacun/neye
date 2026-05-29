const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Создаём директорию для загрузок если её нет
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}

// Настройка хранилища
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarsDir);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Фильтр файлов - только изображения
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Только изображения (jpeg, jpg, png, gif, webp)'));
    }
};

// Настройка multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB максимум
    },
    fileFilter: fileFilter
});

module.exports = { upload, avatarsDir };
