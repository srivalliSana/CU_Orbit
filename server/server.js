const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// TRAFFIC LOGGER
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// STATIC FOLDERS
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

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
    port: process.env.DB_PORT || 3306
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
    is_muted: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const ChannelMember = sequelize.define('ChannelMember', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false }
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.STRING, allowNull: true },
    dm_id: { type: DataTypes.STRING, allowNull: true },
    senderId: { type: DataTypes.STRING, allowNull: false },
    senderName: { type: DataTypes.STRING },
    senderAvatarUrl: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('text', 'image', 'voice', 'file'), defaultValue: 'text' },
    attachments: { type: DataTypes.JSON, defaultValue: [] },
    reactions: { type: DataTypes.JSON, defaultValue: [] },
    thread_reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: 'sent' },
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() },
    edited_at: { type: DataTypes.DATE, allowNull: true }
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

const Mention = sequelize.define('Mention', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    mentioned_user_id: { type: DataTypes.STRING, allowNull: false },
    source_channel_id: { type: DataTypes.STRING, allowNull: false },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Draft = sequelize.define('Draft', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.STRING, allowNull: false },
    container_id: { type: DataTypes.STRING, allowNull: false },
    text: DataTypes.TEXT,
    updated_at: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
});

const Status = sequelize.define('Status', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: DataTypes.STRING,
    mediaUrl: { type: DataTypes.STRING, allowNull: false },
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

// SYNC
sequelize.authenticate()
    .then(async () => {
        await sequelize.sync({ alter: true });
        console.log('✅ MySQL Connected');

        const [ws] = await Workspace.findOrCreate({
            where: { slug: 'cu-orbit' },
            defaults: { name: 'CU Orbit', slug: 'cu-orbit' }
        });

        await sequelize.query(`UPDATE Channels SET workspace_id = '${ws.id}' WHERE workspace_id IS NULL OR workspace_id = '' OR workspace_id = 'null'`);
        await sequelize.query(`UPDATE Messages SET dm_id = channelId WHERE channelId LIKE '%_%' AND (dm_id IS NULL OR dm_id = '')`);

        const [oldDms] = await sequelize.query("SELECT id, channelId, senderId FROM Messages WHERE channelId NOT LIKE '%-%' AND channelId NOT LIKE '%_%' AND channelId IS NOT NULL AND channelId != ''");
        for (const msg of oldDms) {
            const p1 = msg.senderId;
            const p2 = msg.channelId;
            if (p1 && p2 && p2.length > 5 && !p2.includes('-')) {
                const dmId = p1 < p2 ? `${p1}_${p2}` : `${p2}_${p1}`;
                await sequelize.query(`UPDATE Messages SET dm_id = '${dmId}' WHERE id = '${msg.id}'`);
            }
        }

        const [genChannel] = await Channel.findOrCreate({
            where: { name: 'general', workspace_id: ws.id },
            defaults: { name: 'general', workspace_id: ws.id, type: 'public' }
        });

        const users = await User.findAll();
        for (const u of users) {
            await ChannelMember.findOrCreate({
                where: { channelId: genChannel.id, userId: u.phone },
                defaults: { channelId: genChannel.id, userId: u.phone }
            });
        }
    })
    .catch(err => console.warn('⚠️ MySQL Offline:', err.message));

// --- ROUTES ---

// AUTH
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ where: { phone: req.body.phone } });
        if (user) {
            const gen = await Channel.findOne({ where: { name: 'general' } });
            if (gen) {
                await ChannelMember.findOrCreate({
                    where: { channelId: gen.id, userId: user.phone },
                    defaults: { channelId: gen.id, userId: user.phone }
                });
            }
        }
        res.json({ success: true, isNewUser: !user, user });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const handle = req.body.name.toLowerCase().replace(/\s+/g, '_') + '_' + req.body.phone.slice(-4);
        const user = await User.create({ ...req.body, handle });
        const gen = await Channel.findOne({ where: { name: 'general' } });
        if (gen) {
            await ChannelMember.create({ channelId: gen.id, userId: user.phone });
        }
        res.json({ success: true, user });
    } catch (err) { res.status(500).json(err); }
});

// WORKSPACES
app.get('/api/workspaces', async (req, res) => {
    try { res.json(await Workspace.findAll({ include: [{ model: Channel, as: 'channels' }] })); } catch (e) { res.json([]); }
});

app.post('/api/workspaces', async (req, res) => {
    try {
        const slug = req.body.name.toLowerCase().replace(/\s+/g, '-');
        const ws = await Workspace.create({ ...req.body, slug });
        await Channel.create({ name: 'general', workspace_id: ws.id, type: 'public' });
        res.json(ws);
    } catch (e) { res.status(500).json(e); }
});

// HOME FEED
app.get('/api/home/:userId/:workspaceId', async (req, res) => {
    try {
        const { userId, workspaceId } = req.params;
        const memberships = await ChannelMember.findAll({ where: { userId: userId } });
        const channelIds = memberships.map(m => m.channelId);

        const channels = await Channel.findAll({
            where: { workspace_id: workspaceId, id: { [Op.in]: channelIds } },
            raw: true
        });

        const channelsWithPreview = await Promise.all(channels.map(async (ch) => {
            const lastMsg = await Message.findOne({
                where: { channelId: ch.id },
                order: [['timestamp', 'DESC']]
            });
            const unreadCount = await Message.count({
                where: { channelId: ch.id, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } }
            });
            return {
                ...ch,
                is_muted: !!ch.is_muted,
                last_message_preview: lastMsg ? {
                    sender_name: lastMsg.senderName,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type
                } : null,
                unread_count: unreadCount,
                has_unread_mention: false
            };
        }));

        const users = await User.findAll({ where: { phone: { [Op.ne]: userId } } });
        const dms = await Promise.all(users.map(async (u) => {
            const dmId = userId < u.phone ? `${userId}_${u.phone}` : `${u.phone}_${userId}`;
            const lastMsg = await Message.findOne({
                where: { dm_id: dmId },
                order: [['timestamp', 'DESC']]
            });
            return {
                id: dmId,
                other_user_id: u.phone,
                other_user_name: u.name,
                other_user_avatar_url: u.avatarUrl,
                presence: u.presence,
                unread_count: await Message.count({
                    where: { dm_id: dmId, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } }
                }),
                last_message_preview: lastMsg ? {
                    sender_is_self: lastMsg.senderId === userId,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type
                } : null
            };
        }));

        res.json({
            channels: channelsWithPreview,
            dms: dms
        });
    } catch (e) {
        console.error(e);
        res.status(500).json([]);
    }
});

app.get('/api/home/quick-access/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const threadUnread = await Thread.count({ where: { participant_ids: { [Op.contains]: [userId] }, has_unread: true } });
        const mentionUnread = await Mention.count({ where: { mentioned_user_id: userId, is_read: false } });
        const draftCount = await Draft.count({ where: { user_id: userId } });
        res.json({ threads: threadUnread, mentions: mentionUnread, drafts: draftCount });
    } catch (e) { res.json({ threads: 0, mentions: 0, drafts: 0 }); }
});

// MESSAGES
app.get('/api/messages/:containerId', async (req, res) => {
    try {
        const { containerId } = req.params;
        const messages = await Message.findAll({
            where: { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }] },
            order: [['timestamp', 'ASC']]
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
            thread_reply_count: m.thread_reply_count,
            is_pinned: !!m.is_pinned,
            status: m.status
        })));
    } catch (e) { res.json([]); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, senderName, body, channelId, type, senderAvatarUrl, mediaUrl } = req.body;

        // Determine initial status based on recipient presence (if DM)
        let initialStatus = 'sent';
        if (channelId && channelId.includes('_')) {
            const parts = channelId.split('_');
            const otherPart = parts[0] === senderId ? parts[1] : parts[0];
            const recipient = await User.findOne({ where: { phone: otherPart } });
            if (recipient && recipient.presence === 'online') {
                initialStatus = 'delivered';
            }
        }

        const msgData = {
            senderId,
            senderName,
            body,
            channelId,
            type: type || 'text',
            senderAvatarUrl,
            status: initialStatus,
            attachments: mediaUrl ? [{ type: type, url: mediaUrl }] : []
        };

        if (msgData.channelId && msgData.channelId.includes('_')) {
            msgData.dm_id = msgData.channelId;
        }

        const msg = await Message.create(msgData);

        if (msgData.body && msgData.body.includes('@')) {
            const handles = msgData.body.match(/@[\w_]+/g) || [];
            for (const h of handles) {
                const handleToFind = h.substring(1).toLowerCase();
                const targetUser = await User.findOne({ where: { handle: handleToFind } });
                if (targetUser) {
                    await Mention.create({
                        message_id: msg.id,
                        mentioned_user_id: targetUser.phone,
                        source_channel_id: msgData.channelId || msgData.dm_id
                    });
                }
            }
        }
        await Draft.destroy({ where: { user_id: msgData.senderId, container_id: msgData.channelId || msgData.dm_id } });

        res.json(msg);
    } catch (e) {
        console.error(e);
        res.status(500).json(e);
    }
});

app.put('/api/messages/:id', async (req, res) => {
    try {
        const { body, status } = req.body;
        const updateData = {};
        if (body !== undefined) updateData.body = body;
        if (status !== undefined) updateData.status = status;

        await Message.update(updateData, { where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/messages/:id/reactions', async (req, res) => {
    try {
        const { userId, userName, emoji } = req.body;
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        const reactions = msg.reactions || [];
        reactions.push({ userId, userName, emoji, timestamp: Date.now() });

        await Message.update({ reactions: reactions }, { where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.delete('/api/messages/:id', async (req, res) => {
    try {
        await Message.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

// MEMBERS
app.post('/api/channels/:id/members', async (req, res) => {
    try {
        const { userId } = req.body;
        await ChannelMember.findOrCreate({
            where: { channelId: req.params.id, userId: userId },
            defaults: { channelId: req.params.id, userId: userId }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

// DRAFTS
app.post('/api/drafts', async (req, res) => {
    try {
        const { userId, containerId, text } = req.body;
        if (!text) {
            await Draft.destroy({ where: { user_id: userId, container_id: containerId } });
            return res.json({ success: true });
        }
        await Draft.upsert({ user_id: userId, container_id: containerId, text: text, updated_at: Date.now() });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/drafts/:userId', async (req, res) => {
    try { res.json(await Draft.findAll({ where: { user_id: req.params.userId } })); } catch (e) { res.json([]); }
});

// MENTIONS
app.get('/api/mentions/:userId', async (req, res) => {
    try { res.json(await Mention.findAll({ where: { mentioned_user_id: req.params.userId } })); } catch (e) { res.json([]); }
});

// TYPING
app.post('/api/channels/:id/typing', async (req, res) => {
    try {
        await TypingStatus.upsert({
            channelId: req.params.id,
            userId: req.body.userId,
            userName: req.body.userName,
            lastTypedAt: Date.now()
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/channels/:id/typing', async (req, res) => {
    try {
        const tenSecAgo = Date.now() - 10000;
        const typing = await TypingStatus.findAll({
            where: { channelId: req.params.id, lastTypedAt: { [Op.gt]: tenSecAgo } }
        });
        res.json(typing);
    } catch (e) { res.json([]); }
});

// CHANNELS DETAILS
app.get('/api/channels/:id', async (req, res) => {
    try { res.json(await Channel.findByPk(req.params.id)); } catch (e) { res.status(404).json(e); }
});

app.post('/api/workspaces/:workspaceId/channels', async (req, res) => {
    try {
        const { name, type, userId } = req.body;
        const channel = await Channel.create({ workspace_id: req.params.workspaceId, name: name, type: type || 'public' });
        if (userId) await ChannelMember.create({ channelId: channel.id, userId: userId });
        res.json(channel);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/workspaces/:id/channels', async (req, res) => {
    try {
        const { userId, type } = req.query;
        let channels;
        if (type === 'public') {
            channels = await Channel.findAll({ where: { workspace_id: req.params.id, type: 'public' } });
        } else if (userId) {
            const memberships = await ChannelMember.findAll({ where: { userId: userId } });
            const channelIds = memberships.map(m => m.channelId);
            channels = await Channel.findAll({ where: { workspace_id: req.params.id, id: { [Op.in]: channelIds } } });
        } else {
            channels = await Channel.findAll({ where: { workspace_id: req.params.id } });
        }
        res.json(channels);
    } catch (e) { res.json([]); }
});

// STATUS
app.get('/api/status', async (req, res) => {
    try { res.json(await Status.findAll({ order: [['createdAt', 'DESC']] })); } catch (err) { res.json([]); }
});

app.post('/api/status', async (req, res) => {
    try { res.json(await Status.create({ ...req.body, expiresAt: new Date(Date.now() + 24 * 3600000) })); } catch (err) { res.status(500).json(err); }
});

// UPLOAD
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/users', async (req, res) => {
    try { res.json(await User.findAll()); } catch (e) { res.json([]); }
});

app.get('/api/inbox/:userId', async (req, res) => {
    try { res.json(await User.findAll({ where: { phone: { [Op.ne]: req.params.userId } } })); } catch (e) { res.json([]); }
});

app.put('/api/users/:phone', async (req, res) => {
    try {
        await User.update(req.body, { where: { phone: req.params.phone } });
        res.json({ success: true, user: await User.findOne({ where: { phone: req.params.phone } }) });
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/search', async (req, res) => {
    try {
        const { query, userId, workspaceId } = req.query;
        console.log(`🔍 Search query: "${query}" from user: ${userId} in workspace: ${workspaceId}`);
        if (!query) return res.json({ channels: [], users: [], messages: [] });

        const searchOp = { [Op.like]: `%${query}%` };

        // 1. Search Channels
        const channels = await Channel.findAll({
            where: {
                ...(workspaceId && workspaceId !== 'null' ? { workspace_id: workspaceId } : {}),
                name: searchOp
            }
        });

        // 2. Search Users (for DMs)
        const users = await User.findAll({
            where: {
                [Op.or]: [
                    { name: searchOp },
                    { handle: searchOp }
                ],
                phone: { [Op.ne]: userId }
            }
        });

        // 3. Search Messages
        const messagesRaw = await Message.findAll({
            where: {
                body: searchOp
            },
            limit: 20,
            order: [['timestamp', 'DESC']]
        });

        const messages = messagesRaw.map(m => ({
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
            thread_reply_count: m.thread_reply_count,
            is_pinned: !!m.is_pinned,
            status: m.status
        }));

        res.json({
            channels: channels.map(ch => ({
                ...ch.toJSON(),
                member_count: ch.member_count,
                is_muted: !!ch.is_muted
            })),
            users,
            messages
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CU Orbit Server ready on port ${PORT}`);
});
