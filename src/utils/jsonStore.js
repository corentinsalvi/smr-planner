const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COLLECTIONS = ['employes', 'disponibilites', 'patients', 'besoins', 'creneaux', 'calendar_sync_tokens', 'absences'];
const locks = {};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const col of COLLECTIONS) {
    const filePath = path.join(DATA_DIR, `${col}.json`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]');
    }
  }
}

function filePath(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function readAll(collection) {
  ensureDataDir();
  const raw = fs.readFileSync(filePath(collection), 'utf8');
  return JSON.parse(raw || '[]');
}

function writeAllSync(collection, data) {
  ensureDataDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2));
}

async function withWriteLock(collection, fn) {
  while (locks[collection]) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  locks[collection] = true;
  try {
    const data = readAll(collection);
    const { data: newData, returnValue } = await fn(data);
    writeAllSync(collection, newData);
    return returnValue;
  } finally {
    locks[collection] = false;
  }
}

module.exports = { readAll, writeAllSync, withWriteLock };
