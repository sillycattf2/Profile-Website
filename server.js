const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'members.db');

// Middleware
app.use(express.json({ limit: '50mb' }));

// Healthcheck endpoint (must be BEFORE static middleware for Railway)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (must be BEFORE static middleware)
// ... all API routes will be added here ...

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    socials TEXT,
    songs TEXT,
    joined TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    used INTEGER DEFAULT 0,
    createdBy TEXT,
    createdAt TEXT,
    usedBy TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY
  )`);
});

// Helper functions
function randomSalt() {
  return crypto.randomBytes(16).toString('hex');
}

async function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
}

// Auth middleware
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const username = auth.slice(7);
  db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Unauthorized' });
    req.user = username;
    next();
  });
}

async function requireAdmin(req, res, next) {
  db.get('SELECT username FROM admins WHERE username = ?', [req.user], (err, row) => {
    if (err || !row) return res.status(403).json({ error: 'Admin required' });
    next();
  });
}

// API Routes

// Get all usernames
app.get('/api/usernames', (req, res) => {
  db.all('SELECT username FROM users ORDER BY joined', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ usernames: rows.map(r => r.username) });
  });
});

// Get profile
app.get('/api/profile/:username', (req, res) => {
  db.get('SELECT username, avatar, bio, socials, songs, joined FROM users WHERE username = ?', [req.params.username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...row,
      socials: JSON.parse(row.socials || '[]'),
      songs: JSON.parse(row.songs || '[]')
    });
  });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Invalid credentials' });
    const hash = await hashPassword(password, row.salt);
    if (hash !== row.password) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ 
      token: username,
      profile: {
        username: row.username,
        avatar: row.avatar,
        bio: row.bio,
        socials: JSON.parse(row.socials || '[]'),
        songs: JSON.parse(row.songs || '[]'),
        joined: row.joined
      }
    });
  });
});

// Register
app.post('/api/register', async (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!/^[a-zA-Z0-9_\-]{2,24}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  const count = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });

  const isFirst = count === 0;

  if (!isFirst) {
    const invite = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM invites WHERE code = ? AND used = 0', [inviteCode], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!invite) return res.status(400).json({ error: 'Invalid or used invite code' });
    db.run('UPDATE invites SET used = 1, usedBy = ? WHERE code = ?', [username, inviteCode]);
  }

  const existing = await new Promise((resolve, reject) => {
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  if (existing) return res.status(400).json({ error: 'Username taken' });

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const joined = new Date().toISOString();

  db.run(
    'INSERT INTO users (username, password, salt, avatar, bio, socials, songs, joined) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [username, hash, salt, '', '', '[]', '[]', joined],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (isFirst) {
        db.run('INSERT INTO admins (username) VALUES (?)', [username]);
      }
      res.json({ 
        token: username,
        profile: { username, avatar: '', bio: '', socials: [], songs: [], joined }
      });
    }
  );
});

// Update profile
app.put('/api/profile', requireAuth, (req, res) => {
  const { avatar, bio, socials, songs } = req.body;
  db.run(
    'UPDATE users SET avatar = ?, bio = ?, socials = ?, songs = ? WHERE username = ?',
    [avatar || '', bio || '', JSON.stringify(socials || []), JSON.stringify(songs || []), req.user],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Get invites
app.get('/api/invites', requireAuth, requireAdmin, (req, res) => {
  db.all('SELECT * FROM invites ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const invites = {};
    rows.forEach(r => {
      invites[r.code] = {
        used: !!r.used,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        usedBy: r.usedBy
      };
    });
    res.json({ invites });
  });
});

// Generate invite
app.post('/api/invites', requireAuth, requireAdmin, (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const code = part() + '-' + part();
  const createdAt = new Date().toISOString();

  db.run('INSERT INTO invites (code, createdBy, createdAt) VALUES (?, ?, ?)', [code, req.user, createdAt], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ code, createdBy: req.user, createdAt });
  });
});

// Get admins
app.get('/api/admins', (req, res) => {
  db.all('SELECT username FROM admins', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ admins: rows.map(r => r.username) });
  });
});

// Toggle admin
app.post('/api/admins/:username', requireAuth, requireAdmin, (req, res) => {
  const target = req.params.username;

  db.get('SELECT COUNT(*) as count FROM admins', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT username FROM admins WHERE username = ?', [target], (err, adminRow) => {
      if (adminRow) {
        if (row.count <= 1) return res.status(400).json({ error: 'At least one admin required' });
        db.run('DELETE FROM admins WHERE username = ?', [target], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ admin: false });
        });
      } else {
        db.run('INSERT INTO admins (username) VALUES (?)', [target], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ admin: true });
        });
      }
    });
  });
});

// Get all profiles (for CSV export)
app.get('/api/members', requireAuth, requireAdmin, (req, res) => {
  db.all('SELECT username, joined, bio FROM users ORDER BY joined', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ members: rows });
  });
});

// Static files (MUST be after API routes)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html for any non-API route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
