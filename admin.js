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
      const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Whisper – Admin</title>
          <link rel="icon" type="image/svg+xml" href="/admin-favicon.svg">
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
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Admin Dashboard</h1>
            <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
              <div style="flex: 2;">
                <h2>📨 Recent Messages <span id="messageCount">(0)</span></h2>
                <div id="messageList" style="max-height: 400px; overflow-y: auto;">
                  Loading...
                </div>
              </div>
              <div style="flex: 1;">
                <h2>👥 Users (<span id="userCount">${userList.length}</span>)</h2>
                <div id="userList" style="max-height: 400px; overflow-y: auto;">
                  ${userList.map(u => `<div><img src="${u.avatar}" width="24" style="border-radius: 50%; vertical-align: middle;"> <strong>${escapeHtml(u.name)}</strong><br><small>${u.id}</small></div><hr>`).join('')}
                </div>
              </div>
            </div>
            <h2 style="margin-top: 2rem;">📢 Broadcast Message</h2>
            <form id="broadcastForm">
              <input type="text" id="broadcastText" placeholder="System message to all users" required>
              <button type="submit">Send Broadcast</button>
            </form>
            <div style="margin-top: 2rem;">
              <a href="/admin/logout" style="color: #f87171;">Logout</a>
            </div>
          </div>

          <script>
            const socket = io();
            const messageListDiv = document.getElementById('messageList');
            const broadcastForm = document.getElementById('broadcastForm');
            const broadcastInput = document.getElementById('broadcastText');
            const messageCountSpan = document.getElementById('messageCount');

            // Function to render messages (initial load and updates)
            function renderMessages(messages) {
              if (messages.length === 0) {
                messageListDiv.innerHTML = '<p>No messages yet.</p>';
                messageCountSpan.innerText = '(0)';
                return;
              }
              messageCountSpan.innerText = \`(\${messages.length})\`;
              const html = messages.slice().reverse().map(m => \`
                <div class="message-item" data-message-id="\${m.id}">
                  <div><strong>\${escapeHtml(m.senderName)}</strong> (\${new Date(m.timestamp).toLocaleString()}): \${escapeHtml(m.text)}</div>
                  <button class="delete-btn" data-id="\${m.id}">Delete</button>
                </div>
              \`).join('');
              messageListDiv.innerHTML = html;
              // Attach delete event listeners to each button
              document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                  const msgId = btn.getAttribute('data-id');
                  if (confirm('Delete this message?')) {
                    const res = await fetch(\`/admin/delete-message/\${msgId}\`, { method: 'POST' });
                    if (res.ok) {
                      // Remove from DOM
                      const msgDiv = document.querySelector(\`.message-item[data-message-id="\${msgId}"]\`);
                      if (msgDiv) msgDiv.remove();
                    } else {
                      alert('Delete failed');
                    }
                  }
                });
              });
            }

            // Helper escape
            function escapeHtml(str) {
              return str.replace(/[&<>]/g, (m) => {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
              });
            }

            // Load initial messages
            fetch('/admin/api/messages')
              .then(res => res.json())
              .then(messages => renderMessages(messages));

            // Listen for new messages
            socket.on('chat message', (msg) => {
              // Fetch updated message list
              fetch('/admin/api/messages')
                .then(res => res.json())
                .then(messages => renderMessages(messages));
            });

            // Listen for message deletions
            socket.on('message deleted', (data) => {
              const msgDiv = document.querySelector(\`.message-item[data-message-id="\${data.id}"]\`);
              if (msgDiv) msgDiv.remove();
            });

            // Broadcast form submission
            broadcastForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const text = broadcastInput.value.trim();
              if (!text) return;
              const res = await fetch('/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: \`broadcastText=\${encodeURIComponent(text)}\`
              });
              if (res.ok) {
                broadcastInput.value = '';
                alert('Broadcast sent');
              } else {
                alert('Broadcast failed');
              }
            });
          </script>
        </body>
        </html>
      `);
    } else {
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

  // API endpoint for messages
  app.get('/admin/api/messages', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json(messages.slice(-50));
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

  // Delete message endpoint
  app.post('/admin/delete-message/:id', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    const messageId = req.params.id;
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages.splice(index, 1);
      io.emit('message deleted', { id: messageId });
      console.log(`🗑️ Admin deleted message ${messageId}`);
      res.status(200).send('OK');
    } else {
      res.status(404).send('Message not found');
    }
  });
}

module.exports = setupAdmin;
