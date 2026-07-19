// CU ORBIT | ENTERPRISE WEB CLIENT
const API_BASE = '/api';
const DEFAULT_WORKSPACE = '5d91e97d-66dc-4eaf-969f-17aaeb151924';

let user = null;
let activeId = null;
let pollChat = null;
let directory = [];

// DOM ELEMENTS
const pages = {
    login: document.getElementById('page-login'),
    main: document.getElementById('layout-main'),
    loader: document.getElementById('global-loader')
};

const views = {
    empty: document.getElementById('view-empty'),
    chat: document.getElementById('view-chat'),
    profile: document.getElementById('view-profile')
};

// --- ROUTING SYSTEM ---
function navigateTo(target, params = null) {
    console.log('Navigating to:', target, params);

    // Reset Views
    Object.values(views).forEach(v => v.classList.add('hidden'));

    if (target === 'chat') {
        views.chat.classList.remove('hidden');
        if (params) startChat(params.id, params.title, params.subtitle);
    } else if (target === 'profile') {
        views.profile.classList.remove('hidden');
        renderProfile();
    } else {
        views.empty.classList.remove('hidden');
    }
}

// --- AUTHENTICATION ---
async function handleLogin() {
    const phone = document.getElementById('input-login-phone').value.trim();
    if (phone.length < 10) return alert('Enter a valid 10-digit number');

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.success && data.user) {
            user = data.user;
            localStorage.setItem('orbit_session', JSON.stringify(user));
            initApp();
        } else {
            alert('Number not found. Register via the mobile app first.');
        }
    } catch (e) { alert('Connection error'); }
}

function handleLogout() {
    localStorage.removeItem('orbit_session');
    location.reload();
}

// --- INITIALIZATION ---
function initApp() {
    pages.loader.classList.remove('hidden');

    const session = localStorage.getItem('orbit_session');
    if (!session) {
        pages.login.classList.remove('hidden', 'flex');
        pages.login.classList.add('flex');
        pages.main.classList.add('hidden');
        pages.loader.classList.add('opacity-0');
        setTimeout(() => pages.loader.classList.add('hidden'), 500);
        return;
    }

    user = JSON.parse(session);
    pages.login.classList.add('hidden');
    pages.main.classList.remove('hidden');

    // Update self info
    document.getElementById('me-name').innerText = user.name;
    const avatarUrl = user.avatarUrl ? getUrl(user.avatarUrl) : defaultAvatar(user.name);
    document.getElementById('me-avatar').src = avatarUrl;

    loadSidebar();
    loadDirectory();

    pages.loader.classList.add('opacity-0');
    setTimeout(() => pages.loader.classList.add('hidden'), 500);
}

// --- SIDEBAR & CHATS ---
async function loadSidebar() {
    try {
        const res = await fetch(`${API_BASE}/home/${user.phone}/${DEFAULT_WORKSPACE}`);
        const data = await res.json();

        // Render Channels
        const chList = document.getElementById('list-channels');
        chList.innerHTML = '';
        data.channels.forEach(ch => {
            const active = activeId === ch.id;
            const div = createSidebarItem('#', ch.name, ch.member_count + ' members', active, ch.unread_count, ch.has_unread_mention);
            div.onclick = () => navigateTo('chat', { id: ch.id, title: '# ' + ch.name, subtitle: ch.member_count + ' members' });
            chList.appendChild(div);
        });

        // Render DMs
        const dmList = document.getElementById('list-dms');
        dmList.innerHTML = '';
        data.dms.forEach(dm => {
            const active = activeId === dm.id;
            const div = createSidebarItem('•', dm.other_user_name, dm.presence, active, dm.unread_count, false);
            div.onclick = () => navigateTo('chat', { id: dm.id, title: dm.other_user_name, subtitle: dm.presence });
            dmList.appendChild(div);
        });
    } catch (e) {}
}

function createSidebarItem(icon, name, sub, active, unread, mention) {
    const div = document.createElement('div');
    div.className = `px-6 py-2 flex items-center justify-between cursor-pointer group transition-all ${active ? 'sidebar-item-active' : 'hover:bg-slate-800/40'}`;

    const badge = mention ? `<span class="bg-red-500 text-[10px] font-black px-1.5 rounded-md">@</span>` :
                 (unread > 0 ? `<span class="bg-blue-500 text-[10px] font-black px-1.5 rounded-md">${unread}</span>` : '');

    div.innerHTML = `
        <div class="flex items-center space-x-3 truncate">
            <span class="w-4 text-center font-bold ${active ? 'text-blue-400' : 'text-slate-600'}">${icon}</span>
            <div class="truncate">
                <div class="text-sm font-semibold truncate ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}">${name}</div>
                <div class="text-[10px] text-slate-500 uppercase tracking-tighter">${sub}</div>
            </div>
        </div>
        ${badge}
    `;
    return div;
}

// --- MESSAGING ---
function startChat(id, title, subtitle) {
    activeId = id;
    document.getElementById('chat-title').innerText = title;
    document.getElementById('chat-subtitle').innerText = subtitle;
    document.getElementById('message-container').innerHTML = '';

    loadMessages();
    markRead(id);

    if (pollChat) clearInterval(pollChat);
    pollChat = setInterval(loadMessages, 3000);
}

async function loadMessages() {
    if (!activeId) return;
    try {
        const res = await fetch(`${API_BASE}/messages/${activeId}`);
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) {}
}

function renderMessages(msgs) {
    const container = document.getElementById('message-container');
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    let html = '';
    let lastDate = '';

    msgs.forEach(m => {
        const date = new Date(m.sent_at).toLocaleDateString();
        if (date !== lastDate) {
            html += `<div class="flex justify-center my-4"><span class="system-msg-pill">${date === new Date().toLocaleDateString() ? 'TODAY' : date}</span></div>`;
            lastDate = date;
        }

        const isSelf = normalizePhone(m.sender_id) === normalizePhone(user.phone);
        const avatar = m.sender_avatar_url ? getUrl(m.sender_avatar_url) : defaultAvatar(m.sender_name);

        html += `
            <div class="flex items-start space-x-4 px-2 py-1 msg-row group">
                <img src="${avatar}" class="w-11 h-11 rounded-2xl bg-slate-800 object-cover mt-1">
                <div class="flex-1 min-w-0">
                    <div class="flex items-baseline space-x-2">
                        <span class="font-black text-sm tracking-tight ${isSelf ? 'text-blue-400' : 'text-slate-100'}">${isSelf ? 'You' : m.sender_name}</span>
                        <span class="text-[9px] font-bold text-slate-600">${new Date(m.sent_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="text-slate-300 text-md leading-relaxed whitespace-pre-wrap">${parseMentions(m.text)}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    if (isAtBottom) container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !activeId) return;

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: user.phone,
                senderName: user.name,
                body: text,
                channelId: activeId,
                senderAvatarUrl: user.avatarUrl
            })
        });

        if (res.status === 403) return alert('Admin-only channel');

        input.value = '';
        input.style.height = 'auto';
        loadMessages();
        loadSidebar();
    } catch (e) {}
}

// --- DIRECTORY ---
async function loadDirectory() {
    try {
        const res = await fetch(`${API_BASE}/users`);
        directory = await res.json();
    } catch (e) {}
}

function showContacts() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-overlay').classList.add('flex');
    document.getElementById('modal-contacts').classList.remove('hidden');
    renderContacts('');
}

function renderContacts(query) {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    const filtered = directory.filter(u => u.phone !== user.phone && u.name.toLowerCase().includes(query.toLowerCase()));

    filtered.forEach(u => {
        const div = document.createElement('div');
        div.className = 'flex items-center space-x-4 p-4 hover:bg-slate-800 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-slate-700';
        const avatar = u.avatarUrl ? getUrl(u.avatarUrl) : defaultAvatar(u.name);

        div.innerHTML = `
            <img src="${avatar}" class="w-12 h-12 rounded-2xl object-cover bg-slate-900">
            <div>
                <div class="font-bold text-white">${u.name}</div>
                <div class="text-[10px] text-slate-500 font-mono tracking-widest">${u.phone}</div>
            </div>
        `;
        div.onclick = () => {
            const dmId = user.phone < u.phone ? `${user.phone}_${u.phone}` : `${u.phone}_${user.phone}`;
            navigateTo('chat', { id: dmId, title: u.name, subtitle: u.presence });
            closeModal();
        };
        list.appendChild(div);
    });
}

// --- PROFILE ---
function renderProfile() {
    document.getElementById('prof-name').innerText = user.name;
    document.getElementById('prof-phone').innerText = user.phone;
    document.getElementById('prof-bio').innerText = user.bio || 'University Member';
    document.getElementById('prof-status-text').innerText = user.status_text || 'Active';
    document.getElementById('prof-avatar').src = user.avatarUrl ? getUrl(user.avatarUrl) : defaultAvatar(user.name);
}

// --- HELPERS ---
function getUrl(path) {
    if (path.startsWith('http')) return path;
    return window.location.origin + (path.startsWith('/') ? '' : '/') + path;
}

function defaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&bold=true&rounded=false`;
}

function normalizePhone(p) { return p ? p.replace(/[^\d]/g, '').slice(-10) : ''; }

function parseMentions(text) {
    if (!text) return '';
    return text.replace(/@(\w+)/g, '<span class="mention-pill">@$1</span>');
}

function closeModal(e) {
    if (!e || e.target === document.getElementById('modal-overlay') || e.target.classList.contains('fa-times')) {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-contacts').classList.add('hidden');
    }
}

async function markRead(id) {
    fetch(`${API_BASE}/mentions/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.phone, containerId: id })
    }).then(() => loadSidebar());
}

// HANDLERS
document.getElementById('msg-input').oninput = (e) => {
    const btn = document.getElementById('btn-send');
    const hasVal = e.target.value.trim().length > 0;
    btn.disabled = !hasVal;

    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
};

document.getElementById('msg-input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

document.getElementById('search-contacts').oninput = (e) => renderContacts(e.target.value);

// Start
initApp();
