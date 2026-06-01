const express = require('express');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const { WebhookClient } = require('discord.js');

// ========== CONFIGURATION ==========
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = 'your-secure-admin-code';   // CHANGE THIS!
const DISCORD_WEBHOOK_URL = 'your-webhook-url'; // CHANGE OR REMOVE

// In-memory storage
let messages = [];           // last 500 messages { id, username, avatar, text, timestamp, file? }
let users = {};              // socket.id -> { username, avatar }
let takenNames = new Set();  // names currently in use (to avoid duplicates)

// Load persisted taken names from file (if any)
try {
  const data = fs.readFileSync('./takenNames.json', 'utf8');
  const arr = JSON.parse(data);
  takenNames = new Set(arr);
} catch(e) { /* ignore */ }

// Save taken names periodically
function saveTakenNames() {
  fs.writeFileSync('./takenNames.json', JSON.stringify([...takenNames]), 'utf8');
}

// Helper: generate random name like "QuietRiver_742"
function generateRandomName() {
  const adjectives = ['Quiet', 'Serene', 'Peaceful', 'Silent', 'Calm', 'Gentle', 'Soft', 'Still', 'Hushed', 'Mellow'];
  const nouns = ['River', 'Forest', 'Meadow', 'Hill', 'Lake', 'Cloud', 'Wind', 'Shadow', 'Echo', 'Whisper'];
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

// Helper: random avatar (simple emoji or color)
function getRandomAvatar() {
  const avatars = ['😊', '😌', '🍃', '🌙', '✨', '🌸', '🌊', '🕊️', '🌿', '💭'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// Discord webhook (optional)
let webhook = null;
if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL !== 'your-webhook-url') {
  webhook = new WebhookClient({ url: DISCORD_WEBHOOK_URL });
}

// ========== EXPRESS SETUP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads (max 10MB)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ========== CLEAN URL ROUTES (must come BEFORE express.static) ==========
app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'faq.html'));
});
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'pp.html'));
});
app.get('/tos', (req, res) => {
  res.sendFile(path.join(__dirname, 'tos.html'));
});
// Optional: redirect old .html to clean URLs (301 permanent)
app.get('/faq.html', (req, res) => res.redirect(301, '/faq'));
app.get('/pp.html', (req, res) => res.redirect(301, '/privacy-policy'));
app.get('/tos.html', (req, res) => res.redirect(301, '/tos'));

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname)));

// ========== ADMIN PAGE (simple) ==========
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Admin API endpoints (protected by code)
app.post('/admin/delete-message', (req, res) => {
  const { code, messageId } = req.body;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: 'Invalid code' });
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
  if (code !== ADMIN_CODE) return res.status(403).json({ error: 'Invalid code' });
  io.emit('admin-broadcast', text);
  res.json({ success: true });
});

app.post('/admin/change-identity', (req, res) => {
  const { code, oldUsername, newUsername } = req.body;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: 'Invalid code' });
  // Find socket with that username
  let targetSocketId = null;
  for (const [sid, user] of Object.entries(users)) {
    if (user.username === oldUsername) {
      targetSocketId = sid;
      break;
    }
  }
  if (!targetSocketId) return res.status(404).json({ error: 'User not found' });
  
  // Remove old name from takenNames
  takenNames.delete(oldUsername);
  // Ensure new name is not taken
  if (takenNames.has(newUsername)) {
    return res.status(400).json({ error: 'New username already taken' });
  }
  takenNames.add(newUsername);
  saveTakenNames();
  
  // Update user object
  users[targetSocketId].username = newUsername;
  // Notify the client
  io.to(targetSocketId).emit('force-rename', newUsername);
  // Broadcast to all that username changed
  io.emit('user-renamed', { old: oldUsername, new: newUsername });
  
  res.json({ success: true });
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Assign a unique permanent name
  const username = generateRandomName();
  const avatar = getRandomAvatar();
  users[socket.id] = { username, avatar };
  
  // Send welcome + message history
  socket.emit('welcome', { username, avatar, messages: messages.slice(-500) });
  // Broadcast new user to everyone else
  socket.broadcast.emit('user-joined', { username, avatar });
  
  // Listen for chat messages
  socket.on('chat-message', (data) => {
    const user = users[socket.id];
    if (!user) return;
    
    const messageObj = {
      id: Date.now() + '-' + socket.id,
      username: user.username,
      avatar: user.avatar,
      text: data.text.substring(0, 500), // trim long messages
      timestamp: Date.now(),
      file: data.file || null
    };
    
    // Store in memory (keep last 500)
    messages.push(messageObj);
    if (messages.length > 500) messages.shift();
    
    // Broadcast to all clients
    io.emit('new-message', messageObj);
    
    // Log to Discord if webhook exists
    if (webhook) {
      const logMsg = `**${user.username}** (${user.avatar}): ${data.text.substring(0, 200)}`;
      webhook.send({ content: logMsg }).catch(console.error);
    }
  });
  
  // File upload handler
  socket.on('file-upload', async (fileData, callback) => {
    // fileData = { name, type, data (base64), size }
    if (fileData.size > 10 * 1024 * 1024) {
      callback({ error: 'File too large (max 10MB)' });
      return;
    }
    // Broadcast file message to everyone
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
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      // Remove name from takenNames set
      takenNames.delete(user.username);
      saveTakenNames();
      delete users[socket.id];
      io.emit('user-left', user.username);
    }
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => {
  console.log(`Whisper server running on http://localhost:${PORT}`);
});
