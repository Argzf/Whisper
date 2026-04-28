require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));

// Webhooks
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
  process.exit(1);
}
const LOG_WEBHOOK_URL = process.env.WH_LOG_WEBHOOK_URL;

// Storage files
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

// Helper: read user mappings from disk (always fresh)
function readUserMappings() {
  try {
    if (fs.existsSync(USER_MAPPINGS_FILE)) {
      const data = fs.readFileSync(USER_MAPPINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to read user mappings', e);
  }
  return {};
}

// Helper: write user mappings to disk
function writeUserMappings(mappings) {
  try {
    fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    console.log(`💾 Saved ${Object.keys(mappings).length} user mappings`);
  } catch (e) {
    console.error('Failed to write user mappings', e);
  }
}

// Helper: read taken names
function readTakenNames() {
  try {
    if (fs.existsSync(TAKEN_NAMES_FILE)) {
      const data = fs.readFileSync(TAKEN_NAMES_FILE, 'utf8');
      return new Set(JSON.parse(data));
    }
  } catch (e) { console.error(e); }
  return new Set();
}

function writeTakenNames(taken) {
  try {
    fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify(Array.from(taken), null, 2));
    console.log(`💾 Saved ${taken.size} taken names`);
  } catch (e) { console.error(e); }
}

// In-memory caches (initialised from disk)
let takenNames = readTakenNames();
let userMappings = readUserMappings();

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
  'https://randomuser.me/api/portraits/lego/8.jpg'
];

function generateUniqueName() {
  for (let i = 0; i < 100; i++) {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const name = `${adj} ${noun}`;
    if (!takenNames.has(name)) {
      takenNames.add(name);
      writeTakenNames(takenNames);
      return name;
    }
  }
  let counter = 1;
  while (true) {
    const name = `User ${counter++}`;
    if (!takenNames.has(name)) {
      takenNames.add(name);
      writeTakenNames(takenNames);
      return name;
    }
  }
}

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

async function sendToDiscord(name, avatar, text) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, username: name, avatar_url: avatar })
    });
    console.log(`📨 Discord: ${name} said "${text}"`);
  } catch (err) {
    console.error('Discord webhook failed', err);
  }
}

async function sendJoinLog(name, avatar, userId) {
  if (!LOG_WEBHOOK_URL) return;
  const embed = {
    title: '🚪 User joined the chat',
    color: 0x5865F2,
    thumbnail: { url: avatar },
    fields: [
      { name: 'Username', value: name, inline: true },
      { name: 'Avatar URL', value: `[link](${avatar})`, inline: true },
      { name: 'User ID', value: `\`${userId}\``, inline: false }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Whisper Room' }
  };
  try {
    await fetch(LOG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    console.log(`📢 Join log sent for ${name}`);
  } catch (err) {
    console.error('Join log failed', err);
  }
}

let messages = [];

io.on('connection', (socket) => {
  console.log('🔌 New socket connection');

  socket.on('identify', (storedUserId, callback) => {
    console.log(`🆔 Identify called with storedUserId: ${storedUserId} (type: ${typeof storedUserId})`);

    // Reload mappings from disk to ensure we have the latest
    const freshMappings = readUserMappings();
    // Merge fresh mappings into in-memory cache (just in case)
    userMappings = freshMappings;
    console.log(`📋 Current user mappings count: ${Object.keys(userMappings).length}`);

    let userId = storedUserId;
    let name, avatar;

    if (storedUserId && userMappings[storedUserId]) {
      const identity = userMappings[storedUserId];
      name = identity.name;
      avatar = identity.avatar;
      userId = storedUserId;
      console.log(`✅ Returning existing user: ${name} (${userId})`);
    } else {
      // No mapping found – create new identity
      userId = crypto.randomUUID();
      name = generateUniqueName();
      avatar = getRandomAvatar();
      userMappings[userId] = { name, avatar };
      writeUserMappings(userMappings);
      console.log(`🆕 Created new user: ${name} (${userId})`);
    }
    socket.userIdentity = { name, avatar, userId };
    callback({ userId, name, avatar });
    sendJoinLog(name, avatar, userId);
  });

  socket.on('load history', () => {
    socket.emit('load messages', messages);
  });

  socket.on('chat message', async ({ text }) => {
    if (!socket.userIdentity) return;
    const { name, avatar } = socket.userIdentity;
    const msg = {
      text,
      timestamp: new Date().toISOString(),
      senderName: name,
      senderAvatar: avatar
    };
    messages.push(msg);
    if (messages.length > 500) messages.shift();
    io.emit('chat message', msg);
    await sendToDiscord(name, avatar, text);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Chat running on http://localhost:${PORT}`);
});
