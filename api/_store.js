const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve data directory: local ./data or /tmp in serverless environments
let dataDir = path.join(process.cwd(), 'data');
let dataFile = path.join(dataDir, 'visitors.json');

try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  // If running in read-only filesystem (serverless), fallback to /tmp
  dataDir = path.join('/tmp', 'data');
  dataFile = path.join(dataDir, 'visitors.json');
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {}
}

function getStore() {
  try {
    if (fs.existsSync(dataFile)) {
      const raw = fs.readFileSync(dataFile, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Store] Failed to read store:', err.message);
  }
  return { months: {} };
}

function saveStore(store) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Store] Failed to write store:', err.message);
    return false;
  }
}

function getCurrentMonthKey() {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPreviousMonthKey() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function hashVisitor(visitorId, monthKey) {
  const salt = process.env.VISITOR_SALT || 'astro_space_salt_2026';
  return crypto.createHash('sha256').update(`${visitorId}:${salt}:${monthKey}`).digest('hex');
}

/**
 * Record a visit. Returns { count, month, isNew }
 */
function recordVisit(visitorId) {
  const store = getStore();
  const monthKey = getCurrentMonthKey();

  if (!store.months[monthKey]) {
    store.months[monthKey] = {
      visitors: [],
      count: 0,
      reportSent: false,
      lastUpdated: new Date().toISOString()
    };
  }

  const mData = store.months[monthKey];
  const hashed = hashVisitor(visitorId, monthKey);

  let isNew = false;
  if (!mData.visitors.includes(hashed)) {
    mData.visitors.push(hashed);
    mData.count = mData.visitors.length;
    mData.lastUpdated = new Date().toISOString();
    isNew = true;
    saveStore(store);
  }

  return {
    count: mData.count,
    month: monthKey,
    isNew
  };
}

/**
 * Get visitor count for a given month or current month
 */
function getVisitCount(monthKey = getCurrentMonthKey()) {
  const store = getStore();
  const mData = store.months[monthKey];
  return {
    count: mData ? mData.count : 0,
    month: monthKey,
    reportSent: mData ? Boolean(mData.reportSent) : false
  };
}

/**
 * Mark a month's report as sent
 */
function markReportSent(monthKey) {
  const store = getStore();
  if (!store.months[monthKey]) {
    store.months[monthKey] = { visitors: [], count: 0, reportSent: true };
  } else {
    store.months[monthKey].reportSent = true;
  }
  saveStore(store);
}

module.exports = {
  recordVisit,
  getVisitCount,
  markReportSent,
  getCurrentMonthKey,
  getPreviousMonthKey
};
