require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const multer = require('multer');
const setupAdmin = require('./admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== FEATURE FLAG: Rooms disabled =====
const ROOMS_ENABLED = false;

// ===== ENVIRONMENT CHECKS =====
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
    console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
    process.exit(1);
}
const LOG_WEBHOOK_URL = process.env.WH_LOG_WEBHOOK_URL;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;
if (!ADMIN_PASSCODE) {
    console.error('❌ Missing ADMIN_PASSCODE in .env');
    process.exit(1);
}
const PORT = process.env.PORT || 3000;

// Helper to build absolute URL from request
function getAbsoluteUrl(req, relativePath) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${relativePath}`;
}

// File upload
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const randomName = crypto.randomUUID() + ext;
        cb(null, randomName);
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadsDir, { maxAge: '12d', etag: true, lastModified: true }));

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const relativePath = `/uploads/${req.file.filename}`;
    const absoluteUrl = getAbsoluteUrl(req, relativePath);
    res.json({ url: absoluteUrl, name: req.file.originalname, type: req.file.mimetype });
});

// Session for admin
app.use(session({
    secret: crypto.randomUUID(),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 60 * 1000 }
}));

// Storage files for taken names and user mappings
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');
if (!fs.existsSync(TAKEN_NAMES_FILE)) fs.writeFileSync(TAKEN_NAMES_FILE, '[]');
if (!fs.existsSync(USER_MAPPINGS_FILE)) fs.writeFileSync(USER_MAPPINGS_FILE, '{}');

let takenNames = new Set();
let userMappings = {};

function loadData() {
    try {
        const takenRaw = fs.readFileSync(TAKEN_NAMES_FILE, 'utf8');
        takenNames = new Set(JSON.parse(takenRaw.trim() || '[]'));
        const mappingRaw = fs.readFileSync(USER_MAPPINGS_FILE, 'utf8');
        userMappings = JSON.parse(mappingRaw.trim() || '{}');
        console.log(`✅ Loaded ${takenNames.size} taken names, ${Object.keys(userMappings).length} user mappings`);
    } catch (e) {
        console.error('Failed to load data – using empty defaults:', e.message);
        takenNames = new Set();
        userMappings = {};
    }
}

function saveTakenNames() {
    fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify([...takenNames], null, 2));
}

function saveUserMappings() {
    fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2));
}

loadData();

const adjectives = ['Charming', 'Nagging', 'Shy', 'Scared', 'Celebrated', 'Cherished', 'Amazed', 'Foolish', 'Happy', 'Sleepy', 'Curious', 'Clever', 'Quiet', 'Bright', 'Witty', 'Calm', 'Bold', 'Swift', 'Drunk', 'High', 'Depressed'];
const nouns = ['Panda', 'Fox', 'Owl', 'Cat', 'Wolf', 'Koala', 'Raven', 'Falcon', 'Deer', 'Hedgehog', 'Grizzly', 'Bear', 'Cow', 'Lego', 'Brick'];

const avatars = [
    'https://randomuser.me/api/portraits/lego/1.jpg',
    'https://randomuser.me/api/portraits/lego/2.jpg',
    'https://randomuser.me/api/portraits/lego/3.jpg',
    'https://randomuser.me/api/portraits/lego/4.jpg',
    'https://randomuser.me/api/portraits/lego/5.jpg',
    'https://randomuser.me/api/portraits/lego/6.jpg',
    'https://randomuser.me/api/portraits/lego/7.jpg',
    'https://t4.ftcdn.net/jpg/17/72/67/87/360_F_1772678733_B6CuuItBOiO9MevAMUmZ61lnDTYBSrX2.jpg',
    'https://bricksandminifigsontario.com/cdn/shop/files/3277d61acol27-7_20Longboarder_2C_20Series_2027_300x300.png?v=1736393249',
    'https://www.lapetitebrique.com/63-thickbox_default/lego-minifigures-8683-series-1-skater.jpg',
    'https://www.lapetitebrique.com/918-large_default/lego-minifig-minifigures-series-4-street-skater-.jpg',
    'https://www.templeofbricks.com/img/minifigs/lego-city/minifig-lego-city-cty0461.png',
    'https://imgcdn.stablediffusionweb.com/2026/4/10/92ab0b22-2fd6-4a53-a837-58cbd94c3c9f.webp',
    'https://imgcdn.stablediffusionweb.com/2026/4/10/4eba37be-d3d0-4ac7-aa10-eadf628fe652.webp',
    'https://thumbs.dreamstime.com/b/portrait-de-minifigure-d-homme-lego-contre-la-semelle-grise-tambov-f%C3%A9d%C3%A9ration-russie-octobre-photo-studio-167467396.jpg',
    'https://us.123rf.com/450wm/rosinka79/rosinka792001/rosinka79200100029/140652255-tambov-russian-federation-october-19-2019-portrait-of-lego-businessman-minifigure-with-lego-gray.jpg?ver=6',
    'https://us.123rf.com/450wm/rosinka79/rosinka791812/rosinka79181200028/133173131-tambov-russian-federation-july-29-2018-portrait-of-lego-businessman-minifigure-against-gray.jpg?ver=6',
    'https://i0.wp.com/nichicustoms.com/wp-content/uploads/2025/03/IMG_0011.jpg?fit=971%2C805&ssl=1',
    'https://t3.ftcdn.net/jpg/06/87/65/98/360_F_687659829_Du0AQxNAg0DzB9PSZyN0ZvtRKSdaZeD0.jpg',
    'https://i.guim.co.uk/img/static/sys-images/Guardian/Pix/pictures/2013/6/12/1371044563298/Lego-pirate-010.jpg?width=445&dpr=1&s=none&crop=none',
    'https://us1.discourse-cdn.com/openai1/original/4X/e/3/8/e38edc097fa19d5f6426d8d0f411b38eddeb6da7.webp',
    'https://randomuser.me/api/portraits/lego/8.jpg'
];

function generateUniqueName() {
    for (let i = 0; i < 100; i++) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const name = `${adj} ${noun}`;
        if (!takenNames.has(name)) {
            takenNames.add(name);
            saveTakenNames();
            return name;
        }
    }
    let counter = 1;
    while (true) {
        const name = `User ${counter++}`;
        if (!takenNames.has(name)) {
            takenNames.add(name);
            saveTakenNames();
            return name;
        }
    }
}

function getRandomAvatar() {
    return avatars[Math.floor(Math.random() * avatars.length)];
}

function getClientIP(socket) {
    const req = socket.request;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return socket.handshake.address;
}

// Discord webhook functions
async function sendToDiscord(name, avatar, text, file = null) {
    if (!WEBHOOK_URL) return;
    const embed = {
        author: { name: name, icon_url: avatar },
        timestamp: new Date().toISOString(),
        color: 0x5865F2,
        description: text || '*sent a file*'
    };
    if (file) {
        if (file.type && file.type.startsWith('image/')) {
            embed.image = { url: file.url };
            embed.description += `\n[️ View full size](${file.url})`;
        } else {
            embed.description += `\n[${file.name}](${file.url})`;
        }
    }
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📨 Discord embed sent for ${name}`);
    } catch (err) {
        console.error('Discord webhook failed:', err.message);
    }
}

async function sendJoinLog(name, avatar, userId, ip) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: '👤 User joined the chat',
        color: 0x5865F2,
        thumbnail: { url: avatar },
        fields: [
            { name: 'Username', value: name, inline: true },
            { name: 'User ID', value: `\`${userId}\``, inline: false },
            { name: 'IP Address', value: `[${ip}](https://whatismyipaddress.com/ip/${ip})`, inline: false },
            { name: 'Avatar URL', value: `[link](${avatar})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Default Room' }
    };
    try {
        await fetch(LOG_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📋 Join log sent for ${name}`);
    } catch (err) {
        console.error('Join log failed', err);
    }
}

let messages = [];
let userSocketMap = new Map();

io.on('connection', (socket) => {
    console.log('🟢 New connection');

    socket.on('identify', (storedUserId, callback) => {
        const clientIP = getClientIP(socket);
        let userId = storedUserId, name, avatar;
        if (storedUserId && userMappings[storedUserId]) {
            const identity = userMappings[storedUserId];
            name = identity.name;
            avatar = identity.avatar;
            userId = storedUserId;
        } else {
            userId = crypto.randomUUID();
            name = generateUniqueName();
            avatar = getRandomAvatar();
            userMappings[userId] = { name, avatar };
            saveUserMappings();
        }
        socket.userIdentity = { name, avatar, userId };
        userSocketMap.set(socket.id, userId);
        callback({ userId, name, avatar });
        sendJoinLog(name, avatar, userId, clientIP);
    });

    socket.on('load history', () => {
        socket.emit('load messages', messages);
    });

    // ==================== ANONYMOUS TYPING INDICATOR ====================
    socket.on('typing', () => {
        // Broadcast anonymously to all other users
        socket.broadcast.emit('user_typing');
    });

    socket.on('stop typing', () => {
        // Broadcast anonymously to all other users
        socket.broadcast.emit('user_stop_typing');
    });
    // ==================== END TYPING INDICATOR ====================

    socket.on('chat message', async (data) => {
        if (!socket.userIdentity) return;
        const { name, avatar } = socket.userIdentity;
        const clientIP = getClientIP(socket);
        const msg = {
            id: crypto.randomUUID(),
            text: data.text || '',
            timestamp: new Date().toISOString(),
            senderName: name,
            senderAvatar: avatar,
            file: data.file || null
        };
        messages.push(msg);
        if (messages.length > 500) messages.shift();
        io.emit('chat message', msg);
        await sendToDiscord(name, avatar, msg.text, clientIP, msg.file);
    });

    // Room events (disabled, but keep stubs)
    if (ROOMS_ENABLED) {
        // full room logic would go here
    } else {
        socket.on('join room', (roomName, password, callback) => {
            callback({ success: false, error: 'Rooms feature is temporarily disabled' });
        });
        socket.on('room chat message', () => {});
        socket.on('load room history', () => {});
        socket.on('room typing', () => {});
    }

    socket.on('disconnect', () => {
        userSocketMap.delete(socket.id);
        console.log('🔴 Disconnected');
    });
});

// ========== CLEAN URL ROUTES ==========
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'faq.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'pp.html')));
app.get('/tos', (req, res) => res.sendFile(path.join(__dirname, 'tos.html')));
app.get('/faq.html', (req, res) => res.redirect(301, '/faq'));
app.get('/pp.html', (req, res) => res.redirect(301, '/privacy-policy'));
app.get('/tos.html', (req, res) => res.redirect(301, '/tos'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});
app.get('/status', (req, res) => {
    res.sendFile(path.join(__dirname, 'uptime.html'));
});

// Admin panel (external admin.js)
setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings, null, ROOMS_ENABLED);

// ========== ERROR HANDLING ==========
// 403 Forbidden
app.use('/admin/*', (req, res, next) => {
    if (req.accepts('html')) {
        res.status(403).sendFile(path.join(__dirname, '403.html'));
    } else {
        res.status(403).json({ error: 'Forbidden' });
    }
});

// 404 handler
app.use((req, res, next) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, '404.html'));
    } else {
        res.status(404).json({ error: 'Not Found' });
    }
});

// 500 internal server error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (req.accepts('html')) {
        res.status(500).sendFile(path.join(__dirname, '500.html'));
    } else {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ========== START SERVER ==========
server.listen(PORT, () => {
    console.log(`🚀 Chat + Admin running on http://localhost:${PORT}`);
    if (!ROOMS_ENABLED) console.log('⚠️ Rooms feature is currently DISABLED');
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, (m) => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
