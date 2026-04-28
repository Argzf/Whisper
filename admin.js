// admin.js
function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE) {
  // Helper escape function
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
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Whisper – Admin</title>
          <style>
            body { font-family: system-ui; background: #0a0c10; color: #eee; margin: 0; padding: 2rem; }
            h1, h2 { color: #818cf8; }
            table { border-collapse: collapse; width: 100%; margin-top: 1rem; background: #1e1e2e; border-radius: 12px; overflow: hidden; }
            th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #333; }
            th { background: #2d3748; }
            .message-bubble { background: #2d3748; padding: 0.5rem; border-radius: 12px; margin: 0.25rem 0; }
            input, button { padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
            input { background: #2d3748; color: white; width: 100%; }
            button { background: #6366f1; color: white; cursor: pointer; }
            button:hover { background: #818cf8; }
            .container { max-width: 1200px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Admin Dashboard</h1>
            <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
              <div style="flex: 2;">
                <h2>📨 Recent Messages (last 50)</h2>
                <div style="max-height: 400px; overflow-y: auto;">
                  ${recentMessages.map(m => `<div class="message-bubble"><strong>${escapeHtml(m.senderName)}</strong> (${new Date(m.timestamp).toLocaleString()}): ${escapeHtml(m.text)}</div>`).join('')}
                  ${recentMessages.length === 0 ? '<p>No messages yet.</p>' : ''}
                </div>
              </div>
              <div style="flex: 1;">
                <h2>👥 Users (${userList.length})</h2>
                <div style="max-height: 400px; overflow-y: auto;">
                  ${userList.map(u => `<div><img src="${u.avatar}" width="24" style="border-radius: 50%; vertical-align: middle;"> <strong>${escapeHtml(u.name)}</strong><br><small>${u.id}</small></div><hr>`).join('')}
                </div>
              </div>
            </div>
            <h2 style="margin-top: 2rem;">📢 Broadcast Message</h2>
            <form action="/admin/broadcast" method="POST">
              <input type="text" name="broadcastText" placeholder="System message to all users" required>
              <button type="submit">Send Broadcast</button>
            </form>
            <div style="margin-top: 2rem;">
              <a href="/admin/logout" style="color: #f87171;">Logout</a>
            </div>
          </div>
        </body>
        </html>
      `);
    } else {
      // Login page with centered button
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
}

module.exports = setupAdmin;
