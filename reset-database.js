const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

console.log('🗑️  Удаление старой базы данных...');

// Удаляем старую базу
const fs = require('fs');
if (fs.existsSync('igolnoe-ushko.db')) {
    fs.unlinkSync('igolnoe-ushko.db');
    console.log('✅ Старая база данных удалена');
}

console.log('📝 Создание новой базы данных...');

// Создаем новую базу
const db = new Database('igolnoe-ushko.db');

// Создаем таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    banned INTEGER DEFAULT 0,
    avatar TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS news_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL,
    display_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES news_categories(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS forum_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    display_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS forum_subsections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (section_id) REFERENCES forum_sections(id)
  );

  CREATE TABLE IF NOT EXISTS forum_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subsection_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    views INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,
    FOREIGN KEY (subsection_id) REFERENCES forum_subsections(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    edited_at DATETIME,
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS moderation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moderator_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (moderator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS media_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

console.log('✅ Таблицы созданы');

// Создаем категории новостей
console.log('📰 Создание категорий новостей...');
const insertNewsCategory = db.prepare('INSERT INTO news_categories (name, slug, color, display_order) VALUES (?, ?, ?, ?)');
insertNewsCategory.run('Культура', 'culture', '#8b4789', 1);
insertNewsCategory.run('Технологии', 'tech', '#2e5c8a', 2);
insertNewsCategory.run('Наука', 'science', '#3a7d44', 3);
insertNewsCategory.run('Искусство', 'art', '#c44536', 4);
console.log('✅ Категории новостей созданы');

// Создаем разделы форума
console.log('💬 Создание разделов форума...');
const insertSection = db.prepare('INSERT INTO forum_sections (name, description, display_order) VALUES (?, ?, ?)');

const sections = [
  { name: 'Общее', desc: 'Общие обсуждения и знакомства', order: 1 },
  { name: 'Религия', desc: 'Религиозные темы и духовные практики', order: 2 },
  { name: 'Философия', desc: 'Философские размышления и дискуссии', order: 3 },
  { name: 'Искусство', desc: 'Обсуждение искусства, литературы и творчества', order: 4 },
  { name: 'Наука', desc: 'Научные открытия и технологии', order: 5 }
];

sections.forEach(s => {
  const result = insertSection.run(s.name, s.desc, s.order);
  const sectionId = result.lastInsertRowid;
  
  console.log(`  📁 Создан раздел: ${s.name}`);
  
  // Добавляем подразделы
  const insertSubsection = db.prepare('INSERT INTO forum_subsections (section_id, name, description, display_order) VALUES (?, ?, ?, ?)');
  
  if (s.name === 'Общее') {
    insertSubsection.run(sectionId, 'Знакомства', 'Представьтесь сообществу', 1);
    insertSubsection.run(sectionId, 'Объявления', 'Важные объявления и новости', 2);
    console.log('     └─ Знакомства, Объявления');
  } else if (s.name === 'Религия') {
    insertSubsection.run(sectionId, 'Христианство', 'Обсуждение христианских тем', 1);
    insertSubsection.run(sectionId, 'Другие религии', 'Ислам, Буддизм, Иудаизм и др.', 2);
    console.log('     └─ Христианство, Другие религии');
  } else if (s.name === 'Философия') {
    insertSubsection.run(sectionId, 'Метафизика', 'Вопросы бытия и реальности', 1);
    insertSubsection.run(sectionId, 'Этика', 'Вопросы морали и нравственности', 2);
    console.log('     └─ Метафизика, Этика');
  } else if (s.name === 'Искусство') {
    insertSubsection.run(sectionId, 'Литература', 'Книги, поэзия, проза', 1);
    insertSubsection.run(sectionId, 'Визуальное искусство', 'Живопись, скульптура, дизайн', 2);
    console.log('     └─ Литература, Визуальное искусство');
  } else if (s.name === 'Наука') {
    insertSubsection.run(sectionId, 'Естественные науки', 'Физика, химия, биология', 1);
    insertSubsection.run(sectionId, 'Технологии', 'IT, инновации, разработка', 2);
    console.log('     └─ Естественные науки, Технологии');
  }
});

console.log('✅ Разделы и подразделы форума созданы');

// Создаем администратора
console.log('👤 Создание администратора...');
const hashedPassword = bcrypt.hashSync('admin', 10);
db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@igolnoe-ushko.ru', hashedPassword, 'admin');
console.log('✅ Администратор создан (логин: admin, пароль: admin)');

db.close();

console.log('\n🎉 База данных успешно создана!');
console.log('📌 Теперь запустите сервер: npm start');
