// CU Orbit Web Portal Core Logic
const API_BASE = '/api';
let currentUser = null;
let activeContainerId = 'general';
let pollingInterval = null;

// UI Elements
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const channelList = document.getElementById('channel-list');
const dmList = document.getElementById('dm-list');
const messageContainer = document.getElementById('message-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

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
    loadHomeFeed();
}

// --- HOME FEED ---
async function loadHomeFeed() {
    const workspaceId = '5d91e97d-66dc-4eaf-969f-17aaeb151924'; // Default CU Orbit ID
    try {
        const res = await fetch(`${API_BASE}/home/${currentUser.phone}/${workspaceId}`);
        const data = await res.json();

        renderSidebar(data);
    } catch (e) { console.error(e); }
}

function renderSidebar(data) {
    channelList.innerHTML = '';
    data.channels.forEach(ch => {
        const div = document.createElement('div');
        div.className = `px-4 py-1.5 flex items-center space-x-3 cursor-pointer hover:bg-slate-800 ${activeContainerId === ch.id ? 'bg-slate-700 font-bold' : 'text-slate-400'}`;
        div.innerHTML = `<span class="w-4 text-center">#</span> <span>${ch.name}</span>`;
        div.onclick = () => switchChat(ch.id, `# ${ch.name}`);
        channelList.appendChild(div);
    });

    dmList.innerHTML = '';
    data.dms.forEach(dm => {
        const div = document.createElement('div');
        div.className = `px-4 py-1.5 flex items-center space-x-3 cursor-pointer hover:bg-slate-800 ${activeContainerId === dm.id ? 'bg-slate-700 font-bold' : 'text-slate-400'}`;
        div.innerHTML = `<span class="w-2 h-2 rounded-full ${dm.presence === 'online' ? 'bg-green-500' : 'bg-slate-500'}"></span> <span>${dm.other_user_name}</span>`;
        div.onclick = () => switchChat(dm.id, dm.other_user_name);
        dmList.appendChild(div);
    });
}

// --- CHAT ---
function switchChat(id, title) {
    activeContainerId = id;
    document.getElementById('chat-title').innerText = title;
    messageContainer.innerHTML = '<div class="flex-1"></div>';
    loadMessages();

    // Start Polling
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
    try {
        const res = await fetch(`${API_BASE}/messages/${activeContainerId}`);
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) { console.error(e); }
}

function renderMessages(messages) {
    const isAtBottom = messageContainer.scrollHeight - messageContainer.scrollTop <= messageContainer.clientHeight + 100;

    // Efficiently render only if count changed or first load
    messageContainer.innerHTML = '<div class="flex-1"></div>';

    messages.forEach(msg => {
        const isSelf = msg.sender_id === currentUser.phone;
        const div = document.createElement('div');
        div.className = 'group flex items-start space-x-4 hover:bg-white/[0.02] -mx-6 px-6 py-2';

        div.innerHTML = `
            <img src="/ic_person.xml" class="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 object-cover mt-1">
            <div class="flex-1 min-w-0">
                <div class="flex items-baseline space-x-2">
                    <span class="font-bold text-[#38bdf8]">${isSelf ? 'You' : msg.sender_name}</span>
                    <span class="text-[10px] text-slate-500">${new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p class="text-slate-300 leading-relaxed break-words">${formatMessageBody(msg.text)}</p>
            </div>
        `;
        messageContainer.appendChild(div);
    });

    if (isAtBottom) messageContainer.scrollTop = messageContainer.scrollHeight;
}

function formatMessageBody(text) {
    if (!text) return '';
    // Basic mention highlighting
    return text.replace(/@(\w+)/g, '<span class="text-[#38bdf8] font-bold cursor-pointer hover:underline">@$1</span>');
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const payload = {
        senderId: currentUser.phone,
        senderName: currentUser.name,
        body: text,
        channelId: activeContainerId,
        type: 'text'
    };

    try {
        await fetch(`${API_BASE}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        messageInput.value = '';
        messageInput.rows = 1;
        sendButton.disabled = true;
        sendButton.classList.add('opacity-50', 'cursor-not-allowed');
        loadMessages();
    } catch (e) { console.error(e); }
}

// --- HELPERS ---
messageInput.oninput = () => {
    const hasValue = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasValue;
    sendButton.classList.toggle('opacity-50', !hasValue);
    sendButton.classList.toggle('cursor-not-allowed', !hasValue);

    // Auto-resize
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
};

// Init
const saved = localStorage.getItem('orbit_user');
if (saved) {
    currentUser = JSON.parse(saved);
    showDashboard();
} else {
    authView.classList.remove('hidden');
}
