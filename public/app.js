// State
let currentUser = null;
let currentView = 'news';
let currentSubsectionId = null;
let currentTopicId = null;
let currentSectionId = null;
let topicOffset = 0;
let topicSort = 'updated';
let newsEditor = null;
let replyEditor = null;
let newsCategories = [];

// API helpers
async function api(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            ...options,
            headers:

 {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка сервера');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initEditors();
    setupEventListeners();
    await checkAuth();
    await loadNewsCategories();
    await loadNews();
    await loadForumSections();
    
    // Восстанавливаем последнюю страницу
    const savedPage = localStorage.getItem('currentPage');
    if (savedPage && savedPage !== 'news') {
        if (savedPage === 'profile') {
            // Восстанавливаем профиль
            const savedProfile = localStorage.getItem('currentProfile');
            if (savedProfile) {
                await viewProfile(savedProfile);
            }
        } else if (savedPage === 'forum') {
            switchPage('forum');
            
            // Если был открыт подраздел
            const savedSubsection = localStorage.getItem('currentSubsection');
            if (savedSubsection) {
                const subsection = JSON.parse(savedSubsection);
                await viewSubsection(subsection.id, subsection.name, subsection.description);
            }
            
            // Если была открыта тема
            const savedTopic = localStorage.getItem('currentTopic');
            if (savedTopic) {
                const topicId = parseInt(savedTopic);
                await viewTopic(topicId);
            }
        } else {
            switchPage(savedPage);
        }
    } else if (savedPage === 'news') {
        // Проверяем, была ли открыта конкретная новость
        const savedNewsId = localStorage.getItem('currentNewsId');
        if (savedNewsId) {
            await viewNewsItem(parseInt(savedNewsId));
        }
    }
});

function initEditors() {
    // News editor
    if (document.getElementById('newsEditor')) {
        newsEditor = new Quill('#newsEditor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['blockquote', 'code-block'],
                    ['link', 'image', 'video'],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            },
            placeholder: 'Напишите содержание новости...'
        });
    }
    
    // Reply editor
    if (document.getElementById('replyEditor')) {
        replyEditor = new Quill('#replyEditor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['blockquote', 'link', 'image'],
                    ['clean']
                ]
            },
            placeholder: 'Напишите ваш ответ...'
        });
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.target.dataset.page;
            switchPage(page);
        });
    });

    // Auth buttons
    document.getElementById('loginBtn').addEventListener('click', () => {
        document.getElementById('loginModal').classList.add('active');
    });

    document.getElementById('registerBtn').addEventListener('click', () => {
        document.getElementById('registerModal').classList.add('active');
    });

    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Profile click
    document.getElementById('userName').addEventListener('click', () => {
        if (currentUser) {
            viewProfile(currentUser.username);
        }
    });

    // Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('newsForm').addEventListener('submit', handleNewsSubmit);
    document.getElementById('newTopicForm').addEventListener('submit', handleNewTopic);
    document.getElementById('newCategoryForm').addEventListener('submit', handleNewCategory);
    document.getElementById('editSubsectionForm').addEventListener('submit', handleEditSubsection);
    document.getElementById('editTopicForm').addEventListener('submit', handleEditTopic);
    document.getElementById('profileEditForm').addEventListener('submit', handleProfileEdit);
    document.getElementById('newMessageForm').addEventListener('submit', handleNewMessage);
    document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
    
    // Search
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
}

async function checkAuth() {
    try {
        const user = await api('/api/me');
        currentUser = user;
        updateAuthUI();
    } catch (error) {
        currentUser = null;
        updateAuthUI();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        currentUser = data.user;
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginForm').reset();
    } catch (error) {
        showError('loginError', error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        // Получаем токен reCAPTCHA v2
        let captchaToken = null;
        if (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) {
            captchaToken = grecaptcha.getResponse();
            
            // Проверяем, что пользователь прошёл капчу
            if (!captchaToken) {
                showError('registerError', 'Пожалуйста, подтвердите, что вы не робот');
                return;
            }
        } else {
            showError('registerError', 'reCAPTCHA не загружена. Пожалуйста, перезагрузите страницу');
            return;
        }
        
        await api('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, captchaToken })
        });

        await checkAuth();
        closeModal('registerModal');
        document.getElementById('registerForm').reset();
        
        // Сбрасываем reCAPTCHA
        if (typeof grecaptcha !== 'undefined' && grecaptcha.reset) {
            grecaptcha.reset();
        }
    } catch (error) {
        showError('registerError', error.message);
        
        // Сбрасываем reCAPTCHA при ошибке
        if (typeof grecaptcha !== 'undefined' && grecaptcha.reset) {
            grecaptcha.reset();
        }
    }
}

async function logout() {
    try {
        await api('/api/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        switchPage('news');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function updateAuthUI() {
    if (currentUser) {
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('registerBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        document.getElementById('userName').textContent = currentUser.username;
        
        // Показываем ссылку на сообщения
        document.getElementById('messagesLink').style.display = 'block';
        checkUnreadMessages();
        
        const avatarElement = document.getElementById('userAvatar');
        
        // Определяем роль для badge
        const roleClass = `role-${currentUser.role}`;
        const roleText = currentUser.role === 'admin' ? 'A' : currentUser.role === 'moderator' ? 'M' : 'U';
        
        // Проверяем, есть ли загруженный аватар
        if (currentUser.avatar && currentUser.avatar.trim() !== '') {
            // Есть аватар - показываем изображение
            avatarElement.innerHTML = `
                <img src="${currentUser.avatar}" alt="${currentUser.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                <div class="user-role-badge ${roleClass}">${roleText}</div>
            `;
        } else {
            // Нет аватара - показываем первую букву
            const avatarText = currentUser.username[0].toUpperCase();
            avatarElement.innerHTML = `
                ${avatarText}
                <div class="user-role-badge ${roleClass}">${roleText}</div>
            `;
        }

        if (currentUser.role === 'admin' || currentUser.role === 'moderator') {
            document.getElementById('adminPanel').style.display = 'block';
        }
    } else {
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('registerBtn').style.display = 'block';
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('messagesLink').style.display = 'none';
    }
}

function switchPage(page) {
    currentView = page;
    
    // Сохраняем текущую страницу
    localStorage.setItem('currentPage', page);
    
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const navLink = document.querySelector(`[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    // Hide all views
    document.getElementById('newsFeed').style.display = 'none';
    document.getElementById('forumContainer').style.display = 'none';
    document.getElementById('subsectionView').style.display = 'none';
    document.getElementById('topicView').style.display = 'none';
    document.getElementById('profileView').style.display = 'none';
    document.getElementById('messagesView').style.display = 'none';
    
    // Show correct view
    if (page === 'news') {
        document.getElementById('newsFeed').style.display = 'grid';
        if (currentUser && currentUser.role === 'admin') {
            document.getElementById('adminPanel').style.display = 'block';
        }
    } else if (page === 'forum') {
        document.getElementById('forumContainer').style.display = 'block';
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator')) {
            document.getElementById('adminPanel').style.display = 'none';
        }
    } else if (page === 'messages') {
        document.getElementById('messagesView').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
        loadMessages('inbox');
    }
}

// News Categories
async function loadNewsCategories() {
    try {
        newsCategories = await api('/api/news/categories');
        renderNewsCategorySelect();
        if (currentUser && currentUser.role === 'admin') {
            renderNewsCategoryList();
        }
    } catch (error) {
        console.error('Error loading news categories:', error);
    }
}

function renderNewsCategorySelect() {
    const select = document.getElementById('newsCategory');
    if (!select) return;
    
    select.innerHTML = newsCategories.map(cat => 
        `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`
    ).join('');
}

function renderNewsCategoryList() {
    const container = document.getElementById('newsCategoryList');
    if (!container) return;
    
    container.innerHTML = newsCategories.map(cat => `
        <div class="category-item">
            <div class="category-info" style="display: flex; align-items: center;">
                <div class="category-color-preview" style="background: ${cat.color};"></div>
                <div>
                    <strong>${escapeHtml(cat.name)}</strong> (${escapeHtml(cat.slug)})
                </div>
            </div>
            <div class="category-actions">
                <button class="btn-submit btn-small" onclick="editCategory(${cat.id}, '${escapeHtml(cat.name)}', '${escapeHtml(cat.slug)}', '${cat.color}')">Редактировать</button>
                <button class="btn-danger btn-small" onclick="deleteCategory(${cat.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

function showNewCategoryModal() {
    document.getElementById('newCategoryModal').classList.add('active');
}

async function handleNewCategory(e) {
    e.preventDefault();
    
    const name = document.getElementById('categoryName').value;
    const slug = document.getElementById('categorySlug').value;
    const color = document.getElementById('categoryColor').value;

    try {
        await api('/api/news/categories', {
            method: 'POST',
            body: JSON.stringify({ name, slug, color })
        });

        closeModal('newCategoryModal');
        document.getElementById('newCategoryForm').reset();
        await loadNewsCategories();
    } catch (error) {
        alert(error.message);
    }
}

async function editCategory(id, name, slug, color) {
    const newName = prompt('Новое название:', name);
    if (!newName) return;
    
    const newSlug = prompt('Новый slug:', slug);
    if (!newSlug) return;
    
    const newColor = prompt('Новый цвет (HEX):', color);
    if (!newColor) return;

    try {
        await api(`/api/news/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName, slug: newSlug, color: newColor })
        });
        await loadNewsCategories();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteCategory(id) {
    if (!confirm('Удалить эту категорию? Все новости в ней также будут удалены!')) return;
    
    try {
        await api(`/api/news/categories/${id}`, { method: 'DELETE' });
        await loadNewsCategories();
    } catch (error) {
        alert(error.message);
    }
}

// News
async function loadNews() {
    try {
        const news = await api('/api/news');
        renderNews(news);
    } catch (error) {
        console.error('Error loading news:', error);
    }
}

async function handleNewsSubmit(e) {
    e.preventDefault();
    
    const categoryId = document.getElementById('newsCategory').value;
    const title = document.getElementById('newsTitle').value;
    const content = newsEditor.root.innerHTML;

    try {
        await api('/api/news', {
            method: 'POST',
            body: JSON.stringify({ categoryId, title, content })
        });

        document.getElementById('newsForm').reset();
        newsEditor.setContents([]);
        await loadNews();
    } catch (error) {
        alert(error.message);
    }
}

function renderNews(newsItems) {
    const feed = document.getElementById('newsFeed');
    feed.innerHTML = '';

    newsItems.forEach((item, index) => {
        const date = new Date(item.created_at);
        const dateStr = date.toLocaleDateString('ru-RU');
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const newsElement = document.createElement('div');
        newsElement.className = 'news-item';
        newsElement.style.borderLeftColor = item.category_color;
        newsElement.style.cursor = 'pointer';
        
        // Клик на новость открывает её полностью
        newsElement.addEventListener('click', (e) => {
            // Не открывать если кликнули на кнопку удаления
            if (e.target.tagName === 'BUTTON') return;
            viewNewsItem(item.id);
        });
        
        newsElement.innerHTML = `
            <div class="news-header">
                <div>
                    <div class="news-category" style="background: ${item.category_color};">
                        ${escapeHtml(item.category_name)}
                    </div>
                    <h2 class="news-title">${escapeHtml(item.title)}</h2>
                </div>
                <div class="news-meta">
                    <span class="news-date">${dateStr} • ${timeStr}</span>
                    <span class="news-author">@${escapeHtml(item.author_username)}</span>
                </div>
            </div>
            <div class="news-content">${item.content}</div>
            ${currentUser && currentUser.role === 'admin' ? `
                <button class="btn-danger" onclick="event.stopPropagation(); deleteNews(${item.id})">Удалить</button>
            ` : ''}
        `;
        
        feed.appendChild(newsElement);
    });
}

// Просмотр отдельной новости
async function viewNewsItem(newsId) {
    try {
        const data = await api(`/api/news/${newsId}`);
        renderNewsItem(data.news, data.comments);
        
        // Сохраняем состояние
        localStorage.setItem('currentPage', 'news');
        localStorage.setItem('currentNewsId', newsId);
        
        document.getElementById('newsFeed').style.display = 'none';
        document.getElementById('newsItemView').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
    } catch (error) {
        alert('Новость не найдена');
    }
}

function renderNewsItem(news, comments) {
    const container = document.getElementById('newsItemContainer');
    
    const date = new Date(news.created_at);
    const dateStr = date.toLocaleDateString('ru-RU');
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    container.innerHTML = `
        <article class="news-item-full">
            <div class="news-category" style="background: ${news.category_color}; display: inline-block; padding: 0.5rem 1rem; border-radius: 4px; margin-bottom: 1rem;">
                ${escapeHtml(news.category_name)}
            </div>
            <h1 style="font-family: 'Playfair Display', serif; font-size: 2.5rem; margin-bottom: 1rem;">${escapeHtml(news.title)}</h1>
            <div class="news-meta" style="color: var(--text-secondary); margin-bottom: 2rem;">
                <span>Автор: <strong>@${escapeHtml(news.author_username)}</strong></span> | 
                <span>${dateStr} • ${timeStr}</span>
            </div>
            <div class="news-content" style="font-size: 1.1rem; line-height: 1.8; margin-bottom: 3rem;">
                ${news.content}
            </div>
            
            ${currentUser && currentUser.role === 'admin' ? `
                <button class="btn-danger" onclick="deleteNewsFromView(${news.id})">Удалить новость</button>
                <hr style="margin: 2rem 0; border-color: var(--border-subtle);">
            ` : ''}
            
            <div class="comments-section">
                <h3 style="font-family: 'Playfair Display', serif; font-size: 1.8rem; margin-bottom: 1.5rem;">
                    💬 Комментарии (${comments.length})
                </h3>
                
                ${currentUser ? `
                    <div class="comment-form" style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                        <textarea id="newCommentText" placeholder="Ваш комментарий..." style="width: 100%; min-height: 100px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-subtle); padding: 1rem; border-radius: 4px; font-family: 'Cormorant Garamond', serif; font-size: 1rem;"></textarea>
                        <button class="btn-submit" onclick="addComment(${news.id})" style="margin-top: 1rem;">Отправить комментарий</button>
                    </div>
                ` : '<p style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">Войдите, чтобы оставить комментарий</p>'}
                
                <div id="commentsList">
                    ${comments.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Пока нет комментариев. Будьте первым!</p>' : 
                    comments.map(c => {
                        const commentDate = new Date(c.created_at);
                        const commentDateStr = commentDate.toLocaleDateString('ru-RU') + ' ' + commentDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                        
                        return `
                            <div class="comment" style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--accent-gold);">
                                <div class="comment-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                                    <div class="comment-author" style="font-weight: 600; color: var(--accent-gold);">
                                        @${escapeHtml(c.author_username)}
                                        ${c.author_role === 'admin' ? '<span style="background: #d4af37; color: #000; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem; margin-left: 0.5rem;">ADMIN</span>' : ''}
                                    </div>
                                    <div class="comment-date" style="font-size: 0.9rem; color: var(--text-secondary);">
                                        ${commentDateStr}
                                    </div>
                                </div>
                                <div class="comment-text" style="color: var(--text-primary); line-height: 1.6;">
                                    ${escapeHtml(c.content)}
                                </div>
                                ${(currentUser && (currentUser.id === c.author_id || currentUser.role === 'admin')) ? 
                                    `<button class="btn-danger btn-small" onclick="deleteComment(${c.id}, ${news.id})" style="margin-top: 1rem;">Удалить</button>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </article>
    `;
}

async function addComment(newsId) {
    const content = document.getElementById('newCommentText').value.trim();
    if (!content) return alert('Введите текст комментария');
    
    try {
        await api(`/api/news/${newsId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        document.getElementById('newCommentText').value = '';
        viewNewsItem(newsId); // Перезагрузить страницу новости
    } catch (error) {
        alert(error.message);
    }
}

async function deleteComment(commentId, newsId) {
    if (!confirm('Удалить комментарий?')) return;
    
    try {
        await api(`/api/news/comments/${commentId}`, { method: 'DELETE' });
        viewNewsItem(newsId);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteNewsFromView(newsId) {
    if (!confirm('Удалить эту новость?')) return;
    
    try {
        await api(`/api/news/${newsId}`, { method: 'DELETE' });
        backToNews();
        await loadNews();
    } catch (error) {
        alert(error.message);
    }
}

function backToNews() {
    localStorage.removeItem('currentNewsId');
    document.getElementById('newsItemView').style.display = 'none';
    document.getElementById('newsFeed').style.display = 'grid';
    if (currentUser && currentUser.role === 'admin') {
        document.getElementById('adminPanel').style.display = 'block';
    }
}

async function deleteNews(id) {
    if (!confirm('Удалить эту новость?')) return;
    
    try {
        await api(`/api/news/${id}`, { method: 'DELETE' });
        await loadNews();
    } catch (error) {
        alert(error.message);
    }
}

// Utilities
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    const errorId = modalId.replace('Modal', 'Error');
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.style.display = 'block';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Forum Sections
async function loadForumSections() {
    console.log('🔄 Загрузка разделов форума...');
    try {
        const sections = await api('/api/forum/sections');
        console.log('✅ Loaded sections:', sections);
        
        if (!sections || sections.length === 0) {
            console.error('❌ Нет разделов форума!');
            const container = document.getElementById('forumSections');
            container.innerHTML = '<p style="color: var(--text-secondary); padding: 2rem;">Разделы форума не найдены. Выполните: npm run reset-db</p>';
            return;
        }
        
        // Загружаем все подразделы для каждой секции
        const sectionsWithSubsections = [];
        for (const section of sections) {
            console.log(`🔄 Загрузка подразделов для: ${section.name}`);
            const subsections = await api(`/api/forum/subsections/${section.id}`);
            console.log(`  ✅ Подразделы для ${section.name}:`, subsections);
            sectionsWithSubsections.push({
                ...section,
                subsections: subsections
            });
        }
        
        console.log('📊 Все данные загружены:', sectionsWithSubsections);
        renderForumSections(sectionsWithSubsections);
    } catch (error) {
        console.error('❌ Error loading forum sections:', error);
        const container = document.getElementById('forumSections');
        if (container) {
            container.innerHTML = `
                <div style="color: var(--text-secondary); padding: 2rem;">
                    <h3 style="color: #ff4444; margin-bottom: 1rem;">Ошибка загрузки форума</h3>
                    <p>Ошибка: ${error.message}</p>
                    <p style="margin-top: 1rem;">Попробуйте:</p>
                    <ol style="margin-left: 2rem;">
                        <li>Остановить сервер (Ctrl+C)</li>
                        <li>Выполнить: <code>npm run reset-db</code></li>
                        <li>Запустить: <code>npm start</code></li>
                    </ol>
                    <p style="margin-top: 1rem; font-size: 0.9rem;">Откройте консоль браузера (F12) для подробностей.</p>
                </div>
            `;
        }
    }
}

function renderForumSections(sections) {
    console.log('🎨 Рендеринг форума...');
    const container = document.getElementById('forumSections');
    
    if (!container) {
        console.error('❌ Forum container not found!');
        return;
    }
    
    container.innerHTML = '';

    if (!sections || sections.length === 0) {
        console.warn('Нет разделов для отображения');
        container.innerHTML = '<p style="color: var(--text-secondary); padding: 2rem;">Нет доступных разделов</p>';
        return;
    }

    sections.forEach((section, index) => {
        console.log(`🎨 Рендеринг раздела ${index + 1}/${sections.length}: ${section.name}`);
        console.log(`   Подразделы:`, section.subsections);
        console.log(`   Количество подразделов: ${section.subsections?.length || 0}`);
        
        const sectionElement = document.createElement('div');
        sectionElement.className = 'forum-category-section';
        
        // Проверяем subsections более детально
        let subsectionsHTML;
        if (!section.subsections) {
            console.warn(`   section.subsections is undefined для ${section.name}`);
            subsectionsHTML = '<p style="color: #ff4444; padding: 1rem; background: var(--bg-secondary);">ERROR: subsections is undefined</p>';
        } else if (section.subsections.length === 0) {
            console.warn(`   section.subsections пустой массив для ${section.name}`);
            subsectionsHTML = '<p style="color: var(--text-secondary); padding: 1rem; background: var(--bg-secondary);">Нет подразделов в этом разделе. Администратор может создать их в админ-панели.</p>';
        } else {
            console.log(`   ✅ Рендерим ${section.subsections.length} подразделов`);
            subsectionsHTML = section.subsections.map((sub, subIndex) => {
                console.log(`      ${subIndex + 1}. ${sub.name} (id: ${sub.id})`);
                
                return `
                    <div class="subsection-strip" 
                         style="display: block !important; 
                                background: #1a1a1a; 
                                padding: 1.5rem 2rem; 
                                border: 1px solid #2a2a2a;
                                margin-bottom: -1px;
                                cursor: pointer;"
                         onclick="viewSubsection(${sub.id}, '${escapeHtml(sub.name)}', '${escapeHtml(sub.description || '')}')">
                        <h4 style="font-family: 'Playfair Display', serif; font-size: 1.3rem; color: #ffffff; margin: 0 0 0.5rem 0;">${escapeHtml(sub.name)}</h4>
                        ${sub.description ? `<p style="color: #b0b0b0; font-size: 0.95rem; margin: 0 0 0.8rem 0;">${escapeHtml(sub.description)}</p>` : ''}
                        <div style="color: #b0b0b0; font-size: 0.9rem;">
                            <span style="margin-right: 2rem;">Тем: ${sub.topic_count || 0}</span>
                            <span>Сообщений: ${sub.post_count || 0}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        sectionElement.innerHTML = `
            <h2 class="forum-category-title">${escapeHtml(section.name)}</h2>
            <div class="subsections-list" style="display: block !important; width: 100%; border: 1px solid #2a2a2a; min-height: 50px; max-height: none !important; overflow: visible !important; height: auto !important;">
                ${subsectionsHTML}
            </div>
        `;
        
        container.appendChild(sectionElement);
    });
    
    console.log('✅ Forum rendered successfully');
    console.log('📊 Итого отрисовано разделов:', sections.length);
}

async function toggleSection(sectionId, header) {
    // Не используется - все отображается сразу
}

function renderSubsections(sectionId, subsections) {
    // Не используется - все отображается сразу
}

// Subsection Management (Admin)
async function loadSubsectionsManagement() {
    try {
        const sections = await api('/api/forum/sections');
        const container = document.getElementById('subsectionsManagement');
        
        container.innerHTML = '';
        
        for (const section of sections) {
            const subsections = await api(`/api/forum/subsections/${section.id}`);
            
            const sectionDiv = document.createElement('div');
            sectionDiv.style.marginBottom = '2rem';
            sectionDiv.innerHTML = `
                <h3 style="color: var(--accent-gold); margin-bottom: 1rem;">${escapeHtml(section.name)}</h3>
                <button class="btn-submit btn-small" onclick="showNewSubsectionModal(${section.id})">Добавить подраздел</button>
                <div class="category-list" style="margin-top: 1rem;">
                    ${subsections.map(sub => `
                        <div class="category-item">
                            <div class="category-info">
                                <strong>${escapeHtml(sub.name)}</strong><br>
                                <small>${escapeHtml(sub.description || '')}</small>
                            </div>
                            <div class="category-actions">
                                <button class="btn-submit btn-small" onclick="showEditSubsectionModal(${sub.id}, ${section.id}, '${escapeHtml(sub.name)}', '${escapeHtml(sub.description || '')}')">Редактировать</button>
                                <button class="btn-danger btn-small" onclick="deleteSubsection(${sub.id})">Удалить</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(sectionDiv);
        }
    } catch (error) {
        console.error('Error loading subsections management:', error);
    }
}

function showNewSubsectionModal(sectionId) {
    currentSectionId = sectionId;
    document.getElementById('editSubsectionTitle').textContent = 'Создать подраздел';
    document.getElementById('editSubsectionId').value = '';
    document.getElementById('editSubsectionSectionId').value = sectionId;
    document.getElementById('editSubsectionName').value = '';
    document.getElementById('editSubsectionDesc').value = '';
    document.getElementById('editSubsectionModal').classList.add('active');
}

function showEditSubsectionModal(id, sectionId, name, desc) {
    document.getElementById('editSubsectionTitle').textContent = 'Редактировать подраздел';
    document.getElementById('editSubsectionId').value = id;
    document.getElementById('editSubsectionSectionId').value = sectionId;
    document.getElementById('editSubsectionName').value = name;
    document.getElementById('editSubsectionDesc').value = desc;
    document.getElementById('editSubsectionModal').classList.add('active');
}

async function handleEditSubsection(e) {
    e.preventDefault();
    
    const id = document.getElementById('editSubsectionId').value;
    const sectionId = document.getElementById('editSubsectionSectionId').value;
    const name = document.getElementById('editSubsectionName').value;
    const description = document.getElementById('editSubsectionDesc').value;

    try {
        if (id) {
            // Edit existing
            await api(`/api/forum/subsections/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ name, description })
            });
        } else {
            // Create new
            await api('/api/forum/subsections', {
                method: 'POST',
                body: JSON.stringify({ sectionId, name, description })
            });
        }

        closeModal('editSubsectionModal');
        await loadSubsectionsManagement();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteSubsection(id) {
    if (!confirm('Удалить этот подраздел? Все темы в нём также будут удалены!')) return;
    
    try {
        await api(`/api/forum/subsections/${id}`, { method: 'DELETE' });
        await loadSubsectionsManagement();
    } catch (error) {
        alert(error.message);
    }
}

// Subsection View
async function viewSubsection(id, name, description) {
    currentSubsectionId = id;
    topicOffset = 0;
    
    // Сохраняем состояние
    localStorage.setItem('currentPage', 'forum');
    localStorage.setItem('currentSubsection', JSON.stringify({ id, name, description }));
    
    document.getElementById('subsectionTitle').textContent = name;
    
    // Показываем описание только если оно есть
    const descElement = document.getElementById('subsectionDescription');
    if (description && description.trim()) {
        descElement.textContent = description;
        descElement.style.display = 'block';
    } else {
        descElement.style.display = 'none';
    }
    
    document.getElementById('forumContainer').style.display = 'none';
    document.getElementById('subsectionView').style.display = 'block';
    
    await loadTopics(id, 0, topicSort);
}

async function loadTopics(subsectionId, offset = 0, sort = 'updated') {
    try {
        const data = await api(`/api/forum/topics/${subsectionId}?offset=${offset}&limit=20&sort=${sort}`);
        
        if (offset === 0) {
            document.getElementById('topicsContainer').innerHTML = '';
        }
        
        renderTopics(data.topics, offset > 0);
        
        if (data.hasMore) {
            document.getElementById('loadMoreContainer').style.display = 'block';
        } else {
            document.getElementById('loadMoreContainer').style.display = 'none';
        }
        
        topicOffset = offset + data.topics.length;
    } catch (error) {
        console.error('Error loading topics:', error);
    }
}

function renderTopics(topics, append = false) {
    const container = document.getElementById('topicsContainer');
    
    if (!append) {
        container.innerHTML = '';
    }
    
    if (topics.length === 0 && !append) {
        container.innerHTML = '<div class="subsection-item"><div class="subsection-name">Нет тем в этом подразделе</div></div>';
        return;
    }

    topics.forEach(topic => {
        const date = new Date(topic.created_at);
        const dateStr = date.toLocaleDateString('ru-RU');
        
        const topicElement = document.createElement('div');
        topicElement.className = `topic-item-card ${topic.is_pinned ? 'pinned' : ''} ${topic.is_locked ? 'locked' : ''}`;
        topicElement.onclick = () => viewTopic(topic.id);
        
        // Иконки статуса темы
        let statusIcons = '';
        if (topic.is_pinned) statusIcons += '<span class="topic-icon pinned-icon">★</span>';
        if (topic.is_locked) statusIcons += '<span class="topic-icon locked-icon">⚿</span>';
        
        topicElement.innerHTML = `
            <div class="topic-item-info">
                <h3>${statusIcons}${escapeHtml(topic.title)}</h3>
                <div class="topic-item-meta">
                    Автор: @${escapeHtml(topic.author_username)} • ${dateStr}
                </div>
            </div>
            <div class="topic-item-stats">
                <div>Ответов: ${topic.reply_count || 0}</div>
                <div>Просмотров: ${topic.views}</div>
            </div>
        `;
        
        container.appendChild(topicElement);
    });
}

function loadMoreTopics() {
    loadTopics(currentSubsectionId, topicOffset, topicSort);
}

function showNewTopicModal() {
    if (!currentUser) {
        alert('Пожалуйста, войдите в систему');
        return;
    }
    
    // Показываем информацию о лимите только обычным пользователям
    const limitInfo = document.getElementById('topicLimitInfo');
    if (currentUser.role === 'user') {
        limitInfo.style.display = 'block';
        // Можно добавить запрос для отображения текущего количества тем
        checkTopicLimit();
    } else {
        limitInfo.style.display = 'none';
    }
    
    document.getElementById('newTopicModal').classList.add('active');
}

async function checkTopicLimit() {
    if (currentUser.role !== 'user') return;
    
    try {
        // Получаем темы пользователя за последнюю неделю
        const response = await api(`/api/users/${currentUser.username}/topic-count`);
        const limitInfo = document.getElementById('topicLimitInfo');
        
        if (response.count >= 5) {
            limitInfo.innerHTML = 'Вы достигли лимита: 5/5 тем за неделю';
            limitInfo.style.color = '#ff4444';
        } else {
            limitInfo.innerHTML = `Создано тем за неделю: ${response.count}/5`;
            limitInfo.style.color = 'var(--text-secondary)';
        }
    } catch (error) {
        console.error('Error checking topic limit:', error);
    }
}

async function handleNewTopic(e) {
    e.preventDefault();
    
    const title = document.getElementById('topicTitle').value;

    try {
        const topic = await api('/api/forum/topics', {
            method: 'POST',
            body: JSON.stringify({ subsectionId: currentSubsectionId, title })
        });

        closeModal('newTopicModal');
        document.getElementById('newTopicForm').reset();
        await viewTopic(topic.id);
    } catch (error) {
        alert(error.message);
    }
}

function backToForum() {
    localStorage.removeItem('currentSubsection');
    localStorage.removeItem('currentTopic');
    document.getElementById('subsectionView').style.display = 'none';
    document.getElementById('forumContainer').style.display = 'block';
}

// Topic View
async function viewTopic(topicId) {
    currentTopicId = topicId;
    
    // Сохраняем состояние
    localStorage.setItem('currentTopic', topicId);
    
    try {
        const data = await api(`/api/forum/posts/${topicId}`);
        renderTopic(data.topic, data.posts);
        
        document.getElementById('subsectionView').style.display = 'none';
        document.getElementById('topicView').style.display = 'block';
    } catch (error) {
        console.error('Error loading topic:', error);
    }
}

function renderTopic(topic, posts) {
    // Сохраняем информацию о подразделе для навигации
    if (topic.subsection_id && topic.subsection_name) {
        currentSubsectionId = topic.subsection_id;
        localStorage.setItem('currentSubsection', JSON.stringify({
            id: topic.subsection_id,
            name: topic.subsection_name,
            description: ''
        }));
    }
    
    document.getElementById('topicBreadcrumb').innerHTML = `
        <a href="#" onclick="backToForum(); return false;">Форум</a> / 
        <a href="#" onclick="backToSubsection(); return false;">${escapeHtml(topic.subsection_name || 'Подраздел')}</a> / 
        ${escapeHtml(topic.title)}
    `;
    
    document.getElementById('topicViewTitle').textContent = topic.title;
    
    const date = new Date(topic.created_at);
    const metaHTML = `
        Создано @${escapeHtml(topic.author_username)} • ${date.toLocaleString('ru-RU')}
        ${topic.is_pinned ? ' • <span class="topic-badge topic-pinned">Закреплено</span>' : ''}
        ${topic.is_locked ? ' • <span class="topic-badge topic-locked">Закрыто</span>' : ''}
    `;
    
    // Добавляем кнопки модерации для модераторов и админов
    let moderationButtons = '';
    if (currentUser && (currentUser.role === 'moderator' || currentUser.role === 'admin')) {
        moderationButtons = `
            <div class="topic-moderation-buttons">
                <button class="btn-moderation" onclick="togglePinTopic(${topic.id}, ${topic.is_pinned})">
                    ${topic.is_pinned ? 'Открепить' : 'Закрепить'}
                </button>
                <button class="btn-moderation" onclick="toggleLockTopic(${topic.id}, ${topic.is_locked})">
                    ${topic.is_locked ? 'Открыть' : 'Закрыть'}
                </button>
            </div>
        `;
    }
    
    document.getElementById('topicViewMeta').innerHTML = metaHTML + moderationButtons;

    // Show admin controls
    if (currentUser && currentUser.role === 'admin') {
        document.getElementById('topicAdminControls').style.display = 'block';
    } else {
        document.getElementById('topicAdminControls').style.display = 'none';
    }

    const container = document.getElementById('postsContainer');
    const roleNames = { admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' };
    
    container.innerHTML = posts.map(post => {
        const postDate = new Date(post.created_at);
        const editedText = post.edited_at ? ` (изменено ${new Date(post.edited_at).toLocaleString('ru-RU')})` : '';
        
        // Генерируем аватар
        let avatarHTML;
        if (post.author_avatar && post.author_avatar.startsWith('/uploads/')) {
            avatarHTML = `<img src="${post.author_avatar}" alt="${post.author_username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            avatarHTML = post.author_username[0].toUpperCase();
        }
        
        // Обрабатываем упоминания
        const processedContent = processMentions(post.content);
        
        // Кнопки действий
        let actionButtons = '';
        if (currentUser) {
            // Кнопка цитирования доступна всем
            actionButtons += `<button class="btn-small" onclick="quotePost(${post.id}, '${escapeHtml(post.author_username)}', \`${post.content.replace(/`/g, '\\`')}\`)">Цитировать</button>`;
            
            // Кнопка редактирования для автора или модераторов
            if (currentUser.id === post.author_id || currentUser.role === 'moderator' || currentUser.role === 'admin') {
                actionButtons += `<button class="btn-small" onclick="startEditPost(${post.id}, \`${post.content.replace(/`/g, '\\`')}\`)">Редактировать</button>`;
            }
            
            // Кнопка удаления только для модераторов
            if (currentUser.role === 'moderator' || currentUser.role === 'admin') {
                actionButtons += `<button class="btn-danger btn-small" onclick="deletePost(${post.id})">Удалить</button>`;
            }
        }
        
        return `
            <div class="post-item" data-post-id="${post.id}">
                <div class="post-author-info">
                    <div class="post-author-avatar">${avatarHTML}</div>
                    <div class="post-author-name" style="cursor: pointer;" onclick="viewProfile('${escapeHtml(post.author_username)}')">${escapeHtml(post.author_username)}</div>
                    <div class="post-author-role role-${post.author_role}">${roleNames[post.author_role]}</div>
                </div>
                <div class="post-content-area">
                    <div class="post-content">${processedContent}</div>
                    <div class="post-meta">
                        <span>${postDate.toLocaleString('ru-RU')}${editedText}</span>
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Show reply form if user is logged in and topic is not locked
    if (currentUser && (!topic.is_locked || currentUser.role === 'moderator' || currentUser.role === 'admin')) {
        document.getElementById('replyForm').style.display = 'block';
        if (replyEditor) {
            replyEditor.setContents([]);
        }
    } else if (topic.is_locked && currentUser) {
        document.getElementById('replyForm').style.display = 'none';
        // Можно показать сообщение что тема закрыта
    } else {
        document.getElementById('replyForm').style.display = 'none';
    }
}

async function submitReply() {
    if (!currentUser) {
        alert('Пожалуйста, войдите в систему');
        return;
    }
    
    const content = replyEditor.root.innerHTML;
    
    if (!content || content === '<p><br></p>') {
        alert('Введите текст сообщения');
        return;
    }

    try {
        await api('/api/forum/posts', {
            method: 'POST',
            body: JSON.stringify({ topicId: currentTopicId, content })
        });

        replyEditor.setContents([]);
        await viewTopic(currentTopicId);
    } catch (error) {
        alert(error.message);
    }
}

async function deletePost(postId) {
    if (!confirm('Удалить это сообщение?')) return;
    
    try {
        await api(`/api/forum/posts/${postId}`, { method: 'DELETE' });
        await viewTopic(currentTopicId);
    } catch (error) {
        alert(error.message);
    }
}

async function togglePinTopic(topicId, currentlyPinned) {
    const action = currentlyPinned ? 'открепить' : 'закрепить';
    if (!confirm(`Вы уверены, что хотите ${action} эту тему?`)) return;
    
    try {
        await api(`/api/forum/topics/${topicId}/pin`, { method: 'POST' });
        await viewTopic(topicId);
    } catch (error) {
        alert(error.message);
    }
}

async function toggleLockTopic(topicId, currentlyLocked) {
    const action = currentlyLocked ? 'открыть' : 'закрыть';
    if (!confirm(`Вы уверены, что хотите ${action} эту тему?`)) return;
    
    try {
        await api(`/api/forum/topics/${topicId}/lock`, { method: 'POST' });
        await viewTopic(topicId);
    } catch (error) {
        alert(error.message);
    }
}

function editTopic() {
    api(`/api/forum/topics/${currentTopicId}`)
        .then(topic => {
            document.getElementById('editTopicTitle').value = topic.title;
            document.getElementById('editTopicPinned').checked = topic.is_pinned;
            document.getElementById('editTopicLocked').checked = topic.is_locked;
            document.getElementById('editTopicModal').classList.add('active');
        });
}

async function handleEditTopic(e) {
    e.preventDefault();
    
    const title = document.getElementById('editTopicTitle').value;
    const is_pinned = document.getElementById('editTopicPinned').checked ? 1 : 0;
    const is_locked = document.getElementById('editTopicLocked').checked ? 1 : 0;

    try {
        await api(`/api/forum/topics/${currentTopicId}`, {
            method: 'PUT',
            body: JSON.stringify({ title, is_pinned, is_locked })
        });

        closeModal('editTopicModal');
        await viewTopic(currentTopicId);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteTopic() {
    if (!confirm('Удалить эту тему?')) return;
    
    try {
        await api(`/api/forum/topics/${currentTopicId}`, { method: 'DELETE' });
        backToSubsection();
    } catch (error) {
        alert(error.message);
    }
}

function backToSubsection() {
    localStorage.removeItem('currentTopic');
    document.getElementById('topicView').style.display = 'none';
    document.getElementById('subsectionView').style.display = 'block';
    loadTopics(currentSubsectionId, 0, topicSort);
}

// Profile View
async function viewProfile(username) {
    try {
        const user = await api(`/api/users/${username}`);
        renderProfile(user);
        
        // Сохраняем состояние
        localStorage.setItem('currentPage', 'profile');
        localStorage.setItem('currentProfile', username);
        localStorage.removeItem('currentSubsection');
        localStorage.removeItem('currentTopic');
        
        // Hide other views
        document.getElementById('newsFeed').style.display = 'none';
        document.getElementById('forumContainer').style.display = 'none';
        document.getElementById('subsectionView').style.display = 'none';
        document.getElementById('topicView').style.display = 'none';
        document.getElementById('profileView').style.display = 'block';
        
        // Hide admin panel
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) adminPanel.style.display = 'none';
    } catch (error) {
        alert('Пользователь не найден');
    }
}

function renderProfile(user) {
    const avatarElement = document.getElementById('profileAvatar');
    
    // Отображаем аватар если есть, иначе первую букву
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
        avatarElement.innerHTML = `<img src="${user.avatar}" alt="${user.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
        avatarElement.textContent = user.username[0].toUpperCase();
        avatarElement.innerHTML = user.username[0].toUpperCase();
    }
    
    document.getElementById('profileUsername').textContent = user.username;
    
    const roleNames = { admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' };
    document.getElementById('profileRole').textContent = roleNames[user.role];
    
    const joinedDate = new Date(user.created_at);
    document.getElementById('profileJoined').textContent = joinedDate.toLocaleDateString('ru-RU');
    
    document.getElementById('profileTopics').textContent = user.stats.topics;
    document.getElementById('profilePosts').textContent = user.stats.posts;
    
    document.getElementById('profileBioText').textContent = user.bio || 'Информация не указана';
    
    // Show edit section if viewing own profile
    if (currentUser && currentUser.username === user.username) {
        document.getElementById('profileEditSection').style.display = 'block';
        document.getElementById('profileEditBio').value = user.bio || '';
    } else {
        document.getElementById('profileEditSection').style.display = 'none';
        // Добавляем кнопку отправки сообщения для чужих профилей
        addMessageButtonToProfile(user.username);
    }
}

// Функция загрузки аватара
async function uploadAvatar(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    
    // Проверка размера (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимум 5MB');
        input.value = '';
        return;
    }
    
    // Проверка типа
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert('Неподдерживаемый формат. Используйте JPEG, PNG, GIF или WebP');
        input.value = '';
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        const response = await fetch('/api/users/avatar', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка загрузки');
        }
        
        const data = await response.json();
        alert('Аватар успешно загружен!');
        
        // Обновляем данные пользователя и профиль
        await checkAuth();
        if (currentUser) {
            await viewProfile(currentUser.username);
        }
        
        input.value = ''; // Очищаем input
    } catch (error) {
        alert('Ошибка загрузки аватара: ' + error.message);
        input.value = '';
    }
}

async function deleteAvatar() {
    if (!confirm('Вы уверены, что хотите удалить аватар?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/users/avatar', {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка удаления');
        }
        
        alert('Аватар успешно удалён!');
        
        // Обновляем данные пользователя и профиль
        await checkAuth();
        if (currentUser) {
            await viewProfile(currentUser.username);
        }
        
    } catch (error) {
        alert('Ошибка удаления аватара: ' + error.message);
    }
}

async function handleProfileEdit(e) {
    e.preventDefault();
    
    const bio = document.getElementById('profileEditBio').value;

    try {
        await api('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ bio })
        });

        alert('Профиль обновлен');
        await viewProfile(currentUser.username);
    } catch (error) {
        alert(error.message);
    }
}

function backFromProfile() {
    localStorage.removeItem('currentProfile');
    document.getElementById('profileView').style.display = 'none';
    switchPage(currentView);
}

// Admin Functions
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    
    const tabButton = Array.from(document.querySelectorAll('.admin-tab')).find(b => b.textContent.toLowerCase().includes(tab));
    if (tabButton) tabButton.classList.add('active');
    
    const contentMap = {
        'news': 'adminTabNews',
        'categories': 'adminTabCategories',
        'subsections': 'adminTabSubsections',
        'users': 'adminTabUsers',
        'modlog': 'adminTabModlog'
    };
    
    const contentId = contentMap[tab];
    if (contentId) {
        document.getElementById(contentId).classList.add('active');
    }
    
    if (tab === 'users') {
        loadUsers();
    } else if (tab === 'modlog') {
        loadModLog();
    } else if (tab === 'subsections') {
        loadSubsectionsManagement();
    }
}

async function loadUsers() {
    try {
        const users = await api('/api/admin/users');
        renderUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsers(users) {
    const container = document.getElementById('userList');
    container.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-info">
                <strong>${escapeHtml(user.username)}</strong> (${escapeHtml(user.email)})
                <br>
                <small>Роль: ${user.role} | Статус: ${user.banned ? 'Заблокирован' : 'Активен'}</small>
            </div>
            <div class="user-actions">
                ${currentUser.role === 'admin' ? `
                    <select onchange="changeUserRole(${user.id}, this.value)" style="padding: 0.4rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-subtle);">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                        <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Модератор</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                    </select>
                ` : ''}
                ${user.banned ? `
                    <button class="btn-submit btn-small" onclick="unbanUser(${user.id})">Разблокировать</button>
                ` : `
                    <button class="btn-danger btn-small" onclick="banUser(${user.id})">Заблокировать</button>
                `}
            </div>
        </div>
    `).join('');
}

async function changeUserRole(userId, role) {
    try {
        await api(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role })
        });
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function banUser(userId) {
    const reason = prompt('Причина блокировки:');
    if (!reason) return;
    
    try {
        await api('/api/moderation/ban', {
            method: 'POST',
            body: JSON.stringify({ userId, reason })
        });
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function unbanUser(userId) {
    try {
        await api('/api/moderation/unban', {
            method: 'POST',
            body: JSON.stringify({ userId })
        });
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function loadModLog() {
    try {
        const logs = await api('/api/moderation/log');
        renderModLog(logs);
    } catch (error) {
        console.error('Error loading mod log:', error);
    }
}

function renderModLog(logs) {
    const container = document.getElementById('modLogList');
    const actionNames = {
        delete_topic: 'Удаление темы',
        delete_post: 'Удаление сообщения',
        ban_user: 'Блокировка пользователя',
        unban_user: 'Разблокировка пользователя'
    };
    
    container.innerHTML = logs.map(log => {
        const date = new Date(log.created_at);
        return `
            <div class="user-item">
                <div class="user-info">
                    <strong>${actionNames[log.action] || log.action}</strong>
                    <br>
                    <small>
                        Модератор: @${escapeHtml(log.moderator_username)} | 
                        ${date.toLocaleString('ru-RU')}
                        ${log.reason ? ` | Причина: ${escapeHtml(log.reason)}` : ''}
                    </small>
                </div>
            </div>
        `;
    }).join('');
}

// ========== PRIVATE MESSAGES ==========

let currentMessagesTab = 'inbox';

async function checkUnreadMessages() {
    try {
        const data = await api('/api/messages/unread/count');
        const badge = document.getElementById('unreadBadge');
        
        if (data.count > 0) {
            badge.textContent = data.count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking unread messages:', error);
    }
}

function switchMessagesTab(tab) {
    currentMessagesTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.messages-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Hide message detail
    document.getElementById('messageDetail').style.display = 'none';
    document.querySelector('.messages-container').style.display = 'block';
    
    loadMessages(tab);
}

async function loadMessages(tab) {
    try {
        const endpoint = tab === 'inbox' ? '/api/messages/inbox' : '/api/messages/sent';
        const data = await api(endpoint);
        
        // Update counts
        if (tab === 'inbox') {
            document.getElementById('inboxCount').textContent = `(${data.total})`;
        } else {
            document.getElementById('sentCount').textContent = `(${data.total})`;
        }
        
        renderMessages(data.messages, tab);
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function renderMessages(messages, tab) {
    const container = document.getElementById('messagesList');
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет сообщений</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const date = new Date(msg.created_at);
        const isUnread = tab === 'inbox' && !msg.is_read;
        const correspondent = tab === 'inbox' ? msg.sender_username : msg.recipient_username;
        
        return `
            <div class="message-item ${isUnread ? 'unread' : ''}" onclick="viewMessage(${msg.id})">
                <div class="message-header">
                    <strong>${escapeHtml(msg.subject)}</strong>
                    <span class="message-date">${date.toLocaleString('ru-RU')}</span>
                </div>
                <div class="message-meta">
                    ${tab === 'inbox' ? 'От' : 'Кому'}: @${escapeHtml(correspondent)}
                </div>
            </div>
        `;
    }).join('');
}

async function viewMessage(messageId) {
    try {
        const message = await api(`/api/messages/${messageId}`);
        
        const date = new Date(message.created_at);
        const isInbox = message.recipient_id === currentUser.id;
        
        document.getElementById('messageDetailContent').innerHTML = `
            <div class="message-full">
                <div class="message-full-header">
                    <h2>${escapeHtml(message.subject)}</h2>
                    <div class="message-full-meta">
                        <div>
                            <strong>От:</strong> 
                            <a href="#" onclick="viewProfile('${escapeHtml(message.sender_username)}'); return false;">
                                @${escapeHtml(message.sender_username)}
                            </a>
                        </div>
                        <div>
                            <strong>Кому:</strong> 
                            <a href="#" onclick="viewProfile('${escapeHtml(message.recipient_username)}'); return false;">
                                @${escapeHtml(message.recipient_username)}
                            </a>
                        </div>
                        <div><strong>Дата:</strong> ${date.toLocaleString('ru-RU')}</div>
                    </div>
                </div>
                <div class="message-full-content">
                    ${escapeHtml(message.content).replace(/\n/g, '<br>')}
                </div>
                <div class="message-actions">
                    ${isInbox ? `
                        <button class="btn-submit" onclick="replyToMessage('${escapeHtml(message.sender_username)}', 'Re: ${escapeHtml(message.subject).replace(/'/g, "\\'")}')">
                            Ответить
                        </button>
                    ` : ''}
                    <button class="btn-danger" onclick="deleteMessage(${messageId})">
                        Удалить
                    </button>
                </div>
            </div>
        `;
        
        document.querySelector('.messages-container').style.display = 'none';
        document.getElementById('messageDetail').style.display = 'block';
        
        // Обновляем счетчик непрочитанных
        if (isInbox) {
            checkUnreadMessages();
        }
        
    } catch (error) {
        alert('Ошибка загрузки сообщения: ' + error.message);
    }
}

function backToMessagesList() {
    document.getElementById('messageDetail').style.display = 'none';
    document.querySelector('.messages-container').style.display = 'block';
    loadMessages(currentMessagesTab);
}

function showNewMessageModal(recipient = '', subject = '') {
    if (!currentUser) {
        alert('Пожалуйста, войдите в систему');
        return;
    }
    
    document.getElementById('messageRecipient').value = recipient;
    document.getElementById('messageSubject').value = subject;
    document.getElementById('messageContent').value = '';
    document.getElementById('messageError').style.display = 'none';
    
    document.getElementById('newMessageModal').classList.add('active');
}

function replyToMessage(recipient, subject) {
    backToMessagesList();
    setTimeout(() => {
        showNewMessageModal(recipient, subject);
    }, 100);
}

async function handleNewMessage(e) {
    e.preventDefault();
    
    const recipientUsername = document.getElementById('messageRecipient').value.trim();
    const subject = document.getElementById('messageSubject').value.trim();
    const content = document.getElementById('messageContent').value.trim();
    
    try {
        await api('/api/messages', {
            method: 'POST',
            body: JSON.stringify({ recipientUsername, subject, content })
        });
        
        closeModal('newMessageModal');
        document.getElementById('newMessageForm').reset();
        
        // Переключаемся на вкладку отправленных
        switchPage('messages');
        setTimeout(() => {
            const sentTab = document.querySelectorAll('.messages-tab')[1];
            sentTab.click();
        }, 100);
        
        alert('Сообщение отправлено!');
    } catch (error) {
        document.getElementById('messageError').textContent = error.message;
        document.getElementById('messageError').style.display = 'block';
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Удалить это сообщение?')) return;
    
    try {
        await api(`/api/messages/${messageId}`, { method: 'DELETE' });
        backToMessagesList();
        alert('Сообщение удалено');
    } catch (error) {
        alert('Ошибка удаления: ' + error.message);
    }
}

// Добавляем кнопку "Отправить сообщение" в профили других пользователей
function addMessageButtonToProfile(username) {
    if (!currentUser || currentUser.username === username) return;
    
    const profileHeader = document.querySelector('.profile-header');
    if (!profileHeader) return;
    
    // Проверяем, есть ли уже кнопка
    if (profileHeader.querySelector('.btn-send-message')) return;
    
    const button = document.createElement('button');
    button.className = 'btn-submit btn-send-message';
    button.textContent = 'Отправить сообщение';
    button.onclick = () => showNewMessageModal(username, '');
    button.style.marginTop = '1rem';
    
    profileHeader.appendChild(button);
}

// ========== PASSWORD MANAGEMENT ==========

function openForgotPasswordModal() {
    closeModal('loginModal');
    document.getElementById('forgotPasswordEmail').value = '';
    document.getElementById('forgotPasswordError').style.display = 'none';
    document.getElementById('forgotPasswordSuccess').style.display = 'none';
    document.getElementById('forgotPasswordModal').classList.add('active');
}

function openChangePasswordModal() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('changePasswordError').style.display = 'none';
    document.getElementById('changePasswordSuccess').style.display = 'none';
    document.getElementById('changePasswordModal').classList.add('active');
}

async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('forgotPasswordEmail').value;
    const errorDiv = document.getElementById('forgotPasswordError');
    const successDiv = document.getElementById('forgotPasswordSuccess');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.textContent = 'Если email существует в системе, письмо с инструкциями отправлено на указанный адрес.';
            successDiv.style.display = 'block';
            document.getElementById('forgotPasswordForm').reset();
        } else {
            errorDiv.textContent = data.error || 'Произошла ошибка';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения с сервером';
        errorDiv.style.display = 'block';
    }
}

async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Новые пароли не совпадают';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.textContent = 'Пароль успешно изменён!';
            successDiv.style.display = 'block';
            document.getElementById('changePasswordForm').reset();
            
            setTimeout(() => {
                closeModal('changePasswordModal');
            }, 2000);
        } else {
            errorDiv.textContent = data.error || 'Произошла ошибка';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения с сервером';
        errorDiv.style.display = 'block';
    }
}

// ========== SEARCH ==========

function openSearchModal() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchModal').classList.add('active');
    
    // Focus на поле поиска
    setTimeout(() => {
        document.getElementById('searchInput').focus();
    }, 100);
}

async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    try {
        const data = await api(`/api/search?query=${encodeURIComponent(query)}`);
        renderSearchResults(data);
    } catch (error) {
        resultsDiv.innerHTML = '<p style="color: #ff4444;">Ошибка поиска</p>';
    }
}

function renderSearchResults(data) {
    const resultsDiv = document.getElementById('searchResults');
    const { topics, posts, users } = data;
    
    if (topics.length === 0 && posts.length === 0 && users.length === 0) {
        resultsDiv.innerHTML = '<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">Ничего не найдено</p>';
        return;
    }
    
    let html = '';
    
    // Темы
    if (topics.length > 0) {
        html += '<div class="search-section"><h3>Темы</h3>';
        topics.forEach(topic => {
            html += `
                <div class="search-result-item" onclick="viewTopicFromSearch(${topic.id}); return false;">
                    <strong>${escapeHtml(topic.title)}</strong>
                    <div class="search-meta">В подразделе: ${escapeHtml(topic.subsection_name)} • Автор: @${escapeHtml(topic.author_username)}</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Посты
    if (posts.length > 0) {
        html += '<div class="search-section"><h3>Сообщения</h3>';
        posts.forEach(post => {
            // Обрезаем контент для превью
            const preview = post.content.replace(/<[^>]*>/g, '').substring(0, 150) + '...';
            html += `
                <div class="search-result-item" onclick="viewTopicFromSearch(${post.topic_id}); return false;">
                    <div class="search-meta">Тема: ${escapeHtml(post.topic_title)}</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(preview)}</div>
                    <div class="search-meta">Автор: @${escapeHtml(post.author_username)}</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Пользователи
    if (users.length > 0) {
        html += '<div class="search-section"><h3>Пользователи</h3>';
        users.forEach(user => {
            const roleNames = { admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' };
            html += `
                <div class="search-result-item" onclick="viewProfileFromSearch('${escapeHtml(user.username)}'); return false;">
                    <strong>@${escapeHtml(user.username)}</strong>
                    <div class="search-meta">${roleNames[user.role]}</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    resultsDiv.innerHTML = html;
}

function viewTopicFromSearch(topicId) {
    closeModal('searchModal');
    viewTopic(topicId);
}

function viewProfileFromSearch(username) {
    closeModal('searchModal');
    viewProfile(username);
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========== POST EDITING ==========

let editingPostId = null;
let editingPostEditor = null;

function startEditPost(postId, currentContent) {
    if (editingPostId) {
        cancelEditPost(editingPostId);
    }
    
    editingPostId = postId;
    
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    if (!postElement) return;
    
    const contentDiv = postElement.querySelector('.post-content');
    const actionsDiv = postElement.querySelector('.post-meta');
    
    // Сохраняем оригинальный контент
    contentDiv.dataset.originalContent = contentDiv.innerHTML;
    
    // Создаём редактор
    const editorContainer = document.createElement('div');
    editorContainer.id = `edit-editor-${postId}`;
    editorContainer.style.minHeight = '200px';
    contentDiv.innerHTML = '';
    contentDiv.appendChild(editorContainer);
    
    editingPostEditor = new Quill(`#edit-editor-${postId}`, {
        theme: 'snow',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ]
        }
    });
    
    editingPostEditor.root.innerHTML = currentContent;
    
    // Добавляем кнопки сохранения/отмены
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'edit-post-buttons';
    buttonsDiv.innerHTML = `
        <button class="btn-submit" onclick="saveEditPost(${postId})">Сохранить</button>
        <button class="btn-cancel" onclick="cancelEditPost(${postId})">Отмена</button>
    `;
    actionsDiv.parentNode.insertBefore(buttonsDiv, actionsDiv);
    actionsDiv.style.display = 'none';
}

async function saveEditPost(postId) {
    if (!editingPostEditor) return;
    
    const content = editingPostEditor.root.innerHTML;
    
    if (!content || content === '<p><br></p>') {
        alert('Содержимое поста не может быть пустым');
        return;
    }
    
    try {
        await api(`/api/forum/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
        
        // Обновляем тему
        await viewTopic(currentTopicId);
        editingPostId = null;
        editingPostEditor = null;
    } catch (error) {
        alert('Ошибка сохранения: ' + error.message);
    }
}

function cancelEditPost(postId) {
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    if (!postElement) return;
    
    const contentDiv = postElement.querySelector('.post-content');
    const buttonsDiv = postElement.querySelector('.edit-post-buttons');
    const actionsDiv = postElement.querySelector('.post-meta');
    
    // Восстанавливаем оригинальный контент
    if (contentDiv.dataset.originalContent) {
        contentDiv.innerHTML = contentDiv.dataset.originalContent;
    }
    
    // Удаляем кнопки
    if (buttonsDiv) {
        buttonsDiv.remove();
    }
    
    // Показываем обычные действия
    if (actionsDiv) {
        actionsDiv.style.display = 'block';
    }
    
    editingPostId = null;
    editingPostEditor = null;
}

// ========== MENTIONS (@username) ==========

function processMentions(content) {
    // Подсвечиваем упоминания @username
    return content.replace(/@(\w+)/g, '<span class="mention" onclick="viewProfile(\'$1\'); event.stopPropagation();">@$1</span>');
}

// ========== QUOTE POST ==========

function quotePost(postId, authorUsername, content) {
    // Очищаем HTML теги для цитаты
    const plainText = content.replace(/<[^>]*>/g, '').substring(0, 200);
    
    const quoteHTML = `
        <blockquote>
            <strong>@${escapeHtml(authorUsername)} писал(а):</strong><br>
            ${escapeHtml(plainText)}${plainText.length >= 200 ? '...' : ''}
        </blockquote>
        <p><br></p>
    `;
    
    // Добавляем цитату в редактор
    if (replyEditor) {
        const currentContent = replyEditor.root.innerHTML;
        replyEditor.root.innerHTML = quoteHTML + (currentContent !== '<p><br></p>' ? currentContent : '');
        
        // Прокручиваем к форме ответа
        document.getElementById('replyForm').scrollIntoView({ behavior: 'smooth' });
        
        // Фокус на редактор
        setTimeout(() => {
            replyEditor.focus();
        }, 300);
    }
}

// ========== IMAGE PREVIEW ==========

function setupImageUploadPreview() {
    // Ищем все Quill редакторы и добавляем обработчик загрузки изображений
    const editors = [newsEditor, topicEditor, replyEditor, editingPostEditor].filter(e => e);
    
    editors.forEach(editor => {
        if (!editor) return;
        
        const toolbar = editor.getModule('toolbar');
        if (toolbar) {
            toolbar.handlers['image'] = function() {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');
                input.click();
                
                input.onchange = async () => {
                    const file = input.files[0];
                    if (!file) return;
                    
                    // Проверка размера (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        alert('Размер изображения не должен превышать 5MB');
                        return;
                    }
                    
                    // Показываем превью загрузки
                    const range = editor.getSelection(true);
                    editor.insertText(range.index, 'Загрузка изображения...');
                    
                    // Читаем файл как base64
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        // Удаляем текст загрузки
                        editor.deleteText(range.index, 'Загрузка изображения...'.length);
                        
                        // Вставляем изображение
                        editor.insertEmbed(range.index, 'image', e.target.result);
                        editor.setSelection(range.index + 1);
                    };
                    reader.readAsDataURL(file);
                };
            };
        }
    });
}

// Вызываем при инициализации редакторов
// Это нужно вызывать после создания каждого Quill редактора

