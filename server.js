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
const roomsModule = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Webhooks
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
    console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
    process.exit(1);
}
const LOG_WEBHOOK_URL = process.env.WH_LOG_WEBHOOK_URL;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;

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
function saveTakenNames() { fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify([...takenNames], null, 2)); }
function saveUserMappings() { fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2)); }
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

function getRandomAvatar() { return avatars[Math.floor(Math.random() * avatars.length)]; }

function getClientIP(socket) {
    const req = socket.request;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return socket.handshake.address;
}

// Discord send for chat messages (embed with absolute URLs)
async function sendToDiscord(name, avatar, text, ip, file = null, roomName = null) {
    if (!WEBHOOK_URL) return;
    const embed = {
        author: { name, icon_url: avatar },
        timestamp: new Date().toISOString(),
        color: 0x5865F2
    };
    let description = text || '';
    if (file) {
        if (file.type && file.type.startsWith('image/')) {
            embed.image = { url: file.url };
            description += description ? `\n\n[🖼️ View full size](${file.url})` : `[🖼️ View full size](${file.url})`;
        } else {
            description += description ? `\n\n📎 [${file.name}](${file.url})` : `📎 [${file.name}](${file.url})`;
        }
    }
    if (!description.trim()) description = '*sent a file*';
    embed.description = description;
    if (roomName) embed.footer = { text: `Room: ${roomName}` };

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        if (!response.ok) console.error(`Discord webhook returned ${response.status}`);
        else console.log(`📨 Discord embed sent for ${name}${roomName ? ` in ${roomName}` : ''}`);
    } catch (err) { console.error('Discord webhook failed:', err.message); }
}

// Single join log (for main chat and rooms)
async function sendJoinLog(name, avatar, userId, ip, roomName = null) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: roomName ? `🚪 User joined room: ${roomName}` : '🚪 User joined the chat',
        color: 0x5865F2,
        thumbnail: { url: avatar },
        fields: [
            { name: 'Username', value: name, inline: true },
            { name: 'User ID', value: `\`${userId}\``, inline: false },
            { name: 'IP Address', value: `[${ip}](https://whatismyipaddress.com/ip/${ip})`, inline: false },
            { name: 'Avatar URL', value: `[link](${avatar})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: roomName ? `Room: ${roomName}` : 'Whisper Room' }
    };
    try {
        await fetch(LOG_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📢 Join log sent for ${name}${roomName ? ` in ${roomName}` : ''}`);
    } catch (err) { console.error('Join log failed', err); }
}

let messages = []; // main chat
let userSocketMap = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New connection');
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
        // Do NOT log join here – we'll log when they join a specific room or main chat
    });

    // Main chat (original)
    socket.on('load history', () => {
        socket.emit('load messages', messages);
    });

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

    // ---- Room system ----
    socket.on('join room', async (roomName, password, callback) => {
        if (!socket.userIdentity) {
            callback({ success: false, error: 'Not identified' });
            return;
        }
        if (!roomsModule.roomExists(roomName)) {
            callback({ success: false, error: 'Room does not exist' });
            return;
        }
        const isValid = roomsModule.verifyRoomPassword(roomName, password);
        if (!isValid) {
            callback({ success: false, error: 'Invalid room password' });
            return;
        }
        // Leave previous rooms
        const previousRooms = Array.from(socket.rooms);
        previousRooms.forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        socket.join(roomName);
        socket.currentRoom = roomName;
        const roomMessages = roomsModule.getRoomMessages(roomName);
        callback({ success: true, messages: roomMessages });
        const name = socket.userIdentity.name;
        const avatar = socket.userIdentity.avatar;
        const userId = socket.userIdentity.userId;
        const ip = getClientIP(socket);
        // Send single join log (with room name)
        await sendJoinLog(name, avatar, userId, ip, roomName);
    });

    socket.on('room chat message', async (data) => {
        if (!socket.userIdentity || !socket.currentRoom) return;
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
        roomsModule.addRoomMessage(socket.currentRoom, msg);
        io.to(socket.currentRoom).emit('room chat message', msg);
        await sendToDiscord(name, avatar, msg.text, clientIP, msg.file, socket.currentRoom);
    });

    socket.on('load room history', () => {
        if (!socket.currentRoom) return;
        const roomMessages = roomsModule.getRoomMessages(socket.currentRoom);
        socket.emit('load room messages', roomMessages);
    });

    socket.on('room typing', (isTyping) => {
        if (!socket.currentRoom) return;
        socket.to(socket.currentRoom).emit('room typing', {
            userId: socket.id,
            userName: socket.userIdentity?.name,
            isTyping
        });
    });

    socket.on('disconnect', () => {
        userSocketMap.delete(socket.id);
        console.log('🔌 Disconnected');
    });
});

// Routes
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/chat', (req, res) => { res.sendFile(path.join(__dirname, 'chat.html')); });

// Dynamic room route – uses the same UI as chat.html
app.get('/room/:roomName', (req, res) => {
    const roomName = req.params.roomName;
    if (!roomsModule.roomExists(roomName)) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    const room = roomsModule.getRoom(roomName);

    // Read the existing chat.html file and inject room-specific script
    const chatHtmlPath = path.join(__dirname, 'chat.html');
    let chatHtml = fs.readFileSync(chatHtmlPath, 'utf8');

    // Replace the title and add a room banner indicator
    chatHtml = chatHtml.replace('<title>Whisper</title>', `<title>Whisper · ${escapeHtml(roomName)}</title>`);
    
    // Inject room name into the banner (optional – keep original design but add room name)
    // We'll add a small indicator in the header
    const roomIndicator = `<div class="tagline ml-2" style="background:rgba(99,102,241,0.2);">🔒 ${room.hasPassword ? 'Private' : 'Public'} room</div>`;
    // Insert after the existing tagline
    chatHtml = chatHtml.replace('<div class="tagline">Anonymous · Instant</div>', `<div class="tagline">Anonymous · Instant</div>${roomIndicator}`);

    // Inject room initialization script at the end of the body, before the closing </body>
    const roomScript = `
    <script>
        // Override socket handlers for room mode
        (function() {
            const roomName = ${JSON.stringify(roomName)};
            const hasPassword = ${room.hasPassword};
            let originalEmit = socket.emit;
            let isRoomReady = false;
            
            // Store original handlers to replace later
            let originalLoadHistory = null;
            let originalChatMessage = null;
            
            function setupRoomMode() {
                // Remove existing listeners for main chat events
                socket.off('chat message');
                socket.off('load messages');
                socket.off('load history');
                
                // Add room-specific listeners
                socket.on('room chat message', (msg) => {
                    // Use the same appendMessage function (already defined in chat.html)
                    if (typeof appendMessage === 'function') {
                        appendMessage(msg);
                    } else if (typeof addMessage === 'function') {
                        addMessage(msg);
                    }
                    if (msg.senderName !== currentUserName && typeof safeNotify === 'function') {
                        safeNotify(msg.senderName, msg.text || 'sent a file');
                    }
                });
                
                socket.on('load room messages', (msgs) => {
                    if (typeof messagesContainer !== 'undefined') messagesContainer.innerHTML = '';
                    msgs.forEach(msg => {
                        if (typeof appendMessage === 'function') appendMessage(msg);
                        else if (typeof addMessage === 'function') addMessage(msg);
                    });
                });
                
                socket.on('room typing', (data) => {
                    const typingIndicator = document.getElementById('typingIndicator');
                    if (typingIndicator) {
                        if (data.userId !== socket.id && data.isTyping) {
                            typingIndicator.innerText = \`\${data.userName} is typing...\`;
                        } else {
                            typingIndicator.innerText = '';
                        }
                    }
                });
                
                // Override sendMessage to use room chat message
                const originalSendMessage = window.sendMessage;
                window.sendMessage = function() {
                    const text = document.getElementById('messageInput').value.trim();
                    if (!text) return;
                    socket.emit('room chat message', { text, file: null });
                    document.getElementById('messageInput').value = '';
                };
                
                // Override file upload message
                const originalFileHandler = window.handleFileUpload;
                window.handleFileUpload = async function(file) {
                    // Use existing upload function if defined
                    if (typeof uploadFile === 'function') {
                        const { url, name, type } = await uploadFile(file);
                        socket.emit('room chat message', { text: '', file: { url, name, type } });
                    } else {
                        console.error('uploadFile not defined');
                    }
                };
                
                // Load room history
                socket.emit('load room history');
            }
            
            // Wait for identity and then join room
            function joinRoomAfterIdentity(password) {
                // The 'identify' callback already sets currentUserName, etc.
                // We'll hook into the existing identify flow
                const originalIdentifyCallback = window.identifyCallback;
                window.identifyCallback = function(data) {
                    if (originalIdentifyCallback) originalIdentifyCallback(data);
                    // After identity is set, join the room
                    socket.emit('join room', roomName, password, (response) => {
                        if (response.success) {
                            isRoomReady = true;
                            setupRoomMode();
                            // Remove password modal if present
                            const modal = document.getElementById('roomPasswordModal');
                            if (modal) modal.remove();
                            // Request notification permission after successful join
                            if (typeof requestNotificationPermissionSafe === 'function') {
                                requestNotificationPermissionSafe();
                            }
                        } else {
                            alert(response.error);
                            if (hasPassword) {
                                // Show password modal again
                                showRoomPasswordModal();
                            } else {
                                console.error('Failed to join room');
                            }
                        }
                    });
                };
            }
            
            function showRoomPasswordModal() {
                const modalHtml = \`
                    <div id="roomPasswordModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;">
                        <div style="background:#1e293b;border-radius:1rem;padding:2rem;max-width:400px;width:90%;text-align:center;">
                            <h3 style="color:white;margin-bottom:1rem;">🔐 Room Password Required</h3>
                            <p style="color:#94a3b8;margin-bottom:1.5rem;">This room is password protected.</p>
                            <input type="password" id="roomPasswordInput" placeholder="Enter password" style="width:100%;padding:0.75rem;margin-bottom:1rem;background:#0f172a;border:1px solid #475569;border-radius:0.5rem;color:white;">
                            <button id="roomPasswordSubmit" style="background:#3b82f6;padding:0.75rem 1.5rem;border:none;border-radius:0.5rem;color:white;cursor:pointer;">Enter Room</button>
                        </div>
                    </div>
                \`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                document.getElementById('roomPasswordSubmit').addEventListener('click', () => {
                    const pwd = document.getElementById('roomPasswordInput').value;
                    joinRoomAfterIdentity(pwd);
                });
            }
            
            // Override the identify event to inject our join logic
            // The original socket.on('identity') already exists; we need to run after it.
            // We'll wait for the existing identity handler to finish.
            // Simpler: replace the whole identify flow.
            // Since we can't easily override, we'll let the original identify run and then join.
            // But we need to capture the password before identify.
            // Let's modify: store password and then after identify, join.
            let pendingPassword = null;
            
            const originalIdentify = window.socketIdentify;
            window.socketIdentify = function(storedId, callback) {
                // Call original identify (which exists in chat.html)
                if (originalIdentify) {
                    originalIdentify(storedId, (data) => {
                        if (callback) callback(data);
                        // After identity is set, join room with pendingPassword
                        if (pendingPassword !== undefined) {
                            socket.emit('join room', roomName, pendingPassword, (response) => {
                                if (response.success) {
                                    isRoomReady = true;
                                    setupRoomMode();
                                    const modal = document.getElementById('roomPasswordModal');
                                    if (modal) modal.remove();
                                    if (typeof requestNotificationPermissionSafe === 'function') {
                                        requestNotificationPermissionSafe();
                                    }
                                } else {
                                    alert(response.error);
                                    if (hasPassword) showRoomPasswordModal();
                                }
                            });
                            pendingPassword = null;
                        }
                    });
                }
            };
            
            if (hasPassword) {
                showRoomPasswordModal();
                window.roomPasswordCallback = (pwd) => {
                    pendingPassword = pwd;
                    // Trigger identify again? The identify already happened on page load.
                    // We'll simply emit join room directly after setting pendingPassword.
                    // But the identity might not have completed yet. We'll wait a bit.
                    setTimeout(() => {
                        if (socket.userIdentity) {
                            socket.emit('join room', roomName, pwd, (response) => {
                                if (response.success) {
                                    isRoomReady = true;
                                    setupRoomMode();
                                    document.getElementById('roomPasswordModal')?.remove();
                                    if (typeof requestNotificationPermissionSafe === 'function') {
                                        requestNotificationPermissionSafe();
                                    }
                                } else {
                                    alert(response.error);
                                    showRoomPasswordModal();
                                }
                            });
                        } else {
                            pendingPassword = pwd;
                        }
                    }, 500);
                };
            } else {
                // No password – join immediately after identify
                const checkInterval = setInterval(() => {
                    if (socket.userIdentity) {
                        clearInterval(checkInterval);
                        socket.emit('join room', roomName, null, (response) => {
                            if (response.success) {
                                isRoomReady = true;
                                setupRoomMode();
                                if (typeof requestNotificationPermissionSafe === 'function') {
                                    requestNotificationPermissionSafe();
                                }
                            } else {
                                console.error('Failed to join room:', response.error);
                            }
                        });
                    }
                }, 100);
            }
        })();
    </script>
    `;
    // Insert before </body>
    chatHtml = chatHtml.replace('</body>', roomScript + '</body>');
    
    res.send(chatHtml);
});

// Admin panel
setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings);

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Chat + Admin + Rooms running on http://localhost:${PORT}`);
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
