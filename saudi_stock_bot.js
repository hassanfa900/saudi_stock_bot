// saudi_stock_bot.js
// Requires: node >=18, playwright, csv-writer, dotenv
// Purpose: Robust Playwright scraper for Saudi Exchange → writes atomic summary.csv + per-symbol history

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const SITE_URL = process.env.SITE_URL || 'https://www.saudiexchange.sa/';
const ROW_SELECTOR = process.env.ROW_SELECTOR || 'table tbody tr';
const DATA_DIR = path.join(__dirname, 'data');
const SUMMARY_TMP = path.join(__dirname, 'summary.tmp.csv');
const SUMMARY_FILE = path.join(__dirname, 'summary.csv');
const LOG_FILE = path.join(__dirname, 'scraper.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(...args);
}

function parseNumber(txt) {
  if (!txt) return 0;
  txt = String(txt).replace(/[,٪% ]+/g, '').replace(/--/g, '0');
  const n = parseFloat(txt);
  return isNaN(n) ? 0 : n;
}

function calculateEMA(values, window) {
  if (!values || values.length === 0) return null;
  const k = 2 / (window + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function readHistoryPrices(symbol) {
  const file = path.join(DATA_DIR, `${symbol}.csv`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const values = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const price = parseFloat(cols[1]);
    if (!isNaN(price)) values.push(price);
  }
  return values;
}

function appendHistory(symbol, price, volIn, volOut) {
  const file = path.join(DATA_DIR, `${symbol}.csv`);
  const timestamp = new Date().toISOString();
  const safeLine = `${timestamp},${price},${volIn},${volOut}\n`;
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, 'timestamp,price,volume_in,volume_out\n' + safeLine);
  } else {
    fs.appendFileSync(file, safeLine);
  }
}

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch (e) {
      log('goto attempt', i + 1, 'failed, retrying...', e.message || e);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Failed to goto ' + url);
}

(async () => {
  log('Scraper started');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  try {
    await safeGoto(page, SITE_URL);
    await page.waitForSelector(ROW_SELECTOR, { timeout: 15000 });

    const rows = await page.$$(ROW_SELECTOR);
    log('rows found', rows.length);
    const results = [];

    for (const row of rows) {
      try {
        const cells = await row.$$('td');
        if (!cells || cells.length < 3) continue;

        // read texts safely
        async function getText(i) {
          try {
            const el = cells[i];
            if (!el) return '';
            const t = await el.innerText();
            return t ? t.trim() : '';
          } catch {
            return '';
          }
        }

        const symbolT = await getText(0);
        const nameT = await getText(1);
        const priceT = await getText(2);
        const changeT = await getText(3);
        // try to find volume columns by index or fallback to some next columns
        const vInT = (aw
