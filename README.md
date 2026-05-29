# 🧵 Игольное ушко

Русскоязычная платформа для культурно-философского сообщества. Форум, новости, комментарии и аватары пользователей.

![Node.js](https://img.shields.io/badge/Node.js-16+-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![SQLite](https://img.shields.io/badge/SQLite-3-lightblue)
![License](https://img.shields.io/badge/License-MIT-brightgreen)

## ✨ Возможности

### Форум
- 📁 Иерархические разделы с подразделами
- 💬 Обсуждение тем с полным текстовым редактором
- 👥 Комментарии пользователей с аватарами
- 🔒 Роли пользователей (администратор, модератор, пользователь)
- 🗑️ Удаление постов (автор или администратор)

### Новости
- 📰 Публикация новостных статей с редактором
- 🏷️ Категоризация новостей
- 💬 Комментарии к статьям
- 📡 RSS-лента (`/rss.xml`)
- 📖 Полный просмотр отдельной статьи

### Профили пользователей
- 👤 Профиль с информацией о пользователе
- 🎨 Загрузка аватара (JPEG, PNG, GIF, WebP)
- ✍️ Редактирование биографии
- 🔐 Безопасное управление аккаунтом

### Безопасность
- 🔒 Хеширование паролей (bcrypt)
- 🤖 Google reCAPTCHA v3 при регистрации
- 🛡️ Защита от SQL-инъекций
- 📊 Сессии с автоматическим истечением (24 часа)
- 🔑 Переменные окружения для секретов

### Дополнительно
- 💾 Сохранение состояния (localStorage)
- 🌙 Адаптивный дизайн
- 📱 Мобильная версия
- 🚀 Готово к деплою

## 🛠️ Технологический стек

### Бэкенд
- **Node.js** + **Express.js** - веб-сервер
- **better-sqlite3** - база данных SQLite
- **bcryptjs** - хеширование паролей
- **express-session** - управление сессиями
- **multer** - загрузка файлов
- **axios** - HTTP клиент (для reCAPTCHA)
- **dotenv** - переменные окружения

### Фронтенд
- **Vanilla JavaScript** - без фреймворков
- **Quill.js** - WYSIWYG редактор
- **CSS3** - адаптивная верстка
- **Google reCAPTCHA v3** - защита от ботов

## 📋 Требования

- **Node.js** 16+ 
- **npm** 8+
- **Google reCAPTCHA ключи** (опционально, для продакшена)

## 🚀 Быстрый старт

### 1. Клонирование и установка

```bash
# Клонируйте репозиторий
git clone https://github.com/oacun/neye.git
cd igolnoe-ushko

# Установите зависимости
npm install
```

### 2. Настройка переменных окружения

```bash
# Скопируйте пример файла
cp .env.example .env
```

Файл `.env` содержит тестовые ключи reCAPTCHA и готов к запуску на localhost:

```env
SESSION_SECRET=igolnoe-ushko-development-secret-key-2026
RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe
```

### 3. Запуск

```bash
# Разработка (с автоматической перезагрузкой)
npm run dev

# ИЛИ продакшен
npm start

# ИЛИ с полной инициализацией БД
npm run reset-db
npm start
```

Откройте http://localhost:3000

## 📚 Основные роуты

### API

#### Аутентификация
- `POST /api/register` - Регистрация
- `POST /api/login` - Вход
- `POST /api/logout` - Выход
- `GET /api/auth` - Проверка аутентификации

#### Пользователи
- `GET /api/users/:id` - Информация о пользователе
- `POST /api/users/avatar` - Загрузка аватара
- `PUT /api/users/profile` - Обновление профиля

#### Форум
- `GET /api/sections` - Все разделы
- `GET /api/sections/:id/subsections` - Подразделы
- `GET /api/subsections/:id/topics` - Темы в подразделе
- `GET /api/topics/:id` - Тема с постами
- `POST /api/topics` - Создание темы
- `POST /api/topics/:id/posts` - Добавление поста
- `DELETE /api/posts/:id` - Удаление поста

#### Новости
- `GET /api/news` - Список новостей
- `GET /api/news/:id` - Отдельная новость
- `POST /api/news` - Создание новости
- `DELETE /api/news/:id` - Удаление новости
- `POST /api/news/:id/comments` - Комментарий к новости
- `DELETE /api/news/comments/:id` - Удаление комментария

#### Другое
- `GET /rss.xml` - RSS-лента

### Веб-интерфейс

- `/` - Главная страница (новости)
- `/#/forum` - Форум
- `/#/admin` - Администратор (только для админов)
- `/#/profile/:id` - Профиль пользователя

## 📁 Структура проекта

```
igolnoe-ushko/
├── public/
│   ├── index.html          # Главная HTML страница
│   ├── app.js              # Логика фронтенда
│   ├── styles.css          # Стили
│   └── uploads/
│       └── avatars/        # Загруженные аватары
├── server.js               # Основной сервер Express
├── migrations.js           # Миграции БД
├── upload-handler.js       # Обработка загрузок файлов
├── package.json            # Зависимости
├── .env                    # Переменные окружения (не коммитить!)
├── .gitignore              # Игнорируемые файлы
├── README.md               # Этот файл
└── igolnoe-ushko.db        # База данных SQLite
```

## 🔐 Безопасность

### Встроенная защита
- ✅ Хеширование паролей bcrypt (10 раундов)
- ✅ Защита от SQL-инъекций (параметризованные запросы)
- ✅ CSRF защита (express-session)
- ✅ Проверка аутентификации для приватных операций
- ✅ Роль-базированный контроль доступа

### reCAPTCHA v3
- ✅ Невидимая проверка при регистрации
- ✅ Score-based система (0.0 = бот, 1.0 = человек)
- ✅ Блокировка подозрительных регистраций

### Рекомендации для продакшена
1. Установите сильный `SESSION_SECRET` в `.env`
2. Получите свои ключи Google reCAPTCHA
3. Используйте HTTPS
4. Настройте регулярные резервные копии БД
5. Используйте процесс-менеджер (PM2, systemd)
6. Настройте Rate Limiting
7. Мониторьте логи ошибок

Подробно: см. `DEPLOYMENT_SEO_SECURITY.md`

## 📦 Установка зависимостей

Все зависимости указаны в `package.json`:

```bash
npm install
```

Основные пакеты:
- `express@^4.18.2` - веб-фреймворк
- `better-sqlite3@^9.2.2` - база данных
- `bcryptjs@^2.4.3` - хеширование
- `multer@^1.4.5-lts.1` - загрузка файлов
- `dotenv@^16.0.3` - переменные окружения
- `axios@^1.6.0` - HTTP запросы

## 🚀 Деплой

### На Render.com

1. Создайте аккаунт на https://render.com
2. Подключите репозиторий GitHub
3. Создайте новый Web Service
4. Установите переменные окружения в панели:
   - `SESSION_SECRET`
   - `RECAPTCHA_SITE_KEY`
   - `RECAPTCHA_SECRET_KEY`
5. Build command: `npm install`
6. Start command: `npm start`

### На Railway

1. Создайте аккаунт на https://railway.app
2. Подключите GitHub репозиторий
3. Railway автоматически обнаружит Node.js
4. Добавьте переменные в Project Variables
5. Deploy!

### На собственном VPS

```bash
# Установите Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Клонируйте проект
git clone https://github.com/yourusername/igolnoe-ushko.git
cd igolnoe-ushko

# Установите зависимости
npm install

# Настройте .env
nano .env

# Запустите с PM2
npm install -g pm2
pm2 start server.js --name igolnoe-ushko
pm2 save
pm2 startup
```

Подробная инструкция: `DEPLOYMENT_SEO_SECURITY.md`

## 🔧 Разработка

### Запуск в режиме разработки

```bash
npm run dev
```

### Инициализация чистой БД

```bash
npm run reset-db
npm start
```

### Структура БД

**users**
- id, username, email, password, bio, avatar, role, created_at

**sections** (разделы форума)
- id, name, description, order

**subsections** (подразделы)
- id, section_id, name, description, order

**topics** (темы)
- id, subsection_id, author_id, title, created_at

**posts** (посты)
- id, topic_id, author_id, content, created_at

**news** (новости)
- id, author_id, title, content, category, created_at

**news_comments** (комментарии к новостям)
- id, news_id, author_id, content, created_at

## 🤝 Вклад

Приветствуются pull requests! 

Для больших изменений сначала откройте Issue для обсуждения.

## 📝 Лицензия

MIT License - смотрите файл LICENSE

## 🎯 Дорожная карта

- [ ] Приватные сообщения между пользователями
- [ ] Система лайков и рейтинга
- [ ] Поиск по форуму и новостям
- [ ] Уведомления на email
- [ ] Экспорт архивов
- [ ] Темный режим
- [ ] Поддержка Markdown в комментариях
- [ ] Модерация контента (флаги)

## ❓ FAQ

### Как сбросить пароль администратора?

По умолчанию есть admin-пользователь. Если забыли пароль, удалите `igolnoe-ushko.db` и перезагрузитесь:

```bash
rm igolnoe-ushko.db
npm run reset-db
npm start
```

### Как добавить нового администратора?

В БД обновите роль пользователя:

```bash
sqlite3 igolnoe-ushko.db "UPDATE users SET role='admin' WHERE username='username';"
```

### Почему reCAPTCHA показывает ошибки?

Это нормально для медленного интернета. reCAPTCHA загружается асинхронно и не блокирует сайт. Если у вас нет интернета, регистрация работает без капчи.

### Как отключить reCAPTCHA?

Удалите переменные `RECAPTCHA_*` из `.env` - сервер будет работать без проверки.

### Как увеличить размер загружаемого аватара?

В `upload-handler.js` измените `limits: { fileSize: 5 * 1024 * 1024 }` (сейчас 5MB)

## 🐛 Сообщение об ошибках

Нашли баг? Откройте Issue с:
- Описанием проблемы
- Шагами для воспроизведения
- Скриншотом консоли браузера (F12 → Console)

## 📚 Дополнительная документация

- `DEPLOYMENT_SEO_SECURITY.md` - Деплой, SEO, безопасность
- `RECAPTCHA_SETUP.md` - Настройка Google reCAPTCHA
- `RECAPTCHA_READY.md` - Быстрая инструкция по reCAPTCHA
- `NEW_FEATURES.md` - Описание новых функций

---

**Сделано с ❤️ для русскоязычного интернета**
