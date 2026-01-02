const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DEFAULT_STATE = {
  users: [],
  courses: [],
  liveSessions: [],
  progressRecords: []
};

function ensureDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function readDatabase() {
  ensureDatabase();
  const content = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(content);
}

function writeDatabase(data) {
  ensureDatabase();
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(DB_PATH, content, 'utf8');
}

function generateId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

module.exports = {
  DB_PATH,
  readDatabase,
  writeDatabase,
  generateId
};
