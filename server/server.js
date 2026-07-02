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
    email: DataTypes.STRING,
    avatarUrl: { type: DataTypes.STRING, defaultValue: '' },
    status: { type: DataTypes.STRING, defaultValue: 'online' },
    bio: { type: DataTypes.TEXT, defaultValue: 'Hey there! I am using CU Orbit.' }
});

const Workspace = sequelize.define('Workspace', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' }
});

const Channel = sequelize.define('Channel', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false },
    memberCount: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    senderId: DataTypes.STRING,
    senderName: DataTypes.STRING,
    senderAvatarUrl: DataTypes.STRING,
    body: DataTypes.TEXT,
    channelId: DataTypes.STRING,
    type: { type: DataTypes.STRING, defaultValue: 'text' },
    mediaUrl: DataTypes.STRING,
    status: { type: DataTypes.STRING, defaultValue: 'sent' },
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
});

const Status = sequelize.define('Status', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: DataTypes.STRING,
    mediaUrl: { type: DataTypes.STRING, allowNull: false },
    caption: DataTypes.TEXT,
    expiresAt: { type: DataTypes.DATE }
});

const TypingStatus = sequelize.define('TypingStatus', {
    channelId: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.STRING, primaryKey: true },
    userName: DataTypes.STRING,
    lastTypedAt: { type: DataTypes.BIGINT }
});

Workspace.hasMany(Channel, { foreignKey: 'workspaceId', as: 'channels' });
Channel.belongsTo(Workspace, { foreignKey: 'workspaceId' });

// SYNC
sequelize.authenticate()
    .then(async () => {
        await sequelize.sync({ alter: true });
        console.log('✅ MySQL Connected');
        const [ws] = await Workspace.findOrCreate({ where: { name: 'CU Orbit' } });
        await Channel.findOrCreate({ where: { name: 'general', workspaceId: ws.id } });
    })
    .catch(err => console.error('❌ MySQL Error:', err.message));

// --- ROUTES ---

// 1. AUTH & USER PROFILE
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ where: { phone: req.body.phone } });
        res.json({ success: true, isNewUser: !user, user });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.json({ success: true, user });
    } catch (err) { res.status(500).json(err); }
});

app.get('/api/users', async (req, res) => {
    try { res.json(await User.findAll()); } catch (e) { res.json([]); }
});

// Update Profile Route
app.put('/api/users/:phone', async (req, res) => {
    try {
        console.log(`[USER] Updating profile for phone: ${req.params.phone}`, req.body);
        const [updated] = await User.update(req.body, { where: { phone: req.params.phone } });
        const user = await User.findOne({ where: { phone: req.params.phone } });
        res.json({ success: true, user });
    } catch (e) {
        console.error('[USER] Update error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 2. INBOX ROUTE (Optimized)
app.get('/api/inbox/:userId', async (req, res) => {
    try {
        const currentUserId = req.params.userId;
        const users = await User.findAll({ where: { phone: { [Op.ne]: currentUserId } } });
        const inbox = await Promise.all(users.map(async (user) => {
            const dmId = currentUserId < user.phone ? `${currentUserId}_${user.phone}` : `${user.phone}_${currentUserId}`;
            const lastMsg = await Message.findOne({ where: { channelId: dmId }, order: [['timestamp', 'DESC']] });
            return {
                ...user.toJSON(),
                lastMessagePreview: lastMsg ? lastMsg.body : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : 0,
                unreadCount: await Message.count({ where: { channelId: dmId, senderId: { [Op.ne]: currentUserId }, status: { [Op.ne]: 'read' } } })
            };
        }));
        res.json(inbox);
    } catch (e) { res.json([]); }
});

// 3. WORKSPACES & CHANNELS
app.get('/api/workspaces', async (req, res) => {
    try { res.json(await Workspace.findAll({ include: [{ model: Channel, as: 'channels' }] })); } catch (e) { res.json([]); }
});

app.post('/api/workspaces', async (req, res) => {
    try {
        const ws = await Workspace.create(req.body);
        await Channel.create({ name: 'general', workspaceId: ws.id });
        res.json(ws);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/workspaces/:id/channels', async (req, res) => {
    try { res.json(await Channel.findAll({ where: { workspaceId: req.params.id } })); } catch (e) { res.json([]); }
});

app.post('/api/workspaces/:id/channels', async (req, res) => {
    try { res.json(await Channel.create({ ...req.body, workspaceId: req.params.id })); } catch (e) { res.status(500).json(e); }
});

app.get('/api/channels/:id', async (req, res) => {
    try { res.json(await Channel.findByPk(req.params.id)); } catch (e) { res.status(404).json(e); }
});

// 4. MESSAGES
app.get('/api/channels/:channelId/messages', async (req, res) => {
    try { res.json(await Message.findAll({ where: { channelId: req.params.channelId }, order: [['timestamp', 'ASC']] })); } catch (e) { res.json([]); }
});

app.post('/api/messages', async (req, res) => {
    try {
        if (!req.body.senderAvatarUrl && req.body.senderId) {
            const user = await User.findOne({ where: { phone: req.body.senderId } });
            if (user) req.body.senderAvatarUrl = user.avatarUrl;
        }
        res.json(await Message.create(req.body));
    } catch (e) { res.status(500).json(e); }
});

app.put('/api/messages/:id', async (req, res) => {
    try {
        await Message.update(req.body, { where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

// 5. STATUS & UPLOAD
app.get('/api/status', async (req, res) => {
    try { res.json(await Status.findAll({ order: [['createdAt', 'DESC']] })); } catch (err) { res.json([]); }
});

app.post('/api/status', async (req, res) => {
    try { res.json(await Status.create({ ...req.body, expiresAt: new Date(Date.now() + 24 * 3600000) })); } catch (err) { res.status(500).json(err); }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.json({ url: `/uploads/${req.file.filename}` });
});

// 6. TYPING
app.post('/api/channels/:id/typing', async (req, res) => {
    try {
        await TypingStatus.upsert({ channelId: req.params.id, userId: req.body.userId, userName: req.body.userName, lastTypedAt: Date.now() });
        res.json({ success: true });
    } catch (err) { res.json({ success: true }); }
});

app.get('/api/channels/:id/typing', async (req, res) => {
    try {
        const typing = await TypingStatus.findAll({ where: { channelId: req.params.id, lastTypedAt: { [Sequelize.Op.gt]: Date.now() - 5000 } } });
        res.json(typing);
    } catch (err) { res.json([]); }
});

// START SERVER
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CU Orbit Server ready on port ${PORT}`);
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`👉 ON YOUR PHONE, USE THIS IP: http://${net.address}:3000/api/`);
            }
        }
    }
});
