const fs = require('fs');
const path = require('path');

function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings) {
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

    // Redirect /admin/login to /admin to prevent 404
    app.get('/admin/login', (req, res) => {
        res.redirect('/admin');
    });

    app.get('/admin', (req, res) => {
        if (!isAuthenticated(req)) {
            // Login form (unchanged, clean)
            return res.send(`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Login</title>
                <link rel="icon" type="image/svg+xml" href="/icons/admin-favicon.svg">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); }
                </style>
            </head>
            <body class="min-h-screen flex items-center justify-center px-4">
                <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50">
                    <div class="flex justify-center mb-6">
                        <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-8 h-8 text-white">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                    </div>
                    <h2 class="text-2xl font-bold text-center text-white mb-2">Admin Access</h2>
                    <p class="text-center text-gray-400 mb-6">Please enter the passcode to continue</p>
                    <form action="/admin/login" method="POST" class="space-y-4">
                        <input type="password" name="passcode" placeholder="Enter passcode" autofocus class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Login</button>
                    </form>
                </div>
            </body>
            </html>`);
        }

        // --- Authenticated Dashboard ---
        const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
        const recentMessages = messages.slice(-50).reverse();

        let html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
            <title>Whisper – Admin</title>
            <link rel="icon" type="image/svg+xml" href="/icons/admin-favicon.svg">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <script src="/socket.io/socket.io.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body {
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                }
                ::-webkit-scrollbar { width: 8px; height: 8px; }
                ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
                ::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #818cf8; }
                .card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
                .message-card { transition: all 0.2s ease; }
                .message-card:hover { background: rgba(51, 65, 85, 0.8); transform: translateX(2px); }
                .avatar-img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
                /* Toast container */
                #toast-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .toast {
                    background: #1e293b;
                    border-left: 4px solid;
                    border-radius: 8px;
                    padding: 12px 20px;
                    min-width: 250px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    animation: slideIn 0.3s ease;
                    backdrop-filter: blur(8px);
                    color: white;
                }
                .toast.success { border-left-color: #22c55e; }
                .toast.error { border-left-color: #ef4444; }
                .toast.info { border-left-color: #3b82f6; }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .fade-out { animation: fadeOut 0.3s ease forwards; }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(100%); }
                }
                /* Custom Modal */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.7);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.2s ease, visibility 0.2s;
                }
                .modal-overlay.active {
                    opacity: 1;
                    visibility: visible;
                }
                .modal-container {
                    background: #1e293b;
                    border-radius: 1rem;
                    padding: 1.5rem;
                    max-width: 90%;
                    width: 320px;
                    border: 1px solid #475569;
                    box-shadow: 0 20px 35px -8px rgba(0,0,0,0.5);
                    text-align: center;
                }
                .modal-title {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin-bottom: 0.75rem;
                    color: white;
                }
                .modal-message {
                    color: #cbd5e1;
                    margin-bottom: 1.5rem;
                    font-size: 0.9rem;
                }
                .modal-buttons {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: center;
                }
                .modal-btn {
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                    border: none;
                }
                .modal-confirm {
                    background: #ef4444;
                    color: white;
                }
                .modal-confirm:hover {
                    background: #dc2626;
                }
                .modal-cancel {
                    background: #475569;
                    color: white;
                }
                .modal-cancel:hover {
                    background: #334155;
                }
                .modal-ok {
                    background: #3b82f6;
                    color: white;
                }
                .modal-ok:hover {
                    background: #2563eb;
                }
                @media (max-width: 480px) {
                    .modal-container { width: 85%; padding: 1.25rem; }
                    .modal-title { font-size: 1.1rem; }
                }
            </style>
        </head>
        <body class="min-h-screen">
            <div id="toast-container"></div>
            <!-- Custom Modal -->
            <div id="customModal" class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-title" id="modalTitle">Confirm</div>
                    <div class="modal-message" id="modalMessage">Are you sure?</div>
                    <div class="modal-buttons" id="modalButtons"></div>
                </div>
            </div>

            <div class="container mx-auto px-4 py-6 max-w-7xl">
                <!-- Header -->
                <div class="flex justify-between items-center mb-8">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5 text-white">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">Admin Dashboard</h1>
                            <p class="text-sm text-gray-400" id="welcomeMessage"></p>
                        </div>
                    </div>
                </div>

                <!-- Stats Overview -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Total Messages</p><p class="text-2xl font-bold text-white" id="totalMessagesCount">${messages.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-indigo-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Total Users</p><p class="text-2xl font-bold text-white" id="totalUsersCount">${userList.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-purple-900/50 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-purple-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Recent Activity</p><p class="text-2xl font-bold text-white" id="recentActivityCount">${recentMessages.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-green-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Two Column Layout -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <!-- Recent Messages -->
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card">
                        <div class="p-5 border-b border-gray-700/50 bg-gray-800/60">
                            <h2 class="text-lg font-semibold text-white">📩・Recent Messages</h2>
                        </div>
                        <div class="p-4 h-48 overflow-y-auto" id="messagesList">`;
        if (recentMessages.length === 0) {
            html += `<div class="text-center py-8 text-gray-400">No messages yet.</div>`;
        } else {
            for (const m of recentMessages) {
                let fileHtml = '';
                if (m.file) {
                    if (m.file.type && m.file.type.startsWith('image/')) {
                        fileHtml = `<div class="mt-2"><img src="${escapeHtml(m.file.url)}" class="max-w-[150px] rounded-lg border border-gray-600" /></div>`;
                    } else {
                        fileHtml = `<div class="mt-2"><a href="${escapeHtml(m.file.url)}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-sm">📎 ${escapeHtml(m.file.name)}</a></div>`;
                    }
                }
                html += `
                            <div class="message-card bg-gray-800/60 rounded-lg p-3 mb-3 border border-gray-700/30" data-message-id="${m.id}">
                                <div class="flex justify-between items-start mb-1">
                                    <span class="font-medium text-indigo-300 text-sm">${escapeHtml(m.senderName)}</span>
                                    <span class="text-xs text-gray-500">${new Date(m.timestamp).toLocaleString()}</span>
                                </div>
                                <div class="text-gray-300 text-sm mb-2">${escapeHtml(m.text || '')}</div>
                                ${fileHtml}
                                <button class="delete-msg-btn text-red-400 hover:text-red-300 text-xs transition-colors" data-id="${m.id}">🗑️ Delete</button>
                            </div>`;
            }
        }
        html += `</div>
                    </div>

                    <!-- Users List -->
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card">
                        <div class="p-5 border-b border-gray-700/50 bg-gray-800/60">
                            <h2 class="text-lg font-semibold text-white">👥・Active Users (<span id="usersCount">${userList.length}</span>)</h2>
                        </div>
                        <div class="p-4 max-h-[400px] overflow-y-auto" id="usersList">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="usersGrid">`;
        for (const u of userList) {
            html += `
                                <div class="bg-gray-800/60 rounded-lg p-3 flex items-center gap-3 border border-gray-700/30" data-user-id="${u.id}">
                                    <img src="${escapeHtml(u.avatar)}" class="avatar-img w-10 h-10 rounded-full border border-gray-600" alt="avatar">
                                    <div class="flex-1 min-w-0">
                                        <p class="font-medium text-gray-200 truncate">${escapeHtml(u.name)}</p>
                                        <p class="text-xs text-gray-500 truncate">${u.id}</p>
                                    </div>
                                </div>`;
        }
        html += `</div>
                        </div>
                    </div>
                </div>

                <!-- Action Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Broadcast -->
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                        <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">📢・Broadcast Message</h2>
                        <div class="space-y-3">
                            <input type="text" id="broadcastText" placeholder="Enter your announcement..." class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <button id="sendBroadcastBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Send Broadcast</button>
                        </div>
                    </div>

                    <!-- Merged Identity -->
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                        <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">🔄・Change Identity</h2>
                        <div class="space-y-4">
                            <input type="text" id="identityUserId" placeholder="User ID" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <div class="flex gap-2">
                                <select id="presetSelect" class="flex-1 px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="Arsan">Arsan</option>
                                    <option value="ArGzf">ArGzf</option>
                                    <option value="Admin">Admin</option>
                                </select>
                                <button id="applyPresetBtn" class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Preset</button>
                            </div>
                            <div class="flex gap-2">
                                <input type="text" id="customNameInput" placeholder="Custom name" class="flex-1 px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <button id="applyCustomBtn" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Custom</button>
                            </div>
                        </div>
                    </div>

                    <!-- Danger Zone -->
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-red-800/50 p-5 card">
                        <h2 class="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">⚠️・Danger Zone</h2>
                        <div class="space-y-3">
                            <button id="purgeMessagesBtn" class="w-full bg-red-700 hover:bg-red-800 py-2 rounded-lg font-medium transition-colors shadow-lg">🧹 Purge All Messages</button>
                            <a href="/admin/logout" class="block w-full bg-gray-700 hover:bg-gray-600 text-center py-2 rounded-lg font-medium transition-colors shadow-lg">🚪 Logout</a>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                // Custom Modal System
                const modal = document.getElementById('customModal');
                let modalResolve = null;

                function showModal(title, message, buttons = [{text: 'OK', type: 'ok'}]) {
                    return new Promise((resolve) => {
                        modalResolve = resolve;
                        document.getElementById('modalTitle').innerText = title;
                        document.getElementById('modalMessage').innerText = message;
                        const buttonsContainer = document.getElementById('modalButtons');
                        buttonsContainer.innerHTML = '';
                        buttons.forEach(btn => {
                            const button = document.createElement('button');
                            button.innerText = btn.text;
                            button.className = 'modal-btn ' + (btn.type === 'confirm' ? 'modal-confirm' : (btn.type === 'cancel' ? 'modal-cancel' : 'modal-ok'));
                            button.onclick = () => {
                                closeModal();
                                resolve(btn.value !== undefined ? btn.value : btn.text);
                            };
                            buttonsContainer.appendChild(button);
                        });
                        modal.classList.add('active');
                    });
                }

                function closeModal() {
                    modal.classList.remove('active');
                }

                // Replace confirm with custom modal
                window.customConfirm = (message, title = 'Confirm') => {
                    return showModal(title, message, [
                        { text: 'Yes', type: 'confirm', value: true },
                        { text: 'No', type: 'cancel', value: false }
                    ]);
                };

                window.customAlert = (message, title = 'Notice') => {
                    return showModal(title, message, [{ text: 'OK', type: 'ok' }]);
                };

                // Toast function
                function showToast(message, type = 'info') {
                    const container = document.getElementById('toast-container');
                    const toast = document.createElement('div');
                    toast.className = 'toast ' + type;
                    toast.innerText = message;
                    container.appendChild(toast);
                    setTimeout(() => {
                        toast.classList.add('fade-out');
                        setTimeout(() => toast.remove(), 300);
                    }, 3000);
                }

                // Dynamic welcome
                const hour = new Date().getHours();
                let greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
                document.getElementById('welcomeMessage').innerText = greeting + ', Handsome.';

                const socket = io();
                
                function refreshMessagesUI() {
                    fetch('/admin/api/messages')
                        .then(res => res.json())
                        .then(data => {
                            const container = document.getElementById('messagesList');
                            if (!container) return;
                            if (data.messages.length === 0) {
                                container.innerHTML = '<div class="text-center py-8 text-gray-400">No messages yet.</div>';
                            } else {
                                container.innerHTML = data.messages.map(m => {
                                    let fileHtml = '';
                                    if (m.file) {
                                        if (m.file.type && m.file.type.startsWith('image/')) {
                                            fileHtml = \`<div class="mt-2"><img src="\${escapeHtml(m.file.url)}" class="max-w-[150px] rounded-lg border border-gray-600" /></div>\`;
                                        } else {
                                            fileHtml = \`<div class="mt-2"><a href="\${escapeHtml(m.file.url)}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-sm">📎 \${escapeHtml(m.file.name)}</a></div>\`;
                                        }
                                    }
                                    return \`
                                        <div class="message-card bg-gray-800/60 rounded-lg p-3 mb-3 border border-gray-700/30" data-message-id="\${m.id}">
                                            <div class="flex justify-between items-start mb-1">
                                                <span class="font-medium text-indigo-300 text-sm">\${escapeHtml(m.senderName)}</span>
                                                <span class="text-xs text-gray-500">\${new Date(m.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div class="text-gray-300 text-sm mb-2">\${escapeHtml(m.text || '')}</div>
                                            \${fileHtml}
                                            <button class="delete-msg-btn text-red-400 hover:text-red-300 text-xs transition-colors" data-id="\${m.id}">🗑️ Delete</button>
                                        </div>
                                    \`;
                                }).join('');
                            }
                            document.getElementById('totalMessagesCount').innerText = data.totalCount;
                            document.getElementById('recentActivityCount').innerText = data.messages.length;
                        }).catch(err => console.error(err));
                }
                
                function refreshUsersUI() {
                    fetch('/admin/api/users')
                        .then(res => res.json())
                        .then(data => {
                            const grid = document.getElementById('usersGrid');
                            if (!grid) return;
                            grid.innerHTML = data.users.map(u => \`
                                <div class="bg-gray-800/60 rounded-lg p-3 flex items-center gap-3 border border-gray-700/30" data-user-id="\${u.id}">
                                    <img src="\${escapeHtml(u.avatar)}" class="avatar-img w-10 h-10 rounded-full border border-gray-600" alt="avatar">
                                    <div class="flex-1 min-w-0">
                                        <p class="font-medium text-gray-200 truncate">\${escapeHtml(u.name)}</p>
                                        <p class="text-xs text-gray-500 truncate">\${u.id}</p>
                                    </div>
                                </div>
                            \`).join('');
                            document.getElementById('totalUsersCount').innerText = data.users.length;
                            document.getElementById('usersCount').innerText = data.users.length;
                        }).catch(console.error);
                }
                
                function refreshStatsUI() {
                    fetch('/admin/api/stats')
                        .then(res => res.json())
                        .then(data => {
                            document.getElementById('totalMessagesCount').innerText = data.totalMessages;
                            document.getElementById('totalUsersCount').innerText = data.totalUsers;
                            document.getElementById('recentActivityCount').innerText = data.recentMessages;
                            document.getElementById('usersCount').innerText = data.totalUsers;
                        }).catch(console.error);
                }
                
                function escapeHtml(str) {
                    if (!str) return '';
                    return str.replace(/[&<>]/g, function(m) {
                        if (m === '&') return '&amp;';
                        if (m === '<') return '&lt;';
                        if (m === '>') return '&gt;';
                        return m;
                    });
                }
                
                socket.on('chat message', () => { refreshMessagesUI(); refreshStatsUI(); });
                socket.on('message deleted', () => { refreshMessagesUI(); refreshStatsUI(); });
                socket.on('messages purged', () => { refreshMessagesUI(); refreshStatsUI(); });
                socket.on('force-reload-identity', () => { refreshUsersUI(); refreshMessagesUI(); refreshStatsUI(); });
                
                // Broadcast
                document.getElementById('sendBroadcastBtn').addEventListener('click', async () => {
                    const text = document.getElementById('broadcastText').value.trim();
                    if (!text) { await customAlert('Enter a broadcast message', 'Missing Input'); return; }
                    const res = await fetch('/admin/broadcast', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ broadcastText: text })
                    });
                    const result = await res.json();
                    if (result.success) {
                        showToast('Broadcast sent', 'success');
                        document.getElementById('broadcastText').value = '';
                    } else {
                        await customAlert(result.message || 'Failed to send broadcast', 'Error');
                    }
                });
                
                // Preset identity
                document.getElementById('applyPresetBtn').addEventListener('click', async () => {
                    const userId = document.getElementById('identityUserId').value.trim();
                    const preset = document.getElementById('presetSelect').value;
                    if (!userId) { await customAlert('Please enter a User ID', 'Missing User ID'); return; }
                    const confirmed = await customConfirm(\`Change user \${userId} to preset "\${preset}"? This will reload their chat.\`, 'Confirm Identity Change');
                    if (!confirmed) return;
                    const res = await fetch('/admin/change-identity', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, preset })
                    });
                    const result = await res.json();
                    if (result.success) {
                        showToast('Preset identity applied', 'success');
                        refreshUsersUI();
                    } else {
                        await customAlert(result.error || 'Failed to apply preset', 'Error');
                    }
                });
                
                // Custom identity
                document.getElementById('applyCustomBtn').addEventListener('click', async () => {
                    const userId = document.getElementById('identityUserId').value.trim();
                    const customName = document.getElementById('customNameInput').value.trim();
                    if (!userId || !customName) { await customAlert('Please enter both User ID and a custom name', 'Missing Information'); return; }
                    const confirmed = await customConfirm(\`Change user \${userId} to custom name "\${customName}"? This will reload their chat.\`, 'Confirm Custom Identity');
                    if (!confirmed) return;
                    const res = await fetch('/admin/change-custom-identity', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, customName })
                    });
                    const result = await res.json();
                    if (result.success) {
                        showToast('Custom identity applied', 'success');
                        refreshUsersUI();
                    } else {
                        await customAlert(result.error || 'Failed to apply custom name', 'Error');
                    }
                });
                
                // Purge messages
                document.getElementById('purgeMessagesBtn').addEventListener('click', async () => {
                    const confirmed = await customConfirm('⚠️ Are you sure you want to purge ALL messages? This action cannot be undone!', 'Danger Zone');
                    if (!confirmed) return;
                    const res = await fetch('/admin/purge-messages', { method: 'POST' });
                    const result = await res.json();
                    if (result.success) {
                        showToast('All messages purged', 'success');
                        refreshMessagesUI();
                        refreshStatsUI();
                    } else {
                        await customAlert(result.message || 'Purge failed', 'Error');
                    }
                });
                
                // Delete message (delegation)
                document.getElementById('messagesList').addEventListener('click', async (e) => {
                    const btn = e.target.closest('.delete-msg-btn');
                    if (!btn) return;
                    const id = btn.getAttribute('data-id');
                    const confirmed = await customConfirm('Delete this message?', 'Confirm Delete');
                    if (!confirmed) return;
                    const res = await fetch('/admin/delete-message/' + id, { method: 'POST' });
                    const result = await res.json();
                    if (result.success) {
                        showToast('Message deleted', 'success');
                        refreshMessagesUI();
                        refreshStatsUI();
                    } else {
                        await customAlert(result.message || 'Delete failed', 'Error');
                    }
                });
                
                // Initial loads
                refreshMessagesUI();
                refreshUsersUI();
                refreshStatsUI();
            </script>
        </body>
        </html>`;
        res.send(html);
    });

    // --- API endpoints (unchanged but ensure Admin avatar uses external URL) ---
    app.get('/admin/api/messages', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const recent = messages.slice(-50).reverse();
        res.json({ messages: recent, totalCount: messages.length });
    });

    app.get('/admin/api/users', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
        res.json({ users: userList });
    });

    app.get('/admin/api/stats', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const userCount = Object.keys(userMappings).length;
        const recentCount = Math.min(messages.length, 50);
        res.json({ totalMessages: messages.length, totalUsers: userCount, recentMessages: recentCount });
    });

    app.post('/admin/login', (req, res) => {
        const { passcode } = req.body;
        if (passcode === ADMIN_PASSCODE) {
            req.session.authenticated = true;
            res.redirect('/admin');
        } else {
            res.send(`<!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Login Failed</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:'Inter',sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);}</style></head>
            <body class="min-h-screen flex items-center justify-center px-4">
                <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50 text-center">
                    <div class="text-red-400 mb-4"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-12 h-12 mx-auto"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <p class="text-gray-300 mb-4">Wrong passcode. Please try again.</p>
                    <a href="/admin" class="text-indigo-400 hover:text-indigo-300 transition-colors">← Back to login</a>
                </div>
            </body>
            </html>`);
        }
    });

    app.post('/admin/broadcast', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const broadcastText = req.body.broadcastText?.trim();
        if (broadcastText) {
            io.emit('system message', { text: `📢 Admin: ${broadcastText}` });
            console.log(`Admin broadcast: ${broadcastText}`);
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'No message' });
        }
    });

    app.post('/admin/delete-message/:id', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
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
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Message not found' });
        }
    });

    app.post('/admin/purge-messages', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        for (const msg of messages) {
            if (msg.file && msg.file.url) {
                const filePath = path.join(__dirname, msg.file.url);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, err);
                });
            }
        }
        messages.length = 0;
        io.emit('messages purged');
        console.log('🧹 Admin purged all messages');
        res.json({ success: true });
    });

    app.post('/admin/change-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const { preset, userId } = req.body;
        if (!preset || !userId) return res.status(400).json({ error: 'Missing preset or user ID' });
        if (!userMappings[userId]) return res.status(400).json({ error: 'User not found' });

        const presets = {
            Arsan: { name: 'Arsan', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' },
            ArGzf: { name: 'ArGzf', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' },
            Admin: { name: 'Admin', avatar: '/icons/admin-favicon.svg' },
        };
        const newIdentity = presets[preset];
        if (!newIdentity) return res.status(400).json({ error: 'Invalid preset' });

        const existing = Object.entries(userMappings).find(([id, data]) => data.name === newIdentity.name && id !== userId);
        if (existing) return res.status(400).json({ error: 'This name is already taken and cannot be reused.' });

        userMappings[userId] = { name: newIdentity.name, avatar: newIdentity.avatar };
        saveUserMappings();

        if (!takenNames.has(newIdentity.name)) {
            takenNames.add(newIdentity.name);
            saveTakenNames();
        }

        io.emit('force-reload-identity', { userId });
        res.json({ success: true });
    });

    app.post('/admin/change-custom-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const { userId, customName } = req.body;
        if (!userId || !customName || customName.trim() === '') {
            return res.status(400).json({ error: 'User ID and custom name are required' });
        }
        if (!userMappings[userId]) return res.status(400).json({ error: 'User not found' });

        const newName = customName.trim();
        const existing = Object.entries(userMappings).find(([id, data]) => data.name === newName && id !== userId);
        if (existing) return res.status(400).json({ error: 'This name is already taken and cannot be reused.' });

        const oldName = userMappings[userId].name;
        userMappings[userId].name = newName;
        saveUserMappings();

        if (oldName && takenNames.has(oldName)) {
            takenNames.delete(oldName);
            saveTakenNames();
        }
        if (!takenNames.has(newName)) {
            takenNames.add(newName);
            saveTakenNames();
        }

        io.emit('force-reload-identity', { userId });
        console.log(`🖊️ Admin changed user ${userId} name from "${oldName}" to "${newName}"`);
        res.json({ success: true });
    });

    app.get('/admin/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/admin');
    });
}

module.exports = setupAdmin;
