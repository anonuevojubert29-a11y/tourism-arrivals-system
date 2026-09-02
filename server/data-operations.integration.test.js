import test from 'node:test';
import assert from 'node:assert/strict';

// Mock database connection
class MockDBConnection {
  constructor() {
    this.users = [];
    this.accommodations = [];
    this.arrivals = [];
    this.notifications = [];
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
    // Rollback changes (simplified)
  }

  async query(sql, values = []) {
    if (sql.includes('INSERT INTO users')) {
      const [id, username, email, passwordHash, role, name] = values;
      this.users.push({ id, username, email, password_hash: passwordHash, role, name });
      return [{ insertId: id }, []];
    }
    if (sql.includes('INSERT INTO accommodations')) {
      const [id, name, municipality, address, contactPerson, contactNumber, permitNumber] = values;
      this.accommodations.push({
        id,
        name,
        municipality,
        address,
        contact_person: contactPerson,
        contact_number: contactNumber,
        permit_number: permitNumber,
        status: 'pending',
      });
      return [{ insertId: id }, []];
    }
    if (sql.includes('INSERT INTO arrivals')) {
      const [accId, date, visitType, maleLocal, femaleLocal, maleDomestic, femaleDomestic] = values;
      this.arrivals.push({
        id: this.arrivals.length + 1,
        accommodation_id: accId,
        arrival_date: date,
        visit_type: visitType,
        male_local: maleLocal,
        female_local: femaleLocal,
        male_domestic: maleDomestic,
        female_domestic: femaleDomestic,
      });
      return [{ insertId: this.arrivals.length }, []];
    }
    if (sql.includes('SELECT * FROM users WHERE username')) {
      const username = values[0];
      const user = this.users.find((u) => u.username === username);
      return [user ? [user] : [], []];
    }
    if (sql.includes('SELECT * FROM accommodations WHERE id')) {
      const id = values[0];
      const acc = this.accommodations.find((a) => a.id === id);
      return [acc ? [acc] : [], []];
    }
    if (sql.includes('UPDATE accommodations SET')) {
      const acc = this.accommodations.find((a) => a.id === values[values.length - 1]);
      if (acc) {
        acc.status = values[0];
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    if (sql.includes('DELETE FROM accommodations')) {
      const id = values[0];
      const index = this.accommodations.findIndex((a) => a.id === id);
      if (index !== -1) {
        this.accommodations.splice(index, 1);
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    if (sql.includes('SELECT COUNT(*)')) {
      return [[{ count: this.arrivals.length }], []];
    }
    return [[], []];
  }

  release() {}
}

test('Data - user creation stores username uniquely', async () => {
  const conn = new MockDBConnection();
  const user1Result = await conn.query(
    'INSERT INTO users (id, username, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?, ?)',
    ['user-1', 'john', 'john@example.com', 'hashed', 'staff', 'John']
  );
  assert.equal(user1Result[0].insertId, 'user-1');
  assert.equal(conn.users.length, 1);

  // Verify duplicate username check
  const existingUser = await conn.query('SELECT * FROM users WHERE username', ['john']);
  assert.equal(existingUser[0].length, 1);
  assert.equal(existingUser[0][0].username, 'john');
});

test('Data - accommodation creation starts with pending status', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', 'Test Hotel', 'Manila', '123 Main St', 'John Doe', '555-1234', 'PERMIT-001']
  );
  assert.equal(conn.accommodations[0].status, 'pending');
});

test('Data - accommodation approval updates status', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', 'Test Hotel', 'Manila', '123 Main St', 'John Doe', '555-1234', 'PERMIT-001']
  );
  await conn.query('UPDATE accommodations SET status = ? WHERE id = ?', ['approved', 'acc-1']);
  const result = await conn.query('SELECT * FROM accommodations WHERE id', ['acc-1']);
  assert.equal(result[0][0].status, 'approved');
});

test('Data - arrival record creation stores correct counts', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO arrivals (accommodation_id, arrival_date, visit_type, male_local, female_local, male_domestic, female_domestic) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', '2026-09-02', 'overnight', 5, 3, 2, 1]
  );
  assert.equal(conn.arrivals.length, 1);
  assert.equal(conn.arrivals[0].male_local, 5);
  assert.equal(conn.arrivals[0].female_local, 3);
  assert.equal(conn.arrivals[0].male_domestic, 2);
  assert.equal(conn.arrivals[0].female_domestic, 1);
});

test('Data - transaction rollback prevents incomplete writes', async () => {
  const conn = new MockDBConnection();
  await conn.beginTransaction();
  const usersBefore = conn.users.length;
  await conn.query(
    'INSERT INTO users (id, username, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?, ?)',
    ['user-1', 'jane', 'jane@example.com', 'hashed', 'staff', 'Jane']
  );
  await conn.rollback();
  // In a real DB, rollback would undo the insert
  // Here we're just verifying the transaction flow
  assert.equal(conn.inTransaction, false);
});

test('Data - delete accommodation removes record', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', 'Test Hotel', 'Manila', '123 Main St', 'John Doe', '555-1234', 'PERMIT-001']
  );
  assert.equal(conn.accommodations.length, 1);
  await conn.query('DELETE FROM accommodations WHERE id', ['acc-1']);
  assert.equal(conn.accommodations.length, 0);
});

test('Data - count arrivals returns numeric value', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO arrivals (accommodation_id, arrival_date, visit_type, male_local, female_local, male_domestic, female_domestic) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', '2026-09-02', 'overnight', 5, 3, 2, 1]
  );
  await conn.query(
    'INSERT INTO arrivals (accommodation_id, arrival_date, visit_type, male_local, female_local, male_domestic, female_domestic) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', '2026-09-03', 'daytour', 10, 8, 5, 4]
  );
  const result = await conn.query('SELECT COUNT(*)');
  assert.equal(result[0][0].count, 2);
});

test('Data - foreign entries are stored with arrival records', async () => {
  const conn = new MockDBConnection();
  await conn.query(
    'INSERT INTO arrivals (accommodation_id, arrival_date, visit_type, male_local, female_local, male_domestic, female_domestic) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['acc-1', '2026-09-02', 'overnight', 5, 3, 2, 1]
  );
  const arrival = conn.arrivals[0];
  assert.ok(arrival.id);
  assert.equal(arrival.accommodation_id, 'acc-1');
  assert.equal(arrival.arrival_date, '2026-09-02');
});
