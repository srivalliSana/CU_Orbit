const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// UTILS
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d]/g, '').slice(-10);
}

// TRAFFIC LOGGER
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// STATIC FOLDERS
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// FILE UPLOAD SETUP
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// MYSQL CONNECTION
const dbConfig = {
    name: process.env.DB_NAME || 'cu_orbit',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || '@123456Valli',
    host: process.env.DB_HOST || 'localhost',
    port: 3306
};

const sequelize = new Sequelize(dbConfig.name, dbConfig.user, dbConfig.pass, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false,
    dialectOptions: { connectTimeout: 10000 },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
});

// MODELS

const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    phone: { type: DataTypes.STRING, unique: true },
    name: DataTypes.STRING,
    handle: { type: DataTypes.STRING, unique: true },
    email: DataTypes.STRING,
    avatarUrl: { type: DataTypes.STRING, defaultValue: '' },
    bio: { type: DataTypes.TEXT, defaultValue: 'Hey there! I am using CU Orbit.' },
    status_emoji: { type: DataTypes.STRING, defaultValue: '✨' },
    status_text: { type: DataTypes.STRING, defaultValue: '' },
    presence: { type: DataTypes.ENUM('online', 'away', 'dnd', 'offline'), defaultValue: 'online' }
});

const Workspace = sequelize.define('Workspace', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, unique: true },
    icon_url: { type: DataTypes.STRING, defaultValue: '' },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    member_count: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const Channel = sequelize.define('Channel', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspace_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('public', 'private'), defaultValue: 'public' },
    topic: { type: DataTypes.STRING, defaultValue: '' },
    member_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    pinned_message_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_muted: { type: DataTypes.BOOLEAN, defaultValue: false },
    invite_code: { type: DataTypes.STRING, unique: true },
    created_by: { type: DataTypes.STRING, allowNull: true },
    restricted_messaging: { type: DataTypes.BOOLEAN, defaultValue: false },
    info_edit_restricted: { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_required: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const ChannelMember = sequelize.define('ChannelMember', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'member'), defaultValue: 'member' }
});

const ConversationPref = sequelize.define('ConversationPref', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    containerId: { type: DataTypes.STRING, allowNull: false },
    isPinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    isMuted: { type: DataTypes.BOOLEAN, defaultValue: false },
    isHidden: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.STRING, allowNull: true },
    dm_id: { type: DataTypes.STRING, allowNull: true },
    senderId: { type: DataTypes.STRING, allowNull: false },
    senderName: { type: DataTypes.STRING },
    senderAvatarUrl: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('text', 'image', 'voice', 'file', 'system'), defaultValue: 'text' },
    attachments: { type: DataTypes.JSON, defaultValue: [] },
    reactions: { type: DataTypes.JSON, defaultValue: [] },
    thread_reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: 'sent' },
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() },
    edited_at: { type: DataTypes.DATE, allowNull: true }
});

const Mention = sequelize.define('Mention', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    mentioned_user_id: { type: DataTypes.STRING, allowNull: false },
    source_channel_id: { type: DataTypes.STRING, allowNull: false },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Thread = sequelize.define('Thread', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    parent_message_id: { type: DataTypes.UUID, allowNull: false },
    channel_id: { type: DataTypes.STRING, allowNull: false },
    participant_ids: { type: DataTypes.JSON, defaultValue: [] },
    reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    has_unread: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_reply_at: { type: DataTypes.BIGINT }
});

const Release = sequelize.define('Release', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version: { type: DataTypes.STRING, allowNull: false },
    build_number: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING, allowNull: false },
    release_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

const Status = sequelize.define('Status', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: DataTypes.STRING,
    mediaUrl: { type: DataTypes.STRING, allowNull: false },
    caption: { type: DataTypes.TEXT, defaultValue: '' },
    type: { type: DataTypes.STRING, defaultValue: 'image' },
    mentions: { type: DataTypes.JSON, defaultValue: [] },
    expiresAt: { type: DataTypes.DATE }
});

const TypingStatus = sequelize.define('TypingStatus', {
    channelId: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.STRING, primaryKey: true },
    userName: { type: DataTypes.STRING },
    lastTypedAt: { type: DataTypes.BIGINT }
});

// Relationships
Workspace.hasMany(Channel, { foreignKey: 'workspace_id', as: 'channels' });
Channel.belongsTo(Workspace, { foreignKey: 'workspace_id' });
Channel.hasMany(ChannelMember, { foreignKey: 'channelId', as: 'members' });

Message.hasMany(Mention, { foreignKey: 'message_id', as: 'mentions' });
Mention.belongsTo(Message, { foreignKey: 'message_id' });
Mention.belongsTo(User, { foreignKey: 'mentioned_user_id', targetKey: 'phone', as: 'user' });

// SYNC
sequelize.authenticate()
    .then(async () => {
        await sequelize.sync({ alter: true });
        console.log('✅ MySQL Connected & Schema Synced');

        const [ws] = await Workspace.findOrCreate({
            where: { slug: 'cu-orbit' },
            defaults: { name: 'CU Orbit', slug: 'cu-orbit' }
        });

        const [genChannel] = await Channel.findOrCreate({
            where: { name: 'general', workspace_id: ws.id },
            defaults: {
                name: 'general', workspace_id: ws.id, type: 'public',
                invite_code: crypto.randomBytes(4).toString('hex'), created_by: 'system'
            }
        });

        const users = await User.findAll();
        for (const u of users) {
            await ChannelMember.findOrCreate({
                where: { channelId: genChannel.id, userId: u.phone },
                defaults: { channelId: genChannel.id, userId: u.phone, role: 'member' }
            });
        }
    })
    .catch(err => console.warn('⚠️ MySQL Offline:', err.message));

// --- NOTIFICATION ROUTER SIMULATION ---
async function routeMentionNotification(user, message) {
    console.log(`\n--- 🔔 MENTION NOTIFICATION ---`);
    console.log(`TO: ${user.name} (${user.phone})`);
    console.log(`BODY: @${message.senderName} mentioned you in a message!`);
    console.log(`MESSAGE: "${message.body}"`);
    console.log(`-------------------------------\n`);
}

// --- LANDING PAGE & APK DOWNLOAD ---
const packageJson = require('./package.json');

app.get('/', async (req, res) => {
    const userAgent = req.get('User-Agent');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // Detailed OS Detection for Web
    let osName = "Web Device";
    if (userAgent.indexOf("Win") != -1) osName = "Windows PC";
    if (userAgent.indexOf("Mac") != -1) osName = "macOS Device";
    if (userAgent.indexOf("Linux") != -1) osName = "Linux System";

    const history = await Release.findAll({ order: [['build_number', 'DESC']] });

    if (req.query.download === 'true') {
        const release = await Release.findOne({ where: { version: req.query.v } }) || history[0];
        const apkPath = path.join(__dirname, 'downloads', release ? release.filename : 'cu_orbit.apk');
        return res.download(apkPath, release ? release.filename : 'CU_Orbit.apk');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CU Orbit | University Messaging</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                body { background: #0f172a; color: white; font-family: 'Inter', sans-serif; }
                .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
            </style>
        </head>
        <body class="min-h-screen flex items-center justify-center p-4">
            <div class="glass max-w-2xl w-full rounded-3xl p-8 shadow-2xl text-center">
                <div class="flex justify-center mb-6">
                    <div class="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <i class="fa-solid fa-satellite-dish text-4xl text-white"></i>
                    </div>
                </div>

                <h1 class="text-5xl font-bold text-blue-400 mb-2">CU Orbit</h1>
                <p class="text-slate-400 text-lg mb-8">The official professional messaging platform for our university.<br>
                <span class="text-xs font-mono uppercase tracking-widest text-slate-500">Detected: ${osName}</span></p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <button onclick="showHistory()" class="bg-blue-500 hover:bg-blue-600 text-slate-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition-all">
                        <i class="fa-brands fa-android text-2xl"></i>
                        <span>Get for Android</span>
                    </button>
                    <button onclick="alert('iOS version will come soon! Stay tuned.')" class="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition-all opacity-80">
                        <i class="fa-brands fa-apple text-2xl"></i>
                        <span>Get for iOS</span>
                    </button>
                </div>

                <a href="/portal" class="inline-block text-blue-400 hover:text-blue-300 font-semibold mb-8 underline underline-offset-4">Continue in Web Portal</a>

                <div class="border-t border-slate-800 pt-6 text-left">
                    <h3 class="text-xs font-bold text-slate-500 mb-4 uppercase tracking-tighter">Latest Features</h3>
                    <ul class="text-sm text-slate-300 space-y-2">
                        <li><i class="fa-solid fa-check text-green-500 mr-2"></i> WhatsApp-style Channel Controls</li>
                        <li><i class="fa-solid fa-check text-green-500 mr-2"></i> Multi-word @Mention pills</li>
                        <li><i class="fa-solid fa-check text-green-500 mr-2"></i> Real-time Seen Status synchronization</li>
                    </ul>
                </div>
            </div>

            <!-- Version History Modal -->
            <div id="history-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 hidden">
                <div class="bg-[#1e293b] w-full max-w-md rounded-3xl p-8 border border-slate-700">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-blue-400">Android Downloads</h2>
                        <i onclick="hideHistory()" class="fa-solid fa-times text-slate-500 cursor-pointer hover:text-white p-2"></i>
                    </div>
                    <div class="space-y-3">
                        ${history.map(r => `
                            <a href="/?download=true&v=${r.version}" class="flex items-center justify-between p-4 bg-[#0f172a] rounded-xl hover:ring-2 hover:ring-blue-500/50 transition-all">
                                <div>
                                    <div class="font-bold text-white">v${r.version}</div>
                                    <div class="text-[10px] text-slate-500">Build ${r.build_number} | ${new Date(r.release_date).toLocaleDateString()}</div>
                                </div>
                                <i class="fa-solid fa-download text-blue-400"></i>
                            </a>
                        `).join('')}
                        ${history.length === 0 ? '<p class="text-slate-500 text-center">No releases found. Upload cu_orbit.apk to server.</p>' : ''}
                    </div>
                </div>
            </div>

            <script>
                function showHistory() { document.getElementById('history-modal').classList.remove('hidden'); }
                function hideHistory() { document.getElementById('history-modal').classList.add('hidden'); }
            </script>
        </body>
        </html>
    `);
});

// Add a route to register new releases (used by Gradle automation)
app.post('/api/system/register-release', async (req, res) => {
    try {
        const { version, build_number, filename } = req.body;
        const release = await Release.create({ version, build_number, filename });
        res.json({ success: true, release });
    } catch (e) { res.status(500).json(e); }
});

// Web Portal Route
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROUTES ---

// AUTH
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, phone } = req.body;
        let user;
        if (email) {
            user = await User.findOne({ where: { email: email } });
        } else if (phone) {
            const normalized = normalizePhone(phone);
            user = await User.findAll().then(users => users.find(u => normalizePhone(u.phone) === normalized));
        }

        if (user) {
            const gen = await Channel.findOne({ where: { name: 'general' } });
            if (gen) {
                await ChannelMember.findOrCreate({
                    where: { channelId: gen.id, userId: user.phone },
                    defaults: { role: 'member' }
                });
            }
        }
        res.json({ success: true, isNewUser: !user, user });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, phone, email, avatarUrl, bio } = req.body;
        const handle = name.toLowerCase().replace(/\s+/g, '_') + '_' + phone.slice(-4);
        let user = await User.findOne({ where: { [Op.or]: [{ email }, { phone }] } });
        if (user) {
            user.name = name;
            user.phone = phone;
            user.avatarUrl = avatarUrl || user.avatarUrl;
            user.bio = bio || user.bio;
            await user.save();
        } else {
            user = await User.create({ name, phone, email, avatarUrl, bio, handle });
        }
        const gen = await Channel.findOne({ where: { name: 'general' } });
        if (gen) {
            await ChannelMember.create({ channelId: gen.id, userId: phone, role: 'member' });
            await gen.increment('member_count');
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// HOME FEED
app.get('/api/home/:userId/:workspaceId', async (req, res) => {
    try {
        const { userId, workspaceId } = req.params;
        const memberships = await ChannelMember.findAll({ where: { userId: userId } });
        const channelIds = memberships.map(m => m.channelId);
        const channels = await Channel.findAll({ where: { workspace_id: workspaceId, id: { [Op.in]: channelIds } } });
        const channelsData = await Promise.all(channels.map(async (ch) => {
            const pref = await ConversationPref.findOne({ where: { userId, containerId: ch.id } });
            if (pref && pref.isHidden) return null;
            const lastMsg = await Message.findOne({ where: { channelId: ch.id }, order: [['timestamp', 'DESC']] });
            const unreadCount = await Message.count({ where: { channelId: ch.id, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } } });
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: ch.id, is_read: false } }) > 0;
            return {
                ...ch.get({ plain: true }),
                is_muted: pref ? pref.isMuted : !!ch.is_muted,
                is_pinned: pref ? pref.isPinned : false,
                last_message_preview: lastMsg ? {
                    sender_id: lastMsg.senderId,
                    sender_name: lastMsg.senderName,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type,
                    sender_is_self: normalizePhone(lastMsg.senderId) === normalizePhone(userId)
                } : null,
                unread_count: unreadCount,
                has_unread_mention: hasUnreadMention
            };
        }));
        const users = await User.findAll({ where: { phone: { [Op.ne]: userId } } });
        const dms = await Promise.all(users.map(async (u) => {
            const dmId = userId < u.phone ? `${userId}_${u.phone}` : `${u.phone}_${userId}`;
            const pref = await ConversationPref.findOne({ where: { userId, containerId: dmId } });
            const lastMsg = await Message.findOne({ where: { dm_id: dmId }, order: [['timestamp', 'DESC']] });
            if (pref && pref.isHidden && !lastMsg) return null;
            if (pref && pref.isHidden && lastMsg && lastMsg.timestamp < pref.updatedAt) return null;
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: dmId, is_read: false } }) > 0;
            return {
                id: dmId,
                other_user_id: u.phone,
                other_user_name: u.name,
                other_user_avatar_url: u.avatarUrl,
                presence: u.presence,
                is_pinned: pref ? pref.isPinned : false,
                is_muted: pref ? pref.isMuted : false,
                unread_count: await Message.count({ where: { dm_id: dmId, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } } }),
                has_unread_mention: hasUnreadMention,
                last_message_preview: lastMsg ? {
                    sender_is_self: normalizePhone(lastMsg.senderId) === normalizePhone(userId),
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type
                } : null
            };
        }));
        res.json({
            channels: channelsData.filter(c => c !== null).sort((a,b) => (b.is_pinned - a.is_pinned)),
            dms: dms.filter(d => d !== null).sort((a,b) => (b.is_pinned - a.is_pinned))
        });
    } catch (e) {
        console.error('[HOME-FEED-ERROR]', e);
        res.status(500).json({ channels: [], dms: [] });
    }
});

app.get('/api/home/quick-access/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const mentions = await Mention.count({ where: { mentioned_user_id: userId, is_read: false } });
        res.json({ threads: 0, mentions, drafts: 0 });
    } catch (e) {
        res.json({ threads: 0, mentions: 0, drafts: 0 });
    }
});

// PREFS
app.post('/api/conversations/:id/prefs', async (req, res) => {
    try {
        const { userId, action, value } = req.body;
        const containerId = req.params.id;
        const isTrue = (value === 'true' || value === true);
        const [pref] = await ConversationPref.findOrCreate({
            where: { userId, containerId },
            defaults: { userId, containerId, isPinned: false, isMuted: false, isHidden: false }
        });
        if (action === 'pin') pref.isPinned = isTrue;
        if (action === 'mute') pref.isMuted = isTrue;
        if (action === 'hide') pref.isHidden = isTrue;
        if (action === 'delete' && isTrue) pref.isHidden = true;
        await pref.save();
        res.json({ success: true, pref });
    } catch (e) {
        console.error('[PREF-ERROR]', e);
        res.status(500).json(e);
    }
});

// MESSAGES
app.get('/api/messages/:containerId', async (req, res) => {
    try {
        const { containerId } = req.params;
        const messages = await Message.findAll({
            where: { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }] },
            order: [['timestamp', 'ASC']],
            include: [{
                model: Mention,
                as: 'mentions',
                include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone'] }]
            }]
        });
        res.json(messages.map(m => ({
            id: m.id,
            channel_id: m.channelId,
            dm_id: m.dm_id,
            sender_id: m.senderId,
            sender_name: m.senderName,
            sender_avatar_url: m.senderAvatarUrl,
            text: m.body,
            sent_at: m.timestamp,
            type: m.type,
            attachments: m.attachments || [],
            reactions: m.reactions || [],
            status: m.status,
            enriched_mentions: (m.mentions || []).map(mn => ({
                user_id: mn.user ? mn.user.id : '',
                display_name: mn.user ? mn.user.name : '',
                phone: mn.mentioned_user_id
            }))
        })));
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, senderName, body, channelId, type, senderAvatarUrl, mediaUrl, mentions, enrichedMentions } = req.body;
        if (channelId && !channelId.includes('_')) {
             const ch = await Channel.findByPk(channelId);
             if (ch && ch.restricted_messaging) {
                 const member = await ChannelMember.findOne({ where: { channelId, userId: senderId } });
                 if (member && member.role !== 'admin') {
                     return res.status(403).json({ error: 'Only admins can send messages' });
                 }
             }
        }
        const msg = await Message.create({
            senderId, senderName, body, channelId, type: type || 'text',
            senderAvatarUrl, dm_id: (channelId && channelId.includes('_')) ? channelId : null,
            attachments: mediaUrl ? [{ type: type, url: mediaUrl }] : []
        });
        const mentionedIds = new Set();
        if (enrichedMentions && Array.isArray(enrichedMentions)) {
            for (const mData of enrichedMentions) { mentionedIds.add(mData.phone); }
        }
        if (body && (body.toLowerCase().includes('@all') || body.toLowerCase().includes('@everyone'))) {
            const members = await ChannelMember.findAll({ where: { channelId: channelId } });
            for (const member of members) {
                if (normalizePhone(member.userId) !== normalizePhone(senderId)) { mentionedIds.add(member.userId); }
            }
        }
        if (mentionedIds.size === 0 && body && body.includes('@')) {
            const members = await ChannelMember.findAll({ where: { channelId } });
            for (const m of members) {
                if (normalizePhone(m.userId) === normalizePhone(senderId)) continue;
                const user = await User.findOne({ where: { phone: m.userId } });
                if (user && body.toLowerCase().includes(`@${user.name.toLowerCase()}`)) { mentionedIds.add(user.phone); }
                else if (user && user.handle && body.toLowerCase().includes(`@${user.handle.toLowerCase()}`)) { mentionedIds.add(user.phone); }
            }
        }
        for (const uid of mentionedIds) {
            await Mention.findOrCreate({
                where: { message_id: msg.id, mentioned_user_id: uid },
                defaults: { source_channel_id: channelId, is_read: false }
            });
            const user = await User.findOne({ where: { phone: uid } });
            if (user) routeMentionNotification(user, msg);
        }
        res.json(msg);
    } catch (e) {
        console.error('[MSG-ERROR]', e);
        res.status(500).json(e);
    }
});

app.put('/api/messages/:id', async (req, res) => {
    try {
        const { body, status } = req.body;
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if (body) msg.body = body;
        if (status) msg.status = status;
        await msg.save();
        res.json(msg);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/mentions/:userId', async (req, res) => {
    try {
        const mentions = await Mention.findAll({ where: { mentioned_user_id: req.params.userId }, order: [['createdAt', 'DESC']] });
        const results = await Promise.all(mentions.map(async (m) => {
            const msg = await Message.findByPk(m.message_id);
            if (!msg) return null;
            let sourceName = 'Channel';
            if (m.source_channel_id.includes('_')) sourceName = 'Direct Message';
            else {
                const ch = await Channel.findByPk(m.source_channel_id);
                if (ch) sourceName = `#${ch.name}`;
            }
            return {
                id: m.id, message_id: m.message_id, sender_id: msg.senderId, sender_name: msg.senderName,
                text: msg.body, sent_at: msg.timestamp, channel_id: m.source_channel_id, channel_name: sourceName, is_read: m.is_read
            };
        }));
        res.json(results.filter(r => r !== null));
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/mentions/read-all', async (req, res) => {
    try {
        const { userId, containerId } = req.body;
        await Mention.update({ is_read: true }, { where: { mentioned_user_id: userId, source_channel_id: containerId } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/mentions/:id/read', async (req, res) => {
    try {
        const mention = await Mention.findByPk(req.params.id);
        if (mention) { mention.is_read = true; await mention.save(); }
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

// STATUS
app.get('/api/status', async (req, res) => {
    try { res.json(await Status.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.json([]); }
});

app.post('/api/status', async (req, res) => {
    try {
        const { userId, userName, type, mediaUrl, caption, mentions } = req.body;
        const status = await Status.create({
            userId, userName, type, mediaUrl, caption, mentions: mentions || [],
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        if (mentions && Array.isArray(mentions)) {
            for (const uid of mentions) { await Mention.create({ message_id: status.id, mentioned_user_id: uid, source_channel_id: 'STATUS', is_read: false }); }
        }
        res.json(status);
    } catch (e) { res.status(500).json(e); }
});

// USERS
app.get('/api/users', async (req, res) => {
    try { res.json(await User.findAll()); } catch (e) { res.json([]); }
});

app.get('/api/users/:identifier', async (req, res) => {
    try {
        const user = await User.findOne({ where: { [Op.or]: [{ phone: req.params.identifier }, { id: req.params.identifier }] } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) { res.status(500).json(e); }
});

app.put('/api/users/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ where: { phone: req.params.phone } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { name, bio, avatarUrl, status_emoji, status_text } = req.body;
        if (name) user.name = name;
        if (bio) user.bio = bio;
        if (avatarUrl) user.avatarUrl = avatarUrl;
        if (status_emoji) user.status_emoji = status_emoji;
        if (status_text) user.status_text = status_text;
        await user.save();
        res.json({ success: true, user });
    } catch (e) { res.status(500).json(e); }
});

// WORKSPACES
app.get('/api/workspaces', async (req, res) => {
    try { res.json(await Workspace.findAll({ include: [{ model: Channel, as: 'channels' }] })); } catch (e) { res.json([]); }
});

app.post('/api/workspaces/:workspaceId/channels', async (req, res) => {
    try {
        const { name, type, userId, description } = req.body;
        const channel = await Channel.create({
            workspace_id: req.params.workspaceId, name, type: type || 'public',
            topic: description || '', invite_code: crypto.randomBytes(4).toString('hex'), created_by: userId
        });
        if (userId) await ChannelMember.create({ channelId: channel.id, userId: userId, role: 'admin' });
        res.json(channel);
    } catch (e) { console.error(e); res.status(500).json(e); }
});

// CHANNELS
app.get('/api/channels/:id', async (req, res) => {
    try { const ch = await Channel.findByPk(req.params.id); res.json(ch); } catch (e) { res.status(500).json(e); }
});

app.put('/api/channels/:id', async (req, res) => {
    try {
        const { restricted_messaging, info_edit_restricted, approval_required, topic, name } = req.body;
        const channel = await Channel.findByPk(req.params.id);
        if (channel) {
            if (restricted_messaging !== undefined) channel.restricted_messaging = restricted_messaging;
            if (info_edit_restricted !== undefined) channel.info_edit_restricted = info_edit_restricted;
            if (approval_required !== undefined) channel.approval_required = approval_required;
            if (topic !== undefined) channel.topic = topic;
            if (name !== undefined) channel.name = name;
            await channel.save();
        }
        res.json(channel);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/channels/:id/members', async (req, res) => {
    try {
        const members = await ChannelMember.findAll({ where: { channelId: req.params.id } });
        const userPhones = members.map(m => m.userId);
        const users = await User.findAll({ where: { phone: { [Op.in]: userPhones } } });
        res.json(users.map(u => {
            const member = members.find(m => m.userId === u.phone);
            return { ...u.toJSON(), role: member.role };
        }));
    } catch (e) { res.json([]); }
});

app.post('/api/channels/:id/members', async (req, res) => {
    try {
        const { userId, role, addedBy, adderName } = req.body;
        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: req.params.id, userId: userId }, defaults: { channelId: req.params.id, userId: userId, role: role || 'member' } });
        if (created) {
            const channel = await Channel.findByPk(req.params.id);
            if (channel) await channel.increment('member_count');
            await Message.create({ channelId: req.params.id, senderId: addedBy || 'system', senderName: adderName || 'System', body: `ADD_MEMBER:${userId}`, type: 'system', timestamp: Date.now() });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.delete('/api/channels/:id/members/:userId', async (req, res) => {
    try {
        const deleted = await ChannelMember.destroy({ where: { channelId: req.params.id, userId: req.params.userId } });
        if (deleted) {
            const channel = await Channel.findByPk(req.params.id);
            if (channel) await channel.decrement('member_count');
            res.json({ success: true });
        } else { res.status(404).json({ error: 'Member not found' }); }
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/channels/join-by-link', async (req, res) => {
    try {
        const { inviteCode, userId } = req.body;
        const channel = await Channel.findOne({ where: { invite_code: inviteCode } });
        if (!channel) return res.status(404).json({ error: 'Invalid link' });
        if (channel.approval_required) { return res.json({ success: true, pendingApproval: true }); }
        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: channel.id, userId: userId }, defaults: { channelId: channel.id, userId: userId, role: 'member' } });
        if (created) {
            await channel.increment('member_count');
            await Message.create({ channelId: channel.id, senderId: userId, senderName: 'System', body: `JOIN_LINK:${userId}`, type: 'system', timestamp: Date.now() });
        }
        res.json({ success: true, channel });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/channels/:id/typing', async (req, res) => {
    try {
        const { userId, userName } = req.body;
        await TypingStatus.upsert({ channelId: req.params.id, userId, userName, lastTypedAt: Date.now() });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/channels/:id/typing', async (req, res) => {
    try {
        const fiveSecondsAgo = Date.now() - 5000;
        const typing = await TypingStatus.findAll({ where: { channelId: req.params.id, lastTypedAt: { [Op.gt]: fiveSecondsAgo } } });
        res.json(typing);
    } catch (e) { res.json([]); }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.json({ url: `/uploads/${req.file.filename}` });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 CU Orbit Server ready on port ${PORT}`));
