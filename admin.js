// admin.js
function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE) {
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
      // Serve the real‑time admin panel HTML
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Whisper – Admin</title>
          <script src="/socket.io/socket.io.js"></script>
          <style>
            body { font-family: system-ui; background: #0a0c10; color: #eee; margin: 0; padding: 2rem; }
            h1, h2 { color: #818cf8; }
            .message-item { background: #2d3748; padding: 0.5rem; border-radius: 12px; margin: 0.25rem 0; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
            input, button { padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
            input { background: #2d3748; color: white; width: 100%; }
            button { background: #6366f1; color: white; cursor: pointer; }
            button:hover { background: #818cf8; }
            .delete-btn { background: #ef4444; padding: 0.25rem 0.75rem; }
            .delete-btn:hover { background: #dc2626; }
            .container { max-width: 1200px; margin: 0 auto; }
            .refresh-icon { background: none; border: none; font-size: 1.2rem; cursor: pointer; margin-left: 1rem; vertical-align: middle; }
          </style>
        </head>
        <body>
          <div class="container">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h1>🔐 Admin Dashboard <button id="refreshUserList" class="refresh-icon" title="Refresh user list">🔄</button></h1>
              <a href="/admin/logout" style="color: #f87171;">Logout</a>
            </div>
            <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
              <div style="flex: 2;">
                <h2>📨 Recent Messages</h2>
                <div id="messagesList" style="max-height: 400px; overflow-y: auto;"></div>
              </div>
              <div style="flex: 1;">
                <h2>👥 Users (<span id="userCount">0</span>)</h2>
                <div id="usersList" style="max-height: 400px; overflow-y: auto;"></div>
              </div>
            </div>
            <h2 style="margin-top: 2rem;">📢 Broadcast Message</h2>
            <form id="broadcastForm">
              <input type="text" id="broadcastText" placeholder="System message to all users" required>
              <button type="submit">Send Broadcast</button>
            </form>
          </div>

          <script>
            const socket = io();
            let currentUserMappings = ${JSON.stringify(userMappings)};
            let currentMessages = ${JSON.stringify(messages.slice(-50))};

            // Helper
            function escapeHtml(str) {
              return str.replace(/[&<>]/g, (m) => {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
              });
            }

            function renderMessages() {
              const container = document.getElementById('messagesList');
              if (!container) return;
              container.innerHTML = currentMessages.slice().reverse().map(msg => \`
                <div class="message-item" data-message-id="\${msg.id}">
                  <div><strong>\${escapeHtml(msg.senderName)}</strong> (\${new Date(msg.timestamp).toLocaleString()}): \${escapeHtml(msg.text)}</div>
                  <form action="/admin/delete-message/\${msg.id}" method="POST" style="margin: 0;">
                    <button type="submit" class="delete-btn">Delete</button>
                  </form>
                </div>
              \`).join('');
            }

            function renderUsers() {
              const container = document.getElementById('usersList');
              const countSpan = document.getElementById('userCount');
              if (!container) return;
              const users = Object.entries(currentUserMappings);
              countSpan.innerText = users.length;
              container.innerHTML = users.map(([id, data]) => \`
                <div><img src="\${data.avatar}" width="24" style="border-radius: 50%; vertical-align: middle;"> <strong>\${escapeHtml(data.name)}</strong><br><small>\${id}</small></div><hr>
              \`).join('');
            }

            // Listen for new chat messages
            socket.on('chat message', (msg) => {
              // Add to currentMessages (keep only last 50)
              currentMessages.push(msg);
              if (currentMessages.length > 50) currentMessages.shift();
              renderMessages();
            });

            // Listen for message deletions
            socket.on('message deleted', (data) => {
              currentMessages = currentMessages.filter(m => m.id !== data.id);
              renderMessages();
            });

            // Refresh user list (via fetch)
            document.getElementById('refreshUserList')?.addEventListener('click', async () => {
              const res = await fetch('/debug/mappings');
              const newMappings = await res.json();
              currentUserMappings = newMappings;
              renderUsers();
            });

            // Broadcast form submission (fetch, not socket)
            document.getElementById('broadcastForm')?.addEventListener('submit', async (e) => {
              e.preventDefault();
              const text = document.getElementById('broadcastText').value.trim();
              if (!text) return;
              await fetch('/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ broadcastText: text })
              });
              document.getElementById('broadcastText').value = '';
            });

            // Handle delete buttons via AJAX to avoid full page reload
            document.addEventListener('click', async (e) => {
              const btn = e.target.closest('.delete-btn');
              if (btn && btn.form) {
                e.preventDefault();
                const form = btn.form;
                const action = form.action;
                if (confirm('Delete this message?')) {
                  const res = await fetch(action, { method: 'POST' });
                  if (res.redirected) {
                    // If session expired, redirect to login
                    if (res.url.includes('/admin')) window.location.href = res.url;
                  }
                }
              }
            });

            // Initial render
            renderMessages();
            renderUsers();
          </script>
        </body>
        </html>
      `);
    } else {
      // Login page unchanged
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Admin Login</title>
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
    }
    res.redirect('/admin');
  });

  app.post('/admin/delete-message/:id', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    const messageId = req.params.id;
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages.splice(index, 1);
      io.emit('message deleted', { id: messageId });
      console.log(`🗑️ Admin deleted message ${messageId}`);
    }
    res.redirect('/admin');
  });
}

module.exports = setupAdmin;
