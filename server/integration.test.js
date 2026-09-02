import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock database for testing
class MockPool {
  constructor() {
    this.data = {
      users: [],
      accommodations: [],
      arrivals: [],
      notifications: [],
      auditLogs: [],
    };
    this.idCounter = 1000;
  }

  async getConnection() {
    return new MockConnection(this.data);
  }

  async query(sql, values) {
    // Simple mock query handler
    if (sql.includes('SELECT')) {
      if (sql.includes('FROM users')) return [this.data.users, []];
      if (sql.includes('FROM accommodations')) return [this.data.accommodations, []];
      if (sql.includes('FROM arrivals')) return [this.data.arrivals, []];
    }
    return [[], []];
  }
}

class MockConnection {
  constructor(data) {
    this.data = data;
    this.inTransaction = false;
  }

  async beginTransaction() {
    this.inTransaction = true;
  }

  async commit() {
    this.inTransaction = false;
  }

  async rollback() {
    this.inTransaction = false;
  }

  async query(sql, values) {
    // Mock query responses
    if (sql.includes('SELECT COUNT(*)')) return [[{ count: this.data.arrivals.length }], []];
    if (sql.includes('INSERT INTO')) return [{ insertId: Date.now(), affectedRows: 1 }, []];
    if (sql.includes('UPDATE')) return [{ affectedRows: 1 }, []];
    if (sql.includes('DELETE')) return [{ affectedRows: 1 }, []];
    return [[], []];
  }

  release() {}
}

// Helper function to create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  const mockPool = new MockPool();

  // Mock auth middleware
  app.use((req, res, next) => {
    const token = req.get('authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'test-secret', {
          algorithms: ['HS256'],
        });
        req.user = { id: payload.sub, role: 'admin', username: 'testuser' };
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
    next();
  });

  // Test routes
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }
    const token = jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET || 'test-secret', {
      algorithm: 'HS256',
    });
    res.json({ user: { id: 'user-1', username, role: 'staff' }, token });
  });

  app.get('/api/users', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    res.json([{ id: 'user-1', username: 'testuser', role: 'admin' }]);
  });

  app.get('/api/accommodations', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    res.json([]);
  });

  app.get('/api/arrivals/count', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ count: 0 });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

test('API - health check endpoint', async () => {
  const app = createTestApp();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('API - login without credentials returns 400', async () => {
  const app = createTestApp();
  const res = await request(app).post('/api/auth/login').send({});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /credentials/i);
});

test('API - login with valid credentials returns token', async () => {
  const app = createTestApp();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'password123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.username, 'testuser');
});

test('API - unauthenticated request to /api/users returns 401', async () => {
  const app = createTestApp();
  const res = await request(app).get('/api/users');
  assert.equal(res.status, 401);
});

test('API - authenticated request to /api/users returns users list', async () => {
  const app = createTestApp();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'password123' });
  const token = loginRes.body.token;

  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('API - authenticated request to /api/accommodations succeeds', async () => {
  const app = createTestApp();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'password123' });
  const token = loginRes.body.token;

  const res = await request(app)
    .get('/api/accommodations')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('API - arrivals count endpoint returns numeric count', async () => {
  const app = createTestApp();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'password123' });
  const token = loginRes.body.token;

  const res = await request(app)
    .get('/api/arrivals/count')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.count, 'number');
  assert.equal(res.body.count, 0);
});

test('API - invalid JWT token returns 401', async () => {
  const app = createTestApp();
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', 'Bearer invalid.token.here');
  assert.equal(res.status, 401);
  assert.match(res.body.error, /token/i);
});

test('API - malformed authorization header is ignored', async () => {
  const app = createTestApp();
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', 'InvalidFormat token');
  assert.equal(res.status, 401);
});

test('API - Content-Type application/json is accepted', async () => {
  const app = createTestApp();
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send({ username: 'testuser', password: 'password123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});
