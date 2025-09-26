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
        const vInT = (await getText(4)) || '0';
        const vOutT = (await getText(5)) || '0';

        const symbol = (symbolT || 'UNKNOWN').replace(/\s+/g, '');
        const name = nameT || '';
        const price = parseNumber(priceT);
        const changePercent = parseNumber(changeT);
        const volumeIn = parseNumber(vInT);
        const volumeOut = parseNumber(vOutT);
        const netVol = volumeIn - volumeOut;

        appendHistory(symbol, price, volumeIn, volumeOut);
        const history = readHistoryPrices(symbol);
        if (history.length === 0 || history[history.length - 1] !== price) history.push(price);
        const ema9 = calculateEMA(history, 9);
        const ema20 = calculateEMA(history, 20);

        let signal = 0;
        if (ema9 && ema20) {
          if (ema9 > ema20) signal = 1;
          else if (ema9 < ema20) signal = -1;
        }
        let finalSignal = signal;
        if (signal === 1 && netVol <= 0) finalSignal = 0;
        const action = finalSignal === 1 ? 'شراء' : (finalSignal === -1 ? 'بيع' : 'انتظار');

        results.push({
          Symbol: symbol,
          Name: name,
          Price: price,
          ChangePercent: changePercent,
          VolumeIn: volumeIn,
          VolumeOut: volumeOut,
          NetVolume: netVol,
          EMA9: ema9 ? ema9.toFixed(4) : '',
          EMA20: ema20 ? ema20.toFixed(4) : '',
          Action: action
        });
      } catch (e) {
        log('row processing error', e.message || e);
      }
    }

    // atomic write summary: write tmp then rename
    const headers = ['Symbol','Name','Price','Change%','VolIn','VolOut','NetVol','EMA9','EMA20','Action'];
    const tmpWriter = createCsvWriter({
      path: SUMMARY_TMP,
      header: headers.map(h => ({ id: h, title: h }))
    });
    // map result keys to header ids
    const rowsToWrite = results.map(r => ({
      Symbol: r.Symbol,
      Name: r.Name,
      Price: r.Price,
      'Change%': r.ChangePercent,
      VolIn: r.VolumeIn,
      VolOut: r.VolumeOut,
      NetVol: r.NetVolume,
      EMA9: r.EMA9,
      EMA20: r.EMA20,
      Action: r.Action
    }));
    await tmpWriter.writeRecords(rowsToWrite);
    fs.renameSync(SUMMARY_TMP, SUMMARY_FILE);
    log('Wrote summary.csv with', results.length, 'rows');

  } catch (err) {
    log('scraper error', err.stack || err);
  } finally {
    await browser.close();
    log('Scraper finished');
  }
})();
