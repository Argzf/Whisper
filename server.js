require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serve index.html from current folder

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ Missing DISCORD_WEBHOOK_URL in .env file');
  process.exit(1);
}

// Rate limiting simple in-memory store
const cooldown = new Map();
const COOLDOWN_MS = 10000; // 10 seconds

app.post('/send', async (req, res) => {
  const { username, message } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  // Cooldown check
  const last = cooldown.get(ip);
  const now = Date.now();
  if (last && (now - last) < COOLDOWN_MS) {
    return res.status(429).json({ error: `Please wait ${Math.ceil((COOLDOWN_MS - (now - last)) / 1000)} seconds` });
  }
  cooldown.set(ip, now);
  setTimeout(() => cooldown.delete(ip), COOLDOWN_MS);

  const payload = {
    content: message,
    username: username?.trim() || 'Anonymous',
    avatar_url: 'https://github.com/rajatcj.png' // optional
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      res.json({ success: true });
    } else {
      console.error('Webhook error', response.status);
      res.status(500).json({ error: 'Failed to send message to Discord' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Contact form backend running on http://localhost:${PORT}`);
});
