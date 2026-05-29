require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const { migrateDatabase } = require('./migrations');
const { upload } = require('./upload-handler');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('./email-service');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const morgan = require('morgan');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Выполняем миграции при старте
console.log('🔄 Запуск миграций базы данных...');
migrateDatabase();
console.log('✅ Миграции завершены, запуск сервера...\n');

// Database initialization
const db = new Database('igolnoe-ushko.db');

// Create admin user if not exists
const adminCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
if (adminCheck.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@igolnoe-ushko.ru', hashedPassword, 'admin');
}

// Создаем папку для логов если её нет
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// ========== PRODUCTION MIDDLEWARE ==========

// 1. Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.quilljs.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.quilljs.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com", "https://cdn.quilljs.com"],
      scriptSrcAttr: ["'unsafe-inline'"],  // Разрешаем onclick="" атрибуты
      frameSrc: ["https://www.google.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));

// 2. Compression - Gzip для статики
app.use(compression());

// 3. CORS - если нужен доступ из других доменов
if (NODE_ENV === 'development') {
  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
  }));
}

// 4. Morgan - HTTP request logging
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// 5. Rate limiting - защита от spam/DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // Максимум 100 запросов с одного IP
  message: 'Слишком много запросов с этого IP, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

// Применяем ко всем запросам
app.use(limiter);

// Строгий лимит для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // Максимум 5 попыток входа
  message: 'Слишком много попыток входа, попробуйте позже',
  skipSuccessfulRequests: true
});

// Лимит для регистрации
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // Максимум 3 регистрации с одного IP
  message: 'Слишком много регистраций, попробуйте позже'
});

// ========== БАЗОВЫЕ MIDDLEWARE ==========

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'igolnoe-ushko-secret-key-2026-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: NODE_ENV === 'production', // только HTTPS в production
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Serve static files
app.use(express.static('public'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.banned) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  req.user = user;
  next();
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  next();
};

// API Routes

// Auth
app.post('/api/register', registerLimiter, async (req, res) => {
  const { username, email, password, captchaToken } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  // Проверка reCAPTCHA v2 (обязательная)
  if (!captchaToken) {
    return res.status(400).json({ error: 'Пожалуйста, подтвердите, что вы не робот' });
  }

  // Проверяем токен на сервере Google
  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe'; // Тестовый секретный ключ
    
    const captchaResponse = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: secretKey,
          response: captchaToken
        }
      }
    );
    
    if (!captchaResponse.data.success) {
      return res.status(400).json({ error: 'Проверка reCAPTCHA не пройдена. Попробуйте ещё раз.' });
    }
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return res.status(500).json({ error: 'Ошибка проверки reCAPTCHA. Попробуйте позже.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  
  try {
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hashedPassword);
    req.session.userId = result.lastInsertRowid;
    res.json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Пользователь с таким именем или email уже существует' });
  }
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Неверные данные для входа' });
  }

  if (user.banned) {
    return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
  }

  req.session.userId = user.id;
  res.json({ 
    success: true, 
    user: { 
      id: user.id, 
      username: user.username, 
      role: user.role,
      avatar: user.avatar || null
    } 
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ 
    id: req.user.id, 
    username: req.user.username, 
    email: req.user.email, 
    role: req.user.role,
    avatar: req.user.avatar || null
  });
});

// Password Reset - Request
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email обязателен' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    // Не раскрываем существует ли пользователь
    return res.json({ success: true, message: 'Если email существует, письмо с инструкциями будет отправлено' });
  }
  
  // Генерируем токен
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000); // 1 час
  
  // Сохраняем токен
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt.toISOString());
  
  // Отправляем email
  await sendPasswordResetEmail(user.email, user.username, token);
  
  res.json({ success: true, message: 'Если email существует, письмо с инструкциями будет отправлено' });
});

// Password Reset - Verify Token
app.get('/api/auth/verify-reset-token/:token', (req, res) => {
  const tokenData = db.prepare(`
    SELECT prt.*, u.username, u.email 
    FROM password_reset_tokens prt
    JOIN users u ON prt.user_id = u.id
    WHERE prt.token = ? AND prt.used = 0 AND prt.expires_at > datetime('now')
  `).get(req.params.token);
  
  if (!tokenData) {
    return res.status(400).json({ error: 'Недействительный или истёкший токен' });
  }
  
  res.json({ valid: true, username: tokenData.username });
});

// Password Reset - Submit New Password
app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }
  
  const tokenData = db.prepare(`
    SELECT * FROM password_reset_tokens 
    WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(token);
  
  if (!tokenData) {
    return res.status(400).json({ error: 'Недействительный или истёкший токен' });
  }
  
  // Обновляем пароль
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, tokenData.user_id);
  
  // Помечаем токен как использованный
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(tokenData.id);
  
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

// Change Password (для авторизованных)
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль должен быть минимум 6 символов' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  
  // Проверяем текущий пароль
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }
  
  // Обновляем пароль
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, user.id);
  
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

// News Categories
app.get('/api/news/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM news_categories ORDER BY display_order').all();
  res.json(categories);
});

app.post('/api/news/categories', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, slug, color } = req.body;
  
  try {
    const maxOrder = db.prepare('SELECT MAX(display_order) as max FROM news_categories').get();
    const order = (maxOrder.max || 0) + 1;
    
    const result = db.prepare('INSERT INTO news_categories (name, slug, color, display_order) VALUES (?, ?, ?, ?)').run(name, slug, color, order);
    
    const category = db.prepare('SELECT * FROM news_categories WHERE id = ?').get(result.lastInsertRowid);
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: 'Категория с таким именем уже существует' });
  }
});

app.put('/api/news/categories/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, slug, color } = req.body;
  
  try {
    db.prepare('UPDATE news_categories SET name = ?, slug = ?, color = ? WHERE id = ?').run(name, slug, color, req.params.id);
    const category = db.prepare('SELECT * FROM news_categories WHERE id = ?').get(req.params.id);
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: 'Ошибка при обновлении категории' });
  }
});

app.delete('/api/news/categories/:id', requireAuth, requireRole(['admin']), (req, res) => {
  db.prepare('DELETE FROM news_categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// News
app.get('/api/news', (req, res) => {
  const news = db.prepare(`
    SELECT n.*, u.username as author_username, c.name as category_name, c.slug as category_slug, c.color as category_color
    FROM news n 
    JOIN users u ON n.author_id = u.id 
    JOIN news_categories c ON n.category_id = c.id
    ORDER BY n.created_at DESC
  `).all();
  res.json(news);
});

app.post('/api/news', requireAuth, requireRole(['admin']), (req, res) => {
  const { categoryId, title, content } = req.body;
  
  const result = db.prepare('INSERT INTO news (category_id, title, content, author_id) VALUES (?, ?, ?, ?)').run(categoryId, title, content, req.user.id);
  
  const newsItem = db.prepare(`
    SELECT n.*, u.username as author_username, c.name as category_name, c.slug as category_slug, c.color as category_color
    FROM news n 
    JOIN users u ON n.author_id = u.id 
    JOIN news_categories c ON n.category_id = c.id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(newsItem);
});

app.delete('/api/news/:id', requireAuth, requireRole(['admin']), (req, res) => {
  db.prepare('DELETE FROM news_comments WHERE news_id = ?').run(req.params.id);
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Просмотр отдельной новости
app.get('/api/news/:id', (req, res) => {
  const newsItem = db.prepare(`
    SELECT n.*, u.username as author_username, c.name as category_name, c.slug as category_slug, c.color as category_color
    FROM news n 
    JOIN users u ON n.author_id = u.id 
    JOIN news_categories c ON n.category_id = c.id
    WHERE n.id = ?
  `).get(req.params.id);
  
  if (!newsItem) {
    return res.status(404).json({ error: 'Новость не найдена' });
  }
  
  const comments = db.prepare(`
    SELECT c.*, u.username as author_username, u.role as author_role, u.avatar as author_avatar
    FROM news_comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.news_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);
  
  res.json({ news: newsItem, comments });
});

// Добавление комментария к новости
app.post('/api/news/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  
  const result = db.prepare('INSERT INTO news_comments (news_id, author_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content);
  
  const comment = db.prepare(`
    SELECT c.*, u.username as author_username, u.role as author_role, u.avatar as author_avatar
    FROM news_comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(comment);
});

// Удаление комментария
app.delete('/api/news/comments/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM news_comments WHERE id = ?').get(req.params.id);
  
  if (!comment) {
    return res.status(404).json({ error: 'Комментарий не найден' });
  }
  
  // Только автор или админ может удалить
  if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет прав' });
  }
  
  db.prepare('DELETE FROM news_comments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Forum Sections
app.get('/api/forum/sections', (req, res) => {
  const sections = db.prepare(`
    SELECT 
      s.*,
      COUNT(DISTINCT ss.id) as subsection_count,
      COUNT(DISTINCT t.id) as topic_count,
      COUNT(p.id) as post_count
    FROM forum_sections s
    LEFT JOIN forum_subsections ss ON s.id = ss.section_id
    LEFT JOIN forum_topics t ON ss.id = t.subsection_id
    LEFT JOIN forum_posts p ON t.id = p.topic_id
    GROUP BY s.id
    ORDER BY s.display_order
  `).all();
  res.json(sections);
});

// Forum Subsections
app.get('/api/forum/subsections/:sectionId', (req, res) => {
  const subsections = db.prepare(`
    SELECT 
      ss.*,
      COUNT(DISTINCT t.id) as topic_count,
      COUNT(p.id) as post_count
    FROM forum_subsections ss
    LEFT JOIN forum_topics t ON ss.id = t.subsection_id
    LEFT JOIN forum_posts p ON t.id = p.topic_id
    WHERE ss.section_id = ?
    GROUP BY ss.id
    ORDER BY ss.display_order
  `).all(req.params.sectionId);
  res.json(subsections);
});

app.post('/api/forum/subsections', requireAuth, requireRole(['admin']), (req, res) => {
  const { sectionId, name, description } = req.body;
  
  const maxOrder = db.prepare('SELECT MAX(display_order) as max FROM forum_subsections WHERE section_id = ?').get(sectionId);
  const order = (maxOrder.max || 0) + 1;
  
  const result = db.prepare('INSERT INTO forum_subsections (section_id, name, description, display_order) VALUES (?, ?, ?, ?)').run(sectionId, name, description, order);
  
  const subsection = db.prepare('SELECT * FROM forum_subsections WHERE id = ?').get(result.lastInsertRowid);
  res.json(subsection);
});

app.put('/api/forum/subsections/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, description } = req.body;
  
  db.prepare('UPDATE forum_subsections SET name = ?, description = ? WHERE id = ?').run(name, description, req.params.id);
  
  const subsection = db.prepare('SELECT * FROM forum_subsections WHERE id = ?').get(req.params.id);
  res.json(subsection);
});

app.delete('/api/forum/subsections/:id', requireAuth, requireRole(['admin']), (req, res) => {
  db.prepare('DELETE FROM forum_posts WHERE topic_id IN (SELECT id FROM forum_topics WHERE subsection_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM forum_topics WHERE subsection_id = ?').run(req.params.id);
  db.prepare('DELETE FROM forum_subsections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Forum Topics
app.get('/api/forum/topics/:subsectionId', (req, res) => {
  const { offset = 0, limit = 20, sort = 'updated' } = req.query;
  
  let orderBy = 't.is_pinned DESC, t.updated_at DESC';
  if (sort === 'created') orderBy = 't.is_pinned DESC, t.created_at DESC';
  if (sort === 'views') orderBy = 't.is_pinned DESC, t.views DESC';
  if (sort === 'replies') orderBy = 't.is_pinned DESC, reply_count DESC';
  
  const topics = db.prepare(`
    SELECT 
      t.*,
      u.username as author_username,
      COUNT(p.id) as reply_count,
      MAX(p.created_at) as last_post_at
    FROM forum_topics t
    JOIN users u ON t.author_id = u.id
    LEFT JOIN forum_posts p ON t.id = p.topic_id
    WHERE t.subsection_id = ?
    GROUP BY t.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(req.params.subsectionId, parseInt(limit), parseInt(offset));
  
  const total = db.prepare('SELECT COUNT(*) as count FROM forum_topics WHERE subsection_id = ?').get(req.params.subsectionId);
  
  res.json({ topics, total: total.count, hasMore: parseInt(offset) + topics.length < total.count });
});

app.post('/api/forum/topics', requireAuth, (req, res) => {
  const { subsectionId, title } = req.body;
  
  // Проверяем лимит: 5 тем в неделю для обычных пользователей
  if (req.user.role === 'user') {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentTopics = db.prepare(`
      SELECT COUNT(*) as count 
      FROM forum_topics 
      WHERE author_id = ? AND created_at > ?
    `).get(req.user.id, oneWeekAgo.toISOString());
    
    if (recentTopics.count >= 5) {
      return res.status(429).json({ 
        error: 'Достигнут лимит создания тем. Вы можете создавать не более 5 тем в неделю.' 
      });
    }
  }
  
  const result = db.prepare('INSERT INTO forum_topics (subsection_id, title, author_id) VALUES (?, ?, ?)').run(subsectionId, title, req.user.id);
  
  const topic = db.prepare(`
    SELECT t.*, u.username as author_username 
    FROM forum_topics t 
    JOIN users u ON t.author_id = u.id 
    WHERE t.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(topic);
});

// Закрепление темы (только модераторы и админы)
app.post('/api/forum/topics/:id/pin', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  
  if (!topic) {
    return res.status(404).json({ error: 'Тема не найдена' });
  }
  
  const newPinnedState = topic.is_pinned ? 0 : 1;
  db.prepare('UPDATE forum_topics SET is_pinned = ? WHERE id = ?').run(newPinnedState, req.params.id);
  
  // Логируем действие
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, 
    newPinnedState ? 'pin_topic' : 'unpin_topic', 
    'topic', 
    req.params.id,
    `Тема "${topic.title}" ${newPinnedState ? 'закреплена' : 'откреплена'}`
  );
  
  res.json({ success: true, is_pinned: newPinnedState });
});

// Закрытие темы (только модераторы и админы)
app.post('/api/forum/topics/:id/lock', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  
  if (!topic) {
    return res.status(404).json({ error: 'Тема не найдена' });
  }
  
  const newLockedState = topic.is_locked ? 0 : 1;
  db.prepare('UPDATE forum_topics SET is_locked = ? WHERE id = ?').run(newLockedState, req.params.id);
  
  // Логируем действие
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, 
    newLockedState ? 'lock_topic' : 'unlock_topic', 
    'topic', 
    req.params.id,
    `Тема "${topic.title}" ${newLockedState ? 'закрыта' : 'открыта'}`
  );
  
  res.json({ success: true, is_locked: newLockedState });
});

app.put('/api/forum/topics/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { title, is_pinned, is_locked } = req.body;
  
  db.prepare('UPDATE forum_topics SET title = ?, is_pinned = ?, is_locked = ? WHERE id = ?').run(title, is_pinned, is_locked, req.params.id);
  
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  res.json(topic);
});

app.delete('/api/forum/topics/:id', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  
  db.prepare('DELETE FROM forum_posts WHERE topic_id = ?').run(req.params.id);
  db.prepare('DELETE FROM forum_topics WHERE id = ?').run(req.params.id);
  
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id) VALUES (?, ?, ?, ?)').run(req.user.id, 'delete_topic', 'topic', req.params.id);
  
  res.json({ success: true });
});

// Forum Posts
app.get('/api/forum/posts/:topicId', (req, res) => {
  // Increment view count
  db.prepare('UPDATE forum_topics SET views = views + 1 WHERE id = ?').run(req.params.topicId);
  
  const topic = db.prepare(`
    SELECT t.*, u.username as author_username, ss.name as subsection_name, s.name as section_name
    FROM forum_topics t
    JOIN users u ON t.author_id = u.id
    JOIN forum_subsections ss ON t.subsection_id = ss.id
    JOIN forum_sections s ON ss.section_id = s.id
    WHERE t.id = ?
  `).get(req.params.topicId);
  
  const posts = db.prepare(`
    SELECT p.*, u.username as author_username, u.role as author_role, u.avatar as author_avatar
    FROM forum_posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.topic_id = ?
    ORDER BY p.created_at ASC
  `).all(req.params.topicId);
  
  res.json({ topic, posts });
});

app.post('/api/forum/posts', requireAuth, (req, res) => {
  const { topicId, content } = req.body;
  
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(topicId);
  if (topic.is_locked && req.user.role === 'user') {
    return res.status(403).json({ error: 'Тема закрыта для обсуждения' });
  }
  
  const result = db.prepare('INSERT INTO forum_posts (topic_id, author_id, content) VALUES (?, ?, ?)').run(topicId, req.user.id, content);
  
  db.prepare('UPDATE forum_topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(topicId);
  
  const post = db.prepare(`
    SELECT p.*, u.username as author_username, u.role as author_role
    FROM forum_posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(post);
});

app.delete('/api/forum/posts/:id', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  db.prepare('DELETE FROM forum_posts WHERE id = ?').run(req.params.id);
  
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id) VALUES (?, ?, ?, ?)').run(req.user.id, 'delete_post', 'post', req.params.id);
  
  res.json({ success: true });
});

// Edit Post
app.put('/api/forum/posts/:id', requireAuth, (req, res) => {
  const { content } = req.body;
  
  const post = db.prepare('SELECT * FROM forum_posts WHERE id = ?').get(req.params.id);
  
  if (!post) {
    return res.status(404).json({ error: 'Пост не найден' });
  }
  
  // Проверяем права: автор или модератор/админ
  if (post.author_id !== req.user.id && req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет прав для редактирования этого поста' });
  }
  
  // Обновляем пост
  db.prepare('UPDATE forum_posts SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, req.params.id);
  
  const updatedPost = db.prepare(`
    SELECT p.*, u.username as author_username, u.role as author_role, u.avatar as author_avatar
    FROM forum_posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);
  
  res.json(updatedPost);
});

// Moderation
app.post('/api/moderation/ban', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const { userId, reason } = req.body;
  
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (targetUser.role === 'admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Невозможно заблокировать администратора' });
  }
  
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(userId);
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'ban_user', 'user', userId, reason);
  
  res.json({ success: true });
});

app.post('/api/moderation/unban', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const { userId } = req.body;
  
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(userId);
  db.prepare('INSERT INTO moderation_log (moderator_id, action, target_type, target_id) VALUES (?, ?, ?, ?)').run(req.user.id, 'unban_user', 'user', userId);
  
  res.json({ success: true });
});

app.get('/api/moderation/log', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  const logs = db.prepare(`
    SELECT m.*, u.username as moderator_username
    FROM moderation_log m
    JOIN users u ON m.moderator_id = u.id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all();
  res.json(logs);
});

// Admin - User Management
app.get('/api/admin/users', requireAuth, requireRole(['admin']), (req, res) => {
  const users = db.prepare('SELECT id, username, email, role, banned, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAuth, requireRole(['admin']), (req, res) => {
  const { role } = req.body;
  if (!['user', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }
  
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ success: true });
});

// User Profile
app.get('/api/users/:username', (req, res) => {
  const user = db.prepare('SELECT id, username, email, role, bio, avatar, created_at FROM users WHERE username = ?').get(req.params.username);
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const topicCount = db.prepare('SELECT COUNT(*) as count FROM forum_topics WHERE author_id = ?').get(user.id);
  const postCount = db.prepare('SELECT COUNT(*) as count FROM forum_posts WHERE author_id = ?').get(user.id);
  
  res.json({
    ...user,
    stats: {
      topics: topicCount.count,
      posts: postCount.count
    }
  });
});

// Проверка лимита тем пользователя
app.get('/api/users/:username/topic-count', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const result = db.prepare(`
    SELECT COUNT(*) as count 
    FROM forum_topics 
    WHERE author_id = ? AND created_at > ?
  `).get(user.id, oneWeekAgo.toISOString());
  
  res.json({ count: result.count, limit: 5 });
});

app.put('/api/users/profile', requireAuth, (req, res) => {
  const { bio } = req.body;
  
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.user.id);
  
  const user = db.prepare('SELECT id, username, email, role, bio, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Загрузка аватара
app.post('/api/users/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }
  
  // Удаляем старый аватар если есть
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
  if (user.avatar && user.avatar.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, 'public', user.avatar);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  
  // Сохраняем путь к новому аватару
  const avatarPath = '/uploads/avatars/' + req.file.filename;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, req.user.id);
  
  res.json({ avatar: avatarPath });
});

// Удаление аватара
app.delete('/api/users/avatar', requireAuth, (req, res) => {
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
  
  // Удаляем файл если есть
  if (user.avatar && user.avatar.startsWith('/uploads/')) {
    const avatarPath = path.join(__dirname, 'public', user.avatar);
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }
  
  // Очищаем поле avatar в базе данных
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  
  res.json({ success: true, message: 'Аватар удалён' });
});

// RSS лента новостей
app.get('/rss.xml', (req, res) => {
  const news = db.prepare(`
    SELECT n.*, u.username as author_username, c.name as category_name
    FROM news n 
    JOIN users u ON n.author_id = u.id 
    JOIN news_categories c ON n.category_id = c.id
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all();
  
  const siteUrl = req.protocol + '://' + req.get('host');
  
  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Игольное ушко - Новости</title>
    <link>${siteUrl}</link>
    <description>Культурно-философское сообщество</description>
    <language>ru</language>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
`;

  news.forEach(item => {
    const pubDate = new Date(item.created_at).toUTCString();
    const newsUrl = `${siteUrl}/#/news/${item.id}`;
    
    // Очищаем HTML от тегов для description
    const description = item.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
    
    rss += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${newsUrl}</link>
      <description>${escapeXml(description)}</description>
      <category>${escapeXml(item.category_name)}</category>
      <author>${escapeXml(item.author_username)}</author>
      <pubDate>${pubDate}</pubDate>
      <guid>${newsUrl}</guid>
    </item>`;
  });

  rss += `
  </channel>
</rss>`;

  res.type('application/xml');
  res.send(rss);
});

// Private Messages
// Получить входящие сообщения
app.get('/api/messages/inbox', requireAuth, (req, res) => {
  const { offset = 0, limit = 20 } = req.query;
  
  const messages = db.prepare(`
    SELECT 
      pm.*,
      u.username as sender_username,
      u.avatar as sender_avatar,
      u.role as sender_role
    FROM private_messages pm
    JOIN users u ON pm.sender_id = u.id
    WHERE pm.recipient_id = ?
    ORDER BY pm.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), parseInt(offset));
  
  const total = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = ?').get(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = ? AND is_read = 0').get(req.user.id);
  
  res.json({ 
    messages, 
    total: total.count, 
    unread: unread.count,
    hasMore: parseInt(offset) + messages.length < total.count 
  });
});

// Получить исходящие сообщения
app.get('/api/messages/sent', requireAuth, (req, res) => {
  const { offset = 0, limit = 20 } = req.query;
  
  const messages = db.prepare(`
    SELECT 
      pm.*,
      u.username as recipient_username,
      u.avatar as recipient_avatar,
      u.role as recipient_role
    FROM private_messages pm
    JOIN users u ON pm.recipient_id = u.id
    WHERE pm.sender_id = ?
    ORDER BY pm.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), parseInt(offset));
  
  const total = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE sender_id = ?').get(req.user.id);
  
  res.json({ 
    messages, 
    total: total.count,
    hasMore: parseInt(offset) + messages.length < total.count 
  });
});

// Получить конкретное сообщение
app.get('/api/messages/:id', requireAuth, (req, res) => {
  const message = db.prepare(`
    SELECT 
      pm.*,
      sender.username as sender_username,
      sender.avatar as sender_avatar,
      sender.role as sender_role,
      recipient.username as recipient_username,
      recipient.avatar as recipient_avatar,
      recipient.role as recipient_role
    FROM private_messages pm
    JOIN users sender ON pm.sender_id = sender.id
    JOIN users recipient ON pm.recipient_id = recipient.id
    WHERE pm.id = ?
  `).get(req.params.id);
  
  if (!message) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  
  // Проверяем права доступа
  if (message.sender_id !== req.user.id && message.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  
  // Отмечаем как прочитанное, если получатель читает
  if (message.recipient_id === req.user.id && !message.is_read) {
    db.prepare('UPDATE private_messages SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    message.is_read = 1;
  }
  
  res.json(message);
});

// Отправить сообщение
app.post('/api/messages', requireAuth, (req, res) => {
  const { recipientUsername, subject, content } = req.body;
  
  if (!recipientUsername || !subject || !content) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  
  // Проверяем существование получателя
  const recipient = db.prepare('SELECT id, username FROM users WHERE username = ?').get(recipientUsername);
  
  if (!recipient) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  // Нельзя отправить сообщение самому себе
  if (recipient.id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя отправить сообщение самому себе' });
  }
  
  const result = db.prepare(`
    INSERT INTO private_messages (sender_id, recipient_id, subject, content) 
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, recipient.id, subject, content);
  
  const message = db.prepare(`
    SELECT 
      pm.*,
      u.username as recipient_username
    FROM private_messages pm
    JOIN users u ON pm.recipient_id = u.id
    WHERE pm.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(message);
});

// Удалить сообщение
app.delete('/api/messages/:id', requireAuth, (req, res) => {
  const message = db.prepare('SELECT * FROM private_messages WHERE id = ?').get(req.params.id);
  
  if (!message) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  
  // Можно удалить только свои сообщения (отправленные или полученные)
  if (message.sender_id !== req.user.id && message.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  
  db.prepare('DELETE FROM private_messages WHERE id = ?').run(req.params.id);
  
  res.json({ success: true });
});

// Получить количество непрочитанных сообщений
app.get('/api/messages/unread/count', requireAuth, (req, res) => {
  const result = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = ? AND is_read = 0').get(req.user.id);
  res.json({ count: result.count });
});

// Вспомогательная функция для экранирования XML
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Search
app.get('/api/search', (req, res) => {
  const { query, type = 'all' } = req.query;
  
  if (!query || query.length < 2) {
    return res.json({ topics: [], posts: [], users: [] });
  }
  
  const searchTerm = `%${query}%`;
  let results = { topics: [], posts: [], users: [] };
  
  // Поиск по темам
  if (type === 'all' || type === 'topics') {
    results.topics = db.prepare(`
      SELECT t.*, u.username as author_username, ss.name as subsection_name
      FROM forum_topics t
      JOIN users u ON t.author_id = u.id
      JOIN forum_subsections ss ON t.subsection_id = ss.id
      WHERE t.title LIKE ?
      ORDER BY t.created_at DESC
      LIMIT 20
    `).all(searchTerm);
  }
  
  // Поиск по постам
  if (type === 'all' || type === 'posts') {
    results.posts = db.prepare(`
      SELECT p.*, t.title as topic_title, u.username as author_username
      FROM forum_posts p
      JOIN forum_topics t ON p.topic_id = t.id
      JOIN users u ON p.author_id = u.id
      WHERE p.content LIKE ?
      ORDER BY p.created_at DESC
      LIMIT 20
    `).all(searchTerm);
  }
  
  // Поиск по пользователям
  if (type === 'all' || type === 'users') {
    results.users = db.prepare(`
      SELECT id, username, role, avatar, created_at
      FROM users
      WHERE username LIKE ? AND banned = 0
      ORDER BY username
      LIMIT 10
    `).all(searchTerm);
  }
  
  res.json(results);
});

// Media Upload (simple base64 storage for now)
app.post('/api/media/upload', requireAuth, (req, res) => {
  const { filename, data, mimeType } = req.body;
  
  // In production, you would save to disk/cloud storage
  // For now, we'll return the data URL
  res.json({
    url: `data:${mimeType};base64,${data}`,
    filename
  });
});

// Reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== ERROR HANDLING ==========

// 404 handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Не найдено' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Не раскрываем детали ошибок в production
  const message = NODE_ENV === 'production' 
    ? 'Внутренняя ошибка сервера' 
    : err.message;

  res.status(err.status || 500).json({ 
    error: message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ========== SERVER START ==========

app.listen(PORT, () => {
  logger.info(`🌟 Игольное ушко запущено на http://localhost:${PORT}`);
  logger.info(`📊 Режим: ${NODE_ENV}`);
  logger.info(`👤 Админ: username: admin, password: admin`);
  console.log(`🌟 Игольное ушко запущено на http://localhost:${PORT}`);
  console.log(`📊 Режим: ${NODE_ENV}`);
  console.log(`👤 Админ: username: admin, password: admin`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM получен, завершаем сервер...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT получен, завершаем сервер...');
  db.close();
  process.exit(0);
});
