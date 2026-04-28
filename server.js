require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
  process.exit(1);
}

// Store messages in memory (or write to file if you want persistence)
let messages = [];

// Helper: random name and random avatar for Discord logs
const adjectives = ['Happy', 'Sleepy', 'Curious', 'Clever', 'Quiet', 'Bright', 'Witty', 'Calm', 'Bold', 'Swift'];
const nouns = ['Panda', 'Fox', 'Owl', 'Cat', 'Wolf', 'Koala', 'Raven', 'Falcon', 'Deer', 'Hedgehog'];
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

function getRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// Function to send message to Discord webhook with random name/avatar
async function sendToDiscord(messageText) {
  const randomName = getRandomName();
  const randomAvatar = getRandomAvatar();
  const payload = {
    content: messageText,
    username: randomName,
    avatar_url: randomAvatar
  };
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`📨 Discord: ${randomName} said "${messageText}"`);
  } catch (err) {
    console.error('Discord webhook failed', err);
  }
}

io.on('connection', (socket) => {
  console.log('a user connected');

  // Send message history to new client (only message text, no names)
  socket.emit('load messages', messages);

  socket.on('chat message', async (data) => {
    const messageText = data.text.trim();
    if (!messageText) return;

    // Store message (only text, no sender info)
    const msg = { text: messageText, timestamp: new Date().toISOString() };
    messages.push(msg);
    // Keep last 200 messages
    if (messages.length > 200) messages.shift();

    // Broadcast to all connected clients
    io.emit('chat message', msg);

    // Also send to Discord with random name/avatar
    await sendToDiscord(messageText);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Anonymous chat running on http://localhost:${PORT}`);
});
