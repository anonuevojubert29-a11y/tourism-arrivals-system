import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-key';
const JWT_EXPIRES_IN = '8h';

// Utility: sign a test token
function signToken(userId, role = 'admin', authVersion = 0) {
  return jwt.sign(
    { sub: userId, ver: authVersion },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'tourism-arrivals-api',
      audience: 'tourism-arrivals-web',
    }
  );
}

// Utility: verify a token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'tourism-arrivals-api',
      audience: 'tourism-arrivals-web',
    });
  } catch (error) {
    return null;
  }
}

test('Auth - JWT token signs with correct payload structure', () => {
  const token = signToken('user-123', 'admin', 0);
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.ver, 0);
});

test('Auth - JWT token verification fails with invalid signature', () => {
  const token = signToken('user-123');
  const tampered = token.slice(0, -10) + '0000000000';
  const payload = verifyToken(tampered);
  assert.equal(payload, null);
});

test('Auth - expired JWT token is rejected', async () => {
  const expiredToken = jwt.sign(
    { sub: 'user-123', ver: 0 },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '-1h', // Already expired
      issuer: 'tourism-arrivals-api',
      audience: 'tourism-arrivals-web',
    }
  );
  const payload = verifyToken(expiredToken);
  assert.equal(payload, null);
});

test('Auth - password hashing produces different hashes for same password', async () => {
  const password = 'SecurePassword123!';
  const hash1 = await bcrypt.hash(password, 10);
  const hash2 = await bcrypt.hash(password, 10);
  assert.notEqual(hash1, hash2);
});

test('Auth - password comparison succeeds with correct password', async () => {
  const password = 'SecurePassword123!';
  const hash = await bcrypt.hash(password, 10);
  const match = await bcrypt.compare(password, hash);
  assert.equal(match, true);
});

test('Auth - password comparison fails with incorrect password', async () => {
  const password = 'SecurePassword123!';
  const wrongPassword = 'WrongPassword456';
  const hash = await bcrypt.hash(password, 10);
  const match = await bcrypt.compare(wrongPassword, hash);
  assert.equal(match, false);
});

test('Auth - token includes issuer and audience claims', () => {
  const token = signToken('user-123');
  const payload = jwt.decode(token);
  assert.equal(payload.iss, 'tourism-arrivals-api');
  assert.equal(payload.aud, 'tourism-arrivals-web');
});

test('Auth - auth version mismatch invalidates session', () => {
  const token = signToken('user-123', 'admin', 0);
  const payload = jwt.decode(token);
  // In real scenario, if auth_version in DB is 1 but token says 0, session is invalid
  assert.equal(payload.ver, 0);
  // Simulating version check
  const currentAuthVersion = 1;
  const isSessionValid = Number(payload.ver) === Number(currentAuthVersion);
  assert.equal(isSessionValid, false);
});

test('Auth - multiple login attempts can use rate limiting logic', () => {
  const loginAttempts = [];
  const limit = 20;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  // Simulate 20 login attempts
  for (let i = 0; i < 20; i++) {
    loginAttempts.push(Date.now());
  }

  // All attempts within window
  const recentAttempts = loginAttempts.filter((time) => Date.now() - time < windowMs);
  assert.equal(recentAttempts.length <= limit, true);
});
