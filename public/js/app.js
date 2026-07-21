// ===== Particles =====
(function() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();
    class Particle {
        constructor() { this.reset(); }
        reset() { this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height; this.size = Math.random() * 2 + 0.5; this.speedX = (Math.random() - 0.5) * 0.3; this.speedY = (Math.random() - 0.5) * 0.3; this.opacity = Math.random() * 0.5 + 0.1; }
        update() { this.x += this.speedX; this.y += this.speedY; if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset(); }
        draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fillStyle = `rgba(108,92,231,${this.opacity})`; ctx.fill(); }
    }
    for (let i = 0; i < 80; i++) particles.push(new Particle());
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        for (let i = 0; i < particles.length; i++) { for (let j = i + 1; j < particles.length; j++) { const dx = particles[i].x - particles[j].x; const dy = particles[i].y - particles[j].y; const dist = Math.sqrt(dx * dx + dy * dy); if (dist < 120) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.strokeStyle = `rgba(108,92,231,${0.08 * (1 - dist / 120)})`; ctx.lineWidth = 0.5; ctx.stroke(); } } }
        animId = requestAnimationFrame(animate);
    }
    animate();
})();

// ===== API Helper =====
async function api(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try { const res = await fetch(url, opts); const data = await res.json(); return { ok: res.ok, status: res.status, data }; }
    catch (e) { return { ok: false, status: 0, data: { error: 'Connection error' } }; }
}

// ===== State =====
let state = { user: null, keys: [], role: null };
let currentPage = 'auth';

// ===== DOM refs =====
const $ = id => document.getElementById(id);
const pages = { auth: $('page-auth'), dashboard: $('page-dashboard'), admin: $('page-admin') };
const nav = $('nav');
const navLinks = $('navLinks');

// ===== Page navigation =====
function showPage(name) {
    Object.keys(pages).forEach(k => { pages[k].classList.remove('active', 'visible'); });
    if (pages[name]) { pages[name].classList.add('active'); requestAnimationFrame(() => pages[name].classList.add('visible')); }
    currentPage = name;
    updateNav();
}

function updateNav() {
    const isLoggedIn = !!state.user;
    nav.classList.toggle('visible', isLoggedIn);
    if (!isLoggedIn) { navLinks.innerHTML = ''; return; }
    let html = '';
    html += `<button class="nav-btn ${currentPage === 'dashboard' ? 'active' : ''}" onclick="goDashboard()">Cabinet</button>`;
    if (state.role === 'admin' || state.role === 'superadmin') html += `<button class="nav-btn ${currentPage === 'admin' ? 'active' : ''}" onclick="goAdmin()">Admin</button>`;
    html += `<span style="color:var(--text-dim);font-size:13px;margin:0 4px;">${state.user}</span>`;
    html += `<button class="nav-btn logout" onclick="logout()">Exit</button>`;
    navLinks.innerHTML = html;
}

// ===== Auth toggle =====
function showRegister() {
    $('registerForm').style.display = 'block';
    $('loginForm').style.display = 'none';
}
function showLogin() {
    $('registerForm').style.display = 'none';
    $('loginForm').style.display = 'block';
}
$('showLoginBtn').addEventListener('click', showLogin);
$('showRegBtn').addEventListener('click', showRegister);

// ===== Register =====
$('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value;
    const remember = $('regRemember').checked;
    if (!username || !password) return showStatus('authStatus', 'Fill in all fields', 'error');

    const btn = $('regBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const { ok, data } = await api('POST', '/api/register', { username, password, remember });
    btn.disabled = false; btn.textContent = 'Register';
    if (ok) {
        state.user = data.username; state.role = data.role;
        showStatus('authStatus', 'Welcome, ' + data.username + '!', 'success');
        setTimeout(() => { loadDashboard(); showPage('dashboard'); }, 400);
    } else { showStatus('authStatus', data.error || 'Registration failed', 'error'); }
});

// ===== Login =====
$('loginFormInner').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    const remember = $('loginRemember').checked;
    if (!username || !password) return showStatus('loginStatus', 'Fill in all fields', 'error');

    const btn = $('loginBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const { ok, data } = await api('POST', '/api/login', { username, password, remember });
    btn.disabled = false; btn.textContent = 'Sign In';
    if (ok) {
        state.user = data.username; state.role = data.role;
        showStatus('loginStatus', 'Welcome back, ' + data.username + '!', 'success');
        setTimeout(() => { loadDashboard(); showPage('dashboard'); }, 400);
    } else { showStatus('loginStatus', data.error || 'Login failed', 'error'); }
});

// ===== Dashboard =====
async function loadDashboard() {
    const { ok, data } = await api('GET', '/api/me');
    if (!ok) { handleLogout(); return; }
    state.role = data.role;
    updateNav();
    loadKeys(); loadModVersion();
}

async function loadKeys() {
    const container = $('keysList');
    container.innerHTML = '<div style="text-align:center;"><span class="spinner"></span></div>';
    const { ok, data } = await api('GET', '/api/my-keys');
    if (!ok) { container.innerHTML = '<div class="no-keys">Failed to load keys</div>'; return; }
    state.keys = data;
    if (!data.length) {
        container.innerHTML = '<div class="no-keys">No keys activated yet. Ask an admin to assign one.</div>';
        $('subscriptionCard').style.display = 'none'; return;
    }
    $('subscriptionCard').style.display = 'block';
    const activeKey = data.find(k => k.active && new Date(k.expiresAt) > new Date()) || data[0];
    renderSubInfo(activeKey);
    let html = '';
    data.forEach(k => {
        const isActive = k.active && new Date(k.expiresAt) > new Date();
        html += `<div class="sub-item" style="margin-bottom:8px;">
            <div class="sub-item-label">Key</div>
            <div class="sub-item-value" style="font-size:13px;font-family:monospace;">${k.key}</div>
            <div style="margin-top:6px;display:flex;gap:16px;flex-wrap:wrap;">
                <span style="font-size:12px;color:var(--text-dim);">Created: ${formatDate(k.createdAt)}</span>
                <span style="font-size:12px;color:var(--text-dim);">Expires: ${formatDate(k.expiresAt)}</span>
                <span class="badge ${isActive ? 'badge-yes' : 'badge-no'}">${isActive ? 'Active' : 'Inactive'}</span>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function renderSubInfo(key) {
    const isActive = key.active && new Date(key.expiresAt) > new Date();
    $('subInfo').innerHTML = `
        <div class="sub-item"><div class="sub-item-label">Status</div><div class="sub-item-value ${isActive ? 'active' : 'expired'}">${isActive ? 'Active' : 'Expired'}</div></div>
        <div class="sub-item"><div class="sub-item-label">Created</div><div class="sub-item-value">${formatDate(key.createdAt)}</div></div>
        <div class="sub-item"><div class="sub-item-label">Expires</div><div class="sub-item-value ${isActive ? 'active' : 'expired'}">${formatDate(key.expiresAt)}</div></div>
        <div class="sub-item"><div class="sub-item-label">Key</div><div class="sub-item-value" style="font-size:13px;font-family:monospace;">${key.key}</div></div>`;
}

async function loadModVersion() {
    const { data } = await api('GET', '/api/mod-version');
    $('modVersionInfo').innerHTML = data && data.version ? `<div class="mod-version">Version: ${data.version}</div>` : `<div class="mod-version" style="color:var(--orange);">No mod uploaded yet</div>`;
}

$('claimKeyBtn').addEventListener('click', async () => {
    const key = $('keyInput').value.trim().toUpperCase();
    if (!key) return showStatus('dashStatus', 'Enter a license key', 'error');
    const btn = $('claimKeyBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const { ok, data } = await api('POST', '/api/claim-key', { key });
    btn.disabled = false; btn.textContent = 'Activate';
    if (ok) { showStatus('dashStatus', 'Key activated! Subscription until: ' + formatDate(data.expiresAt), 'success'); $('keyInput').value = ''; loadKeys(); }
    else { showStatus('dashStatus', data.error || 'Activation failed', 'error'); }
});
$('keyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('claimKeyBtn').click(); });
$('downloadBtn').addEventListener('click', () => { window.location.href = '/api/download-mod'; });

// ===== Admin =====
async function goAdmin() { showPage('admin'); loadAdminData(); }
async function loadAdminData() { loadOnlineUsers(); loadUsersTable(); loadKeysTable(); loadActivity(); }

async function loadOnlineUsers() {
    const { ok, data } = await api('GET', '/api/admin/online-count');
    if (ok) { $('onlineUsers').innerHTML = `<div style="font-size:36px;font-weight:800;color:var(--accent);">${data.count}</div><div style="font-size:13px;color:var(--text-dim);margin-top:4px;">users online (5 min)</div><div style="font-size:12px;color:var(--text-dim);margin-top:8px;">${data.users.join(', ') || '—'}</div>`; }
    else { $('onlineUsers').innerHTML = '<div style="color:var(--red);">Access denied</div>'; }
}

async function loadUsersTable() {
    const { ok, data } = await api('GET', '/api/admin/users');
    if (!ok) { $('usersTableContainer').innerHTML = '<div style="color:var(--red);padding:16px;">Access denied</div>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Status</th><th>Actions</th><th>Key</th></tr></thead><tbody>';
    data.forEach(u => {
        const roleBadge = u.role === 'superadmin' ? 'badge-superadmin' : u.role === 'admin' ? 'badge-admin' : u.role === 'user' ? 'badge-yes' : 'badge-no';
        html += `<tr>
            <td><strong>${u.username}</strong></td>
            <td><span class="badge ${roleBadge}">${u.role}</span></td>
            <td style="color:var(--text-dim);font-size:12px;">${formatDate(u.createdAt)}</td>
            <td>${u.banned ? '<span class="badge badge-banned">Banned</span>' : '<span class="badge badge-yes">Active</span>'}</td>
            <td>
                <div class="admin-actions">
                    ${renderRoleControls(u)}
                    ${u.role !== 'superadmin' ? `<button class="btn btn-sm ${u.banned ? 'btn-green' : 'btn-red'}" onclick="toggleBan('${u.username}', ${!u.banned})">${u.banned ? 'Unban' : 'Ban'}</button>` : ''}
                </div>
            </td>
            <td>
                ${u.role !== 'superadmin' ? `<button class="btn btn-sm btn-ghost" onclick="showUserKeyInput('${u.username}')">+Key</button>` : ''}
                <div id="keyInput_${u.username}" style="display:none;margin-top:6px;">
                    <div style="display:flex;gap:4px;">
                        <input class="form-input" type="number" id="keyDays_${u.username}" value="30" min="1" max="365" style="width:60px;padding:4px 8px;">
                        <button class="btn btn-sm btn-green" onclick="assignKey('${u.username}')">OK</button>
                    </div>
                </div>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    $('usersTableContainer').innerHTML = html;
}

function renderRoleControls(u) {
    if (u.role === 'superadmin') return '<span style="color:var(--orange);font-size:11px;">—</span>';
    const isSuper = state.role === 'superadmin';
    const isAdmin = state.role === 'admin';
    if (isSuper) {
        return `<select class="form-input" style="width:auto;padding:4px 8px;font-size:12px;" onchange="setRole('${u.username}', this.value)">
            <option value="not_user" ${u.role === 'not_user' ? 'selected' : ''}>Not User</option>
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>`;
    }
    if (isAdmin) {
        return `<button class="btn btn-sm ${u.role === 'user' ? 'btn-red' : 'btn-green'}" onclick="setRole('${u.username}', '${u.role === 'user' ? 'not_user' : 'user'}')">${u.role === 'user' ? 'Revoke' : 'Grant'} User</button>`;
    }
    return '';
}

async function setRole(username, newRole) {
    const { ok, data } = await api('POST', '/api/admin/set-role', { targetUsername: username, newRole });
    if (ok) { loadUsersTable(); showStatus('adminStatus', `${username} → ${newRole}`, 'success'); }
    else showStatus('adminStatus', data.error || 'Failed', 'error');
}

async function toggleBan(username, ban) {
    const { ok } = await api('POST', '/api/admin/ban-user', { username, ban });
    if (ok) { loadUsersTable(); showStatus('adminStatus', ban ? 'Banned' : 'Unbanned', 'success'); }
    else showStatus('adminStatus', 'Failed', 'error');
}

function showUserKeyInput(username) {
    const el = $('keyInput_' + username);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function assignKey(username) {
    const days = parseInt($('keyDays_' + username).value) || 30;
    const { ok, data } = await api('POST', '/api/admin/user-key', { targetUsername: username, durationDays: days });
    if (ok) {
        showStatus('adminStatus', `Key for ${username}: ${data.key} (${days} days)`, 'success');
        $('keyInput_' + username).style.display = 'none';
        loadKeysTable();
    } else { showStatus('adminStatus', data.error || 'Failed', 'error'); }
}

async function loadKeysTable() {
    const { ok, data } = await api('GET', '/api/admin/keys');
    if (!ok) { $('keysTableContainer').innerHTML = '<div style="color:var(--red);padding:16px;">Access denied</div>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Key</th><th>Owner</th><th>Created</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>';
    if (!data.length) html += '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">No keys</td></tr>';
    data.forEach(k => {
        const expired = new Date(k.expiresAt) < new Date();
        const status = !k.active ? 'Deactivated' : expired ? 'Expired' : 'Active';
        const statusClass = !k.active ? 'badge-no' : expired ? 'badge-banned' : 'badge-yes';
        html += `<tr><td style="font-family:monospace;font-size:12px;">${k.key}</td><td>${k.claimedBy || '<span style="color:var(--text-dim);">—</span>'}</td><td style="color:var(--text-dim);font-size:12px;">${formatDate(k.createdAt)}</td><td style="color:var(--text-dim);font-size:12px;">${formatDate(k.expiresAt)}</td><td><span class="badge ${statusClass}">${status}</span></td><td><div class="admin-actions"><button class="btn btn-sm ${k.active ? 'btn-red' : 'btn-green'}" onclick="toggleKey('${k.key}', ${!k.active})">${k.active ? 'Deactivate' : 'Activate'}</button><button class="btn btn-sm btn-ghost" onclick="regenerateKey('${k.key}')">Regen</button><button class="btn btn-sm btn-red" onclick="deleteKey('${k.key}')">Delete</button></div></td></tr>`;
    });
    html += '</tbody></table>';
    $('keysTableContainer').innerHTML = html;
}

async function toggleKey(key, active) {
    const { ok } = await api('POST', '/api/admin/toggle-key', { key, active });
    if (ok) { loadKeysTable(); showStatus('adminStatus', active ? 'Activated' : 'Deactivated', 'success'); }
}

async function deleteKey(key) {
    if (!confirm('Delete key ' + key + '?')) return;
    const { ok } = await api('POST', '/api/admin/delete-key', { key });
    if (ok) { loadKeysTable(); showStatus('adminStatus', 'Key deleted', 'success'); }
    else showStatus('adminStatus', 'Failed to delete', 'error');
}

async function regenerateKey(key) {
    if (!confirm('Regenerate key ' + key + '?')) return;
    const btn = event.target;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const { ok, data } = await api('POST', '/api/admin/regenerate-key', { key });
    if (ok) {
        loadKeysTable();
        showStatus('adminStatus', `New key: ${data.key} (expires: ${formatDate(data.expiresAt)})`, 'success');
    } else {
        showStatus('adminStatus', data.error || 'Failed', 'error');
        btn.disabled = false; btn.textContent = 'Regen';
    }
}

async function loadActivity() {
    const { ok, data } = await api('GET', '/api/admin/activity');
    if (!ok) { $('activityContainer').innerHTML = '<div style="color:var(--red);padding:16px;">Access denied</div>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead><tbody>';
    if (!data.length) html += '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No activity</td></tr>';
    data.slice().reverse().forEach(a => { html += `<tr><td style="color:var(--text-dim);font-size:12px;">${formatDate(a.timestamp)}</td><td>${a.username}</td><td style="color:var(--text-dim);">${a.details || a.action}</td></tr>`; });
    html += '</tbody></table>';
    $('activityContainer').innerHTML = html;
}

$('createKeyBtn').addEventListener('click', async () => {
    const days = parseInt($('keyDuration').value) || 30;
    const btn = $('createKeyBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const { ok, data } = await api('POST', '/api/admin/create-key', { durationDays: days });
    btn.disabled = false; btn.textContent = 'Generate';
    if (ok) { $('newKeyResult').innerHTML = `Key: <strong>${data.key}</strong><br>Expires: ${formatDate(data.expiresAt)}`; loadKeysTable(); showStatus('adminStatus', 'Key created!', 'success'); }
    else showStatus('adminStatus', data.error || 'Failed', 'error');
});

// ===== Logout =====
async function logout() { await api('POST', '/api/logout'); handleLogout(); }
function handleLogout() {
    state.user = null; state.role = null; state.keys = [];
    showPage('auth'); updateNav();
    showRegister();
    $('regUsername').value = ''; $('regPassword').value = ''; $('regRemember').checked = false;
    $('loginUsername').value = ''; $('loginPassword').value = ''; $('loginRemember').checked = false;
}
function goDashboard() { showPage('dashboard'); loadDashboard(); }
function goAdmin() { showPage('admin'); loadAdminData(); }

// ===== Utilities =====
function showStatus(id, msg, type) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg; el.className = 'status ' + type;
    el.classList.remove('visible'); void el.offsetWidth; el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 5000);
}
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ===== Init =====
(async function init() {
    const { ok, data } = await api('GET', '/api/me');
    if (ok && data && data.username) {
        state.user = data.username; state.role = data.role;
        loadDashboard(); showPage('dashboard');
    } else { showPage('auth'); updateNav(); showRegister(); }
})();
