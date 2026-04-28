const fs = require('fs');
const path = require('path');

function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames) {
  function escapeHtml(str) {
    return str.replace(/[&<>]/g, (m) => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function isAuthenticated(req) {
    return req.session && req.session.authenticated === true;
  }

  app.get('/admin', (req, res) => {
    if (isAuthenticated(req)) {
      const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
      const recentMessages = messages.slice(-50).reverse();
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
          <title>Whisper – Admin</title>
          <link rel="icon" type="image/svg+xml" href="/admin-favicon.svg">
          <style>
            body { font-family: system-ui; background: #0a0c10; color: #eee; margin: 0; padding: 2rem; }
            h1, h2 { color: #818cf8; }
            .message-item { background: #2d3748; padding: 0.5rem; border-radius: 12px; margin: 0.25rem 0; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
            .message-content { flex: 1; }
            .file-preview { margin: 0.25rem 0 0 0; display: inline-block; background: #1e293b; border-radius: 8px; padding: 0.25rem 0.5rem; }
            .file-preview img { max-width: 60px; max-height: 60px; border-radius: 6px; vertical-align: middle; margin-right: 0.5rem; }
            .file-preview a { color: #818cf8; text-decoration: none; }
            .file-preview a:hover { text-decoration: underline; }
            input, select, button { padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
            input, select { background: #2d3748; color: white; width: 100%; }
            button { background: #6366f1; color: white; cursor: pointer; }
            button:hover { background: #818cf8; }
            .delete-btn { background: #ef4444; padding: 0.25rem 0.75rem; }
            .delete-btn:hover { background: #dc2626; }
            .purge-btn { background: #dc2626; }
            .purge-btn:hover { background: #b91c1c; }
            .container { max-width: 1200px; margin: 0 auto; }
            @media (max-width: 768px) {
              body { padding: 1rem; }
              .message-item { flex-direction: column; align-items: stretch; }
              .delete-btn { align-self: flex-end; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Admin Dashboard</h1>
            <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
              <div style="flex: 2;">
                <h2>📨 Recent Messages (last 50)</h2>
                <div id="messageList">
                  ${recentMessages.map(m => {
                    let fileHtml = '';
                    if (m.file) {
                      if (m.file.type && m.file.type.startsWith('image/')) {
                        fileHtml = `<div class="file-preview"><img src="${m.file.url}" alt="thumbnail"> <a href="${m.file.url}" target="_blank">${escapeHtml(m.file.name)}</a></div>`;
                      } else {
                        fileHtml = `<div class="file-preview">📎 <a href="${m.file.url}" target="_blank">${escapeHtml(m.file.name)}</a></div>`;
                      }
                    }
                    return `
                      <div class="message-item" data-message-id="${m.id}">
                        <div class="message-content">
                          <div><strong>${escapeHtml(m.senderName)}</strong> (${new Date(m.timestamp).toLocaleString()}): ${escapeHtml(m.text || '')}</div>
                          ${fileHtml}
                        </div>
                        <button class="delete-btn" data-id="${m.id}">Delete</button>
                      </div>
                    `;
                  }).join('')}
                  ${recentMessages.length === 0 ? '<p>No messages yet.</p>' : ''}
                </div>
              </div>
              <div style="flex: 1;">
                <h2>👥 Users (${userList.length})</h2>
                <div id="userList">
                  ${userList.map(u => `<div><img src="${u.avatar}" width="24" style="border-radius: 50%; vertical-align: middle;"> <strong>${escapeHtml(u.name)}</strong><br><small>${u.id}</small></div><hr>`).join('')}
                </div>
              </div>
            </div>

            <h2 style="margin-top: 2rem;">📢 Broadcast Message</h2>
            <form id="broadcastForm">
              <input type="text" id="broadcastText" placeholder="System message to all users" required>
              <button type="submit">Send Broadcast</button>
            </form>

            <h2 style="margin-top: 2rem;">🔄 Change Your Identity</h2>
            <form id="changeIdentityForm">
              <select id="presetSelect" style="background: #2d3748; color: white;">
                <option value="admin_whisper">Whisper Guardian (Admin)</option>
                <option value="admin_echo">Echo Seeker</option>
                <option value="admin_serene">Serene Keeper</option>
              </select>
              <button type="submit">Change</button>
            </form>
            <div id="identityStatus" style="margin-top: 0.5rem; font-size: 0.8rem;"></div>

            <div class="danger-zone" style="margin-top: 2rem; border-top: 1px solid #334155; padding-top: 1.5rem;">
              <h2>⚠️ Danger Zone</h2>
              <button id="purgeBtn" class="purge-btn">Purge All Messages (cannot be undone)</button>
            </div>

            <div style="margin-top: 2rem;">
              <a href="/admin/logout" style="color: #f87171;">Logout</a>
            </div>
          </div>

          <script>
            // Delete single message
            document.querySelectorAll('.delete-btn').forEach(btn => {
              btn.addEventListener('click', async () => {
                const msgId = btn.getAttribute('data-id');
                if (!msgId) return;
                if (confirm('Delete this message? This will also delete any attached file.')) {
                  const res = await fetch('/admin/delete-message/' + msgId, { method: 'POST' });
                  if (res.ok) {
                    const msgDiv = btn.closest('.message-item');
                    if (msgDiv) msgDiv.remove();
                  } else {
                    alert('Delete failed');
                  }
                }
              });
            });

            // Broadcast
            document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const text = document.getElementById('broadcastText').value.trim();
              if (!text) return;
              const res = await fetch('/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'broadcastText=' + encodeURIComponent(text)
              });
              if (res.ok) {
                document.getElementById('broadcastText').value = '';
                alert('Broadcast sent');
              } else {
                alert('Broadcast failed');
              }
            });

            // Purge all messages
            document.getElementById('purgeBtn').addEventListener('click', async () => {
              if (confirm('⚠️ ARE YOU SURE? This will delete ALL messages and ALL uploaded files. This action cannot be undone.')) {
                const res = await fetch('/admin/purge-messages', { method: 'POST' });
                if (res.ok) {
                  alert('All messages purged.');
                  location.reload();
                } else {
                  alert('Purge failed');
                }
              }
            });

            // Change identity
            document.getElementById('changeIdentityForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const preset = document.getElementById('presetSelect').value;
              const userId = localStorage.getItem('whisper_user_id');
              if (!userId) {
                document.getElementById('identityStatus').innerHTML = '<span style="color: #f87171;">✗ You are not logged into the chat? Please open the chat first.</span>';
                return;
              }
              const res = await fetch('/admin/change-identity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preset, userId })
              });
              const data = await res.json();
              if (res.ok) {
                document.getElementById('identityStatus').innerHTML = '<span style="color: #4ade80;">✓ Identity changed! The chat page will reload.</span>';
                setTimeout(() => {
                  window.location.href = '/chat';
                }, 1500);
              } else {
                document.getElementById('identityStatus').innerHTML = `<span style="color: #f87171;">✗ ${data.error || 'Failed'}</span>`;
              }
            });
          </script>
        </body>
        </html>
      `);
    } else {
      // Login page (unchanged)
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Admin Login</title>
          <link rel="icon" type="image/svg+xml" href="/admin-favicon.svg">
          <style>
            body { background: #0a0c10; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui; }
            .card { background: #1e1e2e; padding: 2rem; border-radius: 1rem; width: 300px; text-align: center; }
            input, button { padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
            input { background: #2d3748; color: white; width: 100%; box-sizing: border-box; }
            button { background: #6366f1; color: white; cursor: pointer; width: auto; margin: 0.5rem auto; display: block; }
            button:hover { background: #818cf8; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Admin Passcode</h2>
            <form action="/admin/login" method="POST">
              <input type="password" name="passcode" placeholder="Enter passcode" autofocus>
              <button type="submit">Login</button>
            </form>
          </div>
        </body>
        </html>
      `);
    }
  });

  app.post('/admin/login', (req, res) => {
    const { passcode } = req.body;
    if (passcode === ADMIN_PASSCODE) {
      req.session.authenticated = true;
      res.redirect('/admin');
    } else {
      res.send('<p style="color:red;">Wrong passcode. <a href="/admin">Try again</a></p>');
    }
  });

  app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
  });

  app.post('/admin/broadcast', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    const broadcastText = req.body.broadcastText?.trim();
    if (broadcastText) {
      io.emit('system message', { text: `📢 ADMIN: ${broadcastText}` });
      console.log(`📢 Admin broadcast: ${broadcastText}`);
      res.status(200).send('OK');
    } else {
      res.status(400).send('No message');
    }
  });

  app.post('/admin/delete-message/:id', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    const messageId = req.params.id;
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      const msg = messages[index];
      if (msg.file && msg.file.url) {
        const filePath = path.join(__dirname, msg.file.url);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, err);
        });
      }
      messages.splice(index, 1);
      io.emit('message deleted', { id: messageId });
      console.log(`🗑️ Admin deleted message ${messageId}`);
      res.status(200).send('OK');
    } else {
      res.status(404).send('Message not found');
    }
  });

  app.post('/admin/purge-messages', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    // Delete all files
    for (const msg of messages) {
      if (msg.file && msg.file.url) {
        const filePath = path.join(__dirname, msg.file.url);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, err);
        });
      }
    }
    messages.length = 0;
    io.emit('system message', { text: '📢 All messages have been purged by an admin.' });
    console.log('🗑️ Admin purged all messages');
    res.status(200).send('OK');
  });

  // Change identity endpoint
  app.post('/admin/change-identity', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { preset, userId } = req.body;
    if (!preset || !userId) return res.status(400).json({ error: 'Missing preset or user ID' });
    if (!userMappings[userId]) return res.status(400).json({ error: 'User not found' });

    const presets = {
      Arsan: { name: 'Arsan', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' },
      ArGzf: { name: 'Argzf', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' }
    };
    const newIdentity = presets[preset];
    if (!newIdentity) return res.status(400).json({ error: 'Invalid preset' });

    // Check if name is already taken by another user
    const existing = Object.entries(userMappings).find(([id, data]) => data.name === newIdentity.name && id !== userId);
    if (existing) return res.status(400).json({ error: 'This name is already taken and cannot be reused.' });

    // Update mapping
    userMappings[userId] = { name: newIdentity.name, avatar: newIdentity.avatar };
    saveUserMappings();

    // Add new name to takenNames set to prevent reuse
    if (!takenNames.has(newIdentity.name)) {
      takenNames.add(newIdentity.name);
      saveTakenNames();
    }

    // Broadcast to all sockets of this user to reload identity
    io.emit('force-reload-identity', { userId });
    res.json({ success: true });
  });
}

module.exports = setupAdmin;
