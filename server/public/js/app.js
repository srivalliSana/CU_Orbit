// CU Orbit Web Portal Core Logic
const API_BASE = '/api';
const DEFAULT_WORKSPACE_ID = '5d91e97d-66dc-4eaf-969f-17aaeb151924';
let currentUser = null;
let activeContainerId = 'general';
let pollingInterval = null;
let typingInterval = null;

// UI Elements
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const channelList = document.getElementById('channel-list');
const dmList = document.getElementById('dm-list');
const messageContainer = document.getElementById('message-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatTitle = document.getElementById('chat-title');
const chatSubtitle = document.getElementById('chat-subtitle');

// --- AUTH ---
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    if (!email) return alert('Please enter your email');

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success && data.user) {
            currentUser = data.user;
            localStorage.setItem('orbit_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            alert('User not found. Please register on the mobile app.');
        }
    } catch (e) { console.error(e); }
}

function handleLogout() {
    localStorage.removeItem('orbit_user');
    location.reload();
}

function showDashboard() {
    authView.classList.add('hidden');
    mainView.classList.remove('hidden');
    document.getElementById('user-name').innerText = currentUser.name;

    // Set user avatar
    const avatarImg = document.getElementById('user-avatar');
    if (currentUser.avatarUrl) {
        avatarImg.src = getAbsoluteUrl(currentUser.avatarUrl);
    } else {
        avatarImg.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(currentUser.name) + "&background=random";
    }

    loadHomeFeed();
}

// --- HOME FEED ---
async function loadHomeFeed() {
    try {
        const res = await fetch(`${API_BASE}/home/${currentUser.phone}/${DEFAULT_WORKSPACE_ID}`);
        const data = await res.json();
        renderSidebar(data);
    } catch (e) { console.error(e); }
}

function renderSidebar(data) {
    channelList.innerHTML = '';
    data.channels.forEach(ch => {
        const div = document.createElement('div');
        const isActive = activeContainerId === ch.id;
        div.className = `px-4 py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-800 rounded-md mx-2 ${isActive ? 'bg-slate-700 font-bold text-white' : 'text-slate-400'}`;

        let badgeHtml = '';
        if (ch.has_unread_mention) {
            badgeHtml = `<span class="bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full">@</span>`;
        } else if (ch.unread_count > 0) {
            badgeHtml = `<span class="bg-blue-500 text-white text-[10px] font-bold px-1.5 rounded-full">${ch.unread_count}</span>`;
        }

        div.innerHTML = `
            <div class="flex items-center space-x-3 truncate">
                <span class="w-4 text-center text-slate-500 font-normal">#</span>
                <span class="truncate">${ch.name}</span>
            </div>
            ${badgeHtml}
        `;
        div.onclick = () => switchChat(ch.id, `# ${ch.name}`, `${ch.member_count} members`);
        channelList.appendChild(div);
    });

    dmList.innerHTML = '';
    data.dms.forEach(dm => {
        const div = document.createElement('div');
        const isActive = activeContainerId === dm.id;
        div.className = `px-4 py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-800 rounded-md mx-2 ${isActive ? 'bg-slate-700 font-bold text-white' : 'text-slate-400'}`;

        let badgeHtml = '';
        if (dm.unread_count > 0) {
            badgeHtml = `<span class="bg-blue-500 text-white text-[10px] font-bold px-1.5 rounded-full">${dm.unread_count}</span>`;
        }

        div.innerHTML = `
            <div class="flex items-center space-x-3 truncate">
                <span class="w-2 h-2 rounded-full ${dm.presence === 'online' ? 'bg-green-500' : 'bg-slate-500'}"></span>
                <span class="truncate">${dm.other_user_name}</span>
            </div>
            ${badgeHtml}
        `;
        div.onclick = () => switchChat(dm.id, dm.other_user_name, dm.presence);
        dmList.appendChild(div);
    });
}

// --- CHAT ---
function switchChat(id, title, subtitle) {
    activeContainerId = id;
    chatTitle.innerText = title;
    chatSubtitle.innerText = subtitle;
    messageInput.placeholder = `Message ${title}`;
    messageContainer.innerHTML = '<div class="flex-1"></div>';

    // Reset input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
    sendButton.classList.add('opacity-50', 'cursor-not-allowed');

    loadMessages();
    markAsRead();

    // Start Polling
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        loadMessages();
        loadTypingStatus();
    }, 3000);
}

async function loadMessages() {
    try {
        const res = await fetch(`${API_BASE}/messages/${activeContainerId}`);
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) { console.error(e); }
}

async function markAsRead() {
    try {
        await fetch(`${API_BASE}/mentions/read-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.phone, containerId: activeContainerId })
        });
        loadHomeFeed();
    } catch (e) { console.error(e); }
}

function renderMessages(messages) {
    const isAtBottom = messageContainer.scrollHeight - messageContainer.scrollTop <= messageContainer.clientHeight + 100;

    // Group messages by date
    let lastDate = null;
    let html = '<div class="flex-1"></div>';

    messages.forEach(msg => {
        const msgDate = new Date(msg.sent_at).toLocaleDateString();
        if (msgDate !== lastDate) {
            html += `<div class="flex items-center my-4">
                <div class="flex-1 h-px bg-slate-800"></div>
                <div class="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">${msgDate === new Date().toLocaleDateString() ? 'Today' : msgDate}</div>
                <div class="flex-1 h-px bg-slate-800"></div>
            </div>`;
            lastDate = msgDate;
        }

        const isSelf = normalizePhone(msg.sender_id) === normalizePhone(currentUser.phone);
        const avatarUrl = msg.sender_avatar_url ? getAbsoluteUrl(msg.sender_avatar_url) : "https://ui-avatars.com/api/?name=" + encodeURIComponent(msg.sender_name) + "&background=random";

        html += `
            <div class="group flex items-start space-x-4 hover:bg-white/[0.02] -mx-6 px-6 py-2 transition-colors">
                <img src="${avatarUrl}" class="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 object-cover mt-1 flex-shrink-0">
                <div class="flex-1 min-w-0">
                    <div class="flex items-baseline space-x-2">
                        <span class="font-bold ${isSelf ? 'text-blue-400' : 'text-slate-200'} hover:underline cursor-pointer">${isSelf ? 'You' : msg.sender_name}</span>
                        <span class="text-[10px] text-slate-500">${new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="text-slate-300 leading-relaxed break-words whitespace-pre-wrap">${formatMessageBody(msg.text, msg.enriched_mentions)}</div>
                    ${renderAttachments(msg.attachments)}
                </div>
            </div>
        `;
    });

    messageContainer.innerHTML = html;

    if (isAtBottom) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
}

function renderAttachments(attachments) {
    if (!attachments || attachments.length === 0) return '';
    let html = '<div class="mt-2 flex flex-wrap gap-2">';
    attachments.forEach(att => {
        const url = getAbsoluteUrl(att.url);
        if (att.type === 'image') {
            html += `<img src="${url}" onclick="window.open('${url}')" class="max-w-sm max-h-80 rounded-lg border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity shadow-lg">`;
        } else {
            html += `<a href="${url}" target="_blank" class="flex items-center space-x-3 bg-slate-800 p-3 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
                <i class="fa-solid fa-file text-blue-400 text-xl"></i>
                <div class="text-sm">
                    <div class="font-medium text-slate-200">${att.filename || 'Attachment'}</div>
                    <div class="text-xs text-slate-500 uppercase">Click to download</div>
                </div>
            </a>`;
        }
    });
    html += '</div>';
    return html;
}

function formatMessageBody(text, mentions) {
    if (!text) return '';
    let formatted = text;

    // Highlight mentions from metadata if available
    if (mentions && mentions.length > 0) {
        mentions.forEach(m => {
            const tag = `@${m.display_name}`;
            const regex = new RegExp(tag, 'g');
            formatted = formatted.replace(regex, `<span class="text-blue-400 font-bold px-1 rounded bg-blue-400/10 cursor-pointer hover:bg-blue-400/20">@${m.display_name}</span>`);
        });
    } else {
        // Fallback simple highlighting
        formatted = formatted.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold px-1 rounded bg-blue-400/10 cursor-pointer hover:bg-blue-400/20">@$1</span>');
    }

    return formatted;
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const payload = {
        senderId: currentUser.phone,
        senderName: currentUser.name,
        body: text,
        channelId: activeContainerId,
        type: 'text',
        senderAvatarUrl: currentUser.avatarUrl
    };

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 403) {
            alert("Only admins can send messages in this channel.");
            return;
        }

        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendButton.disabled = true;
        sendButton.classList.add('opacity-50', 'cursor-not-allowed');
        loadMessages();
        loadHomeFeed();
    } catch (e) { console.error(e); }
}

// --- TYPING ---
async function loadTypingStatus() {
    try {
        const res = await fetch(`${API_BASE}/channels/${activeContainerId}/typing`);
        const typing = await res.json();
        const otherTyping = typing.filter(t => normalizePhone(t.userId) !== normalizePhone(currentUser.phone));

        const indicator = document.getElementById('typing-indicator');
        if (otherTyping.length > 0) {
            const names = otherTyping.map(t => t.userName).join(', ');
            chatSubtitle.innerHTML = `<span class="text-blue-400 italic font-medium">${names} ${otherTyping.length === 1 ? 'is' : 'are'} typing...</span>`;
        } else {
            // Restore original subtitle (needs to be tracked)
        }
    } catch (e) {}
}

async function notifyTyping() {
    try {
        await fetch(`${API_BASE}/channels/${activeContainerId}/typing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.phone, userName: currentUser.name })
        });
    } catch (e) {}
}

// --- UTILS ---
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d]/g, '').slice(-10);
}

function getAbsoluteUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const base = window.location.origin;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

// --- HANDLERS ---
messageInput.oninput = () => {
    const hasValue = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasValue;
    sendButton.classList.toggle('opacity-50', !hasValue);
    sendButton.classList.toggle('cursor-not-allowed', !hasValue);

    // Auto-resize
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';

    // Notify Typing
    if (activeContainerId && !activeContainerId.includes('_')) {
        notifyTyping();
    }
};

messageInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
};

// Init
const saved = localStorage.getItem('orbit_user');
if (saved) {
    currentUser = JSON.parse(saved);
    showDashboard();
} else {
    authView.classList.remove('hidden');
}
