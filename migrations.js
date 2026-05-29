const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

function migrateDatabase() {
    console.log('🔄 Проверка миграций базы данных...');
    
    const db = new Database('igolnoe-ushko.db');
    
    // Создаем таблицу миграций если её нет
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Функция проверки выполнения миграции
    function isMigrationExecuted(name) {
        const result = db.prepare('SELECT COUNT(*) as count FROM migrations WHERE name = ?').get(name);
        return result.count > 0;
    }
    
    // Функция отметки миграции как выполненной
    function markMigrationExecuted(name) {
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
    }
    
    // Миграция 1: Создание базовых таблиц
    if (!isMigrationExecuted('001_create_base_tables')) {
        console.log('📝 Выполнение миграции: 001_create_base_tables');
        
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
        
        markMigrationExecuted('001_create_base_tables');
        console.log('✅ Миграция 001_create_base_tables выполнена');
    }
    
    // Миграция 2: Переход с category (текст) на category_id для новостей
    if (!isMigrationExecuted('002_news_category_to_id')) {
        console.log('📝 Выполнение миграции: 002_news_category_to_id');
        
        // Проверяем существует ли таблица news
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='news'").get();
        
        if (tableExists) {
            // Проверяем структуру таблицы
            const columns = db.prepare("PRAGMA table_info(news)").all();
            const hasCategoryColumn = columns.some(col => col.name === 'category');
            const hasCategoryIdColumn = columns.some(col => col.name === 'category_id');
            
            if (hasCategoryColumn && !hasCategoryIdColumn) {
                console.log('  🔄 Обнаружена старая структура таблицы news, выполняется миграция...');
                
                // Создаем временную таблицу с новой структурой
                db.exec(`
                    CREATE TABLE news_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        category_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        author_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (category_id) REFERENCES news_categories(id),
                        FOREIGN KEY (author_id) REFERENCES users(id)
                    );
                `);
                
                // Создаем маппинг старых категорий на новые ID
                const categoryMap = {
                    'culture': 1,
                    'tech': 2,
                    'science': 3,
                    'art': 4
                };
                
                // Переносим данные
                const oldNews = db.prepare('SELECT * FROM news').all();
                const insertStmt = db.prepare('INSERT INTO news_new (id, category_id, title, content, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
                
                oldNews.forEach(item => {
                    const categoryId = categoryMap[item.category] || 1;
                    insertStmt.run(item.id, categoryId, item.title, item.content, item.author_id, item.created_at);
                });
                
                // Удаляем старую таблицу и переименовываем новую
                db.exec(`
                    DROP TABLE news;
                    ALTER TABLE news_new RENAME TO news;
                `);
                
                console.log('  ✅ Данные новостей мигрированы');
            } else if (!hasCategoryIdColumn) {
                // Таблица существует но нет нужного поля - создаем правильную структуру
                db.exec(`
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
                `);
            }
        } else {
            // Таблицы нет - создаем с правильной структурой
            db.exec(`
                CREATE TABLE news (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    author_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (category_id) REFERENCES news_categories(id),
                    FOREIGN KEY (author_id) REFERENCES users(id)
                );
            `);
        }
        
        markMigrationExecuted('002_news_category_to_id');
        console.log('✅ Миграция 002_news_category_to_id выполнена');
    }
    
    // Миграция 3: Переход с category_id на subsection_id для тем форума
    if (!isMigrationExecuted('003_topics_category_to_subsection')) {
        console.log('📝 Выполнение миграции: 003_topics_category_to_subsection');
        
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forum_topics'").get();
        
        if (tableExists) {
            const columns = db.prepare("PRAGMA table_info(forum_topics)").all();
            const hasCategoryIdColumn = columns.some(col => col.name === 'category_id');
            const hasSubsectionIdColumn = columns.some(col => col.name === 'subsection_id');
            
            if (hasCategoryIdColumn && !hasSubsectionIdColumn) {
                console.log('  🔄 Обнаружена старая структура таблицы forum_topics, выполняется миграция...');
                
                // Создаем временную таблицу
                db.exec(`
                    CREATE TABLE forum_topics_new (
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
                `);
                
                // Переносим данные (маппим старые категории на первые подразделы)
                const oldTopics = db.prepare('SELECT * FROM forum_topics').all();
                const insertStmt = db.prepare('INSERT INTO forum_topics_new (id, subsection_id, title, author_id, created_at, updated_at, views, is_pinned, is_locked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                
                oldTopics.forEach(topic => {
                    // Маппим категории на подразделы (category_id -> subsection_id)
                    // Предполагаем что первые 5 категорий соответствуют первым подразделам
                    const subsectionId = topic.category_id * 2 - 1; // Примерный маппинг
                    insertStmt.run(topic.id, subsectionId, topic.title, topic.author_id, topic.created_at, topic.updated_at, topic.views, topic.is_pinned, topic.is_locked);
                });
                
                db.exec(`
                    DROP TABLE forum_topics;
                    ALTER TABLE forum_topics_new RENAME TO forum_topics;
                `);
                
                console.log('  ✅ Данные тем форума мигрированы');
            } else if (!hasSubsectionIdColumn) {
                db.exec(`
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
                `);
            }
        } else {
            db.exec(`
                CREATE TABLE forum_topics (
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
            `);
        }
        
        markMigrationExecuted('003_topics_category_to_subsection');
        console.log('✅ Миграция 003_topics_category_to_subsection выполнена');
    }
    
    // Миграция 4: Создание таблицы постов форума
    if (!isMigrationExecuted('004_create_forum_posts')) {
        console.log('📝 Выполнение миграции: 004_create_forum_posts');
        
        db.exec(`
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
        `);
        
        markMigrationExecuted('004_create_forum_posts');
        console.log('✅ Миграция 004_create_forum_posts выполнена');
    }
    
    // Миграция 5: Создание таблицы комментариев новостей
    if (!isMigrationExecuted('005_create_news_comments')) {
        console.log('📝 Выполнение миграции: 005_create_news_comments');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS news_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                news_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (news_id) REFERENCES news(id),
                FOREIGN KEY (author_id) REFERENCES users(id)
            );
        `);
        
        markMigrationExecuted('005_create_news_comments');
        console.log('✅ Миграция 005_create_news_comments выполнена');
    }
    
    // Миграция 7: Создание таблицы личных сообщений
    if (!isMigrationExecuted('007_create_private_messages')) {
        console.log('📝 Выполнение миграции: 007_create_private_messages');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS private_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                recipient_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                content TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                read_at DATETIME,
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (recipient_id) REFERENCES users(id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_messages_recipient ON private_messages(recipient_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON private_messages(sender_id, created_at DESC);
        `);
        
        markMigrationExecuted('007_create_private_messages');
        console.log('✅ Миграция 007_create_private_messages выполнена');
    }
    
    // Миграция 8: Таблица для токенов восстановления пароля
    if (!isMigrationExecuted('008_create_password_reset_tokens')) {
        console.log('📝 Выполнение миграции: 008_create_password_reset_tokens');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                used INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);
        `);
        
        markMigrationExecuted('008_create_password_reset_tokens');
        console.log('✅ Миграция 008_create_password_reset_tokens выполнена');
    }
    
    // Инициализация данных по умолчанию
    initializeDefaultData(db);
    
    db.close();
    console.log('✅ Все миграции выполнены успешно!');
}

function initializeDefaultData(db) {
    // Создаем администратора если его нет
    const adminCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
    if (adminCheck.count === 0) {
        console.log('👤 Создание администратора...');
        const hashedPassword = bcrypt.hashSync('admin', 10);
        db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@igolnoe-ushko.ru', hashedPassword, 'admin');
        console.log('✅ Администратор создан');
    }
    
    // Создаем категории новостей если их нет
    const newsCatCheck = db.prepare('SELECT COUNT(*) as count FROM news_categories').get();
    if (newsCatCheck.count === 0) {
        console.log('📰 Создание категорий новостей...');
        const insertNewsCategory = db.prepare('INSERT INTO news_categories (name, slug, color, display_order) VALUES (?, ?, ?, ?)');
        insertNewsCategory.run('Культура', 'culture', '#8b4789', 1);
        insertNewsCategory.run('Технологии', 'tech', '#2e5c8a', 2);
        insertNewsCategory.run('Наука', 'science', '#3a7d44', 3);
        insertNewsCategory.run('Искусство', 'art', '#c44536', 4);
        console.log('✅ Категории новостей созданы');
    }
    
    // Создаем разделы форума если их нет
    const sectionCheck = db.prepare('SELECT COUNT(*) as count FROM forum_sections').get();
    if (sectionCheck.count === 0) {
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
            
            const insertSubsection = db.prepare('INSERT INTO forum_subsections (section_id, name, description, display_order) VALUES (?, ?, ?, ?)');
            
            if (s.name === 'Общее') {
                insertSubsection.run(sectionId, 'Знакомства', 'Представьтесь сообществу', 1);
                insertSubsection.run(sectionId, 'Объявления', 'Важные объявления и новости', 2);
            } else if (s.name === 'Религия') {
                insertSubsection.run(sectionId, 'Христианство', 'Обсуждение христианских тем', 1);
                insertSubsection.run(sectionId, 'Другие религии', 'Ислам, Буддизм, Иудаизм и др.', 2);
            } else if (s.name === 'Философия') {
                insertSubsection.run(sectionId, 'Метафизика', 'Вопросы бытия и реальности', 1);
                insertSubsection.run(sectionId, 'Этика', 'Вопросы морали и нравственности', 2);
            } else if (s.name === 'Искусство') {
                insertSubsection.run(sectionId, 'Литература', 'Книги, поэзия, проза', 1);
                insertSubsection.run(sectionId, 'Визуальное искусство', 'Живопись, скульптура, дизайн', 2);
            } else if (s.name === 'Наука') {
                insertSubsection.run(sectionId, 'Естественные науки', 'Физика, химия, биология', 1);
                insertSubsection.run(sectionId, 'Технологии', 'IT, инновации, разработка', 2);
            }
        });
        
        console.log('✅ Разделы и подразделы форума созданы');
    }
}

module.exports = { migrateDatabase };

// Если запущен напрямую
if (require.main === module) {
    migrateDatabase();
}
