require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const { WebhookClient } = require('discord.js');

// ========== ENVIRONMENT CONFIGURATION ==========
const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;

if (!ADMIN_PASSCODE) {
  console.error('❌ FATAL: ADMIN_PASSCODE environment variable is not set.');
  process.exit(1);
}

// ========== INITIALISE STORAGE ==========
let messages = [];
let users = {};
let takenNames = new Set();

// Load persisted taken names
try {
  const data = fs.readFileSync(path.join(__dirname, 'takenNames.json'), 'utf8');
  const arr = JSON.parse(data);
  takenNames = new Set(arr);
} catch (e) { /* file does not exist yet */ }

function saveTakenNames() {
  fs.writeFileSync(path.join(__dirname, 'takenNames.json'), JSON.stringify([...takenNames]), 'utf8');
}

// ========== NAME & AVATAR GENERATORS ==========
const adjectives = ['Quiet', 'Serene', 'Peaceful', 'Silent', 'Calm', 'Gentle', 'Soft', 'Still', 'Hushed', 'Mellow'];
const nouns = ['River', 'Forest', 'Meadow', 'Hill', 'Lake', 'Cloud', 'Wind', 'Shadow', 'Echo', 'Whisper'];
const avatars = ['😊', '😌', '🍃', '🌙', '✨', '🌸', '🌊', '🕊️', '🌿', '💭'];

function generateRandomName() {
  let name;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    name = `${adj}${noun}_${num}`;
  } while (takenNames.has(name));
  takenNames.add(name);
  saveTakenNames();
  return name;
}

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// ========== DISCORD WEBHOOK (optional) ==========
let webhook = null;
if (DISCORD_WEBHOOK_URL) {
  webhook = new WebhookClient({ url: DISCORD_WEBHOOK_URL });
}

// ========== EXPRESS SETUP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads (memory storage, 10MB limit)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== CLEAN URL ROUTES ==========
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'faq.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'pp.html')));
app.get('/tos', (req, res) => res.sendFile(path.join(__dirname, 'tos.html')));

app.get('/faq.html', (req, res) => res.redirect(301, '/faq'));
app.get('/pp.html', (req, res) => res.redirect(301, '/privacy-policy'));
app.get('/tos.html', (req, res) => res.redirect(301, '/tos'));

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname)));

// ========== ADMIN PANEL ==========
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Admin API endpoints (protected by passcode)
app.post('/admin/delete-message', (req, res) => {
  const { code, messageId } = req.body;
  if (code !== ADMIN_PASSCODE) return res.status(403).json({ error: 'Invalid code' });
  const index = messages.findIndex(m => m.id === messageId);
  if (index !== -1) {
    messages.splice(index, 1);
    io.emit('message-deleted', messageId);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Message not found' });
  }
});

app.post('/admin/broadcast', (req, res) => {
  const { code, text } = req.body;
  if (code !== ADMIN_PASSCODE) return res.status(403).json({ error: 'Invalid code' });
  io.emit('admin-broadcast', text);
  res.json({ success: true });
});

app.post('/admin/change-identity', (req, res) => {
  const { code, oldUsername, newUsername } = req.body;
  if (code !== ADMIN_PASSCODE) return res.status(403).json({ error: 'Invalid code' });
  let targetSocketId = null;
  for (const [sid, user] of Object.entries(users)) {
    if (user.username === oldUsername) {
      targetSocketId = sid;
      break;
    }
  }
  if (!targetSocketId) return res.status(404).json({ error: 'User not found' });
  takenNames.delete(oldUsername);
  if (takenNames.has(newUsername)) {
    return res.status(400).json({ error: 'New username already taken' });
  }
  takenNames.add(newUsername);
  saveTakenNames();
  users[targetSocketId].username = newUsername;
  io.to(targetSocketId).emit('force-rename', newUsername);
  io.emit('user-renamed', { old: oldUsername, new: newUsername });
  res.json({ success: true });
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  const username = generateRandomName();
  const avatar = getRandomAvatar();
  users[socket.id] = { username, avatar };
  socket.emit('welcome', { username, avatar, messages: messages.slice(-500) });
  socket.broadcast.emit('user-joined', { username, avatar });

  socket.on('chat-message', (data) => {
    const user = users[socket.id];
    if (!user) return;
    const messageObj = {
      id: Date.now() + '-' + socket.id,
      username: user.username,
      avatar: user.avatar,
      text: data.text.substring(0, 500),
      timestamp: Date.now(),
      file: data.file || null
    };
    messages.push(messageObj);
    if (messages.length > 500) messages.shift();
    io.emit('new-message', messageObj);
    if (webhook) {
      webhook.send({ content: `**${user.username}** (${user.avatar}): ${data.text.substring(0, 200)}` })
        .catch(console.error);
    }
  });

  socket.on('file-upload', async (fileData, callback) => {
    if (fileData.size > 10 * 1024 * 1024) {
      callback({ error: 'File too large (max 10MB)' });
      return;
    }
    const user = users[socket.id];
    const messageObj = {
      id: Date.now() + '-' + socket.id,
      username: user.username,
      avatar: user.avatar,
      text: `📎 ${fileData.name}`,
      timestamp: Date.now(),
      file: {
        name: fileData.name,
        type: fileData.type,
        data: fileData.data,
        size: fileData.size
      }
    };
    messages.push(messageObj);
    if (messages.length > 500) messages.shift();
    io.emit('new-message', messageObj);
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      takenNames.delete(user.username);
      saveTakenNames();
      delete users[socket.id];
      io.emit('user-left', user.username);
    }
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => {
  console.log(`✅ Whisper server running on http://localhost:${PORT}`);
});
