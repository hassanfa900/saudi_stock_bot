// saudi_stock_bot.js
// Requires: node, playwright, csv-writer
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

/** ========== إعدادات قابلة للتعديل ========== */
const siteUrl = 'https://www.saudiexchange.sa/'; // عدّل لصفحة السوق/المراقبة الصحيحة
const rowSelector = 'table tbody tr'; // غيّره إذا بنية الجدول مختلفة
const cellIndexes = {
  symbol: 0,
  name: 1,
  price: 2,
  changePercent: 3,
  volumeIn: 4,
  volumeOut: 5
};
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

/** ========== مساعدة ========== */
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
  const file = path.join(dataDir, `${symbol}.csv`);
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
  const file = path.join(dataDir, `${symbol}.csv`);
  const timestamp = new Date().toISOString();
  const line = `${timestamp},${price},${volIn},${volOut}\n`;
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, 'timestamp,price,volume_in,volume_out\n' + line);
  } else {
    fs.appendFileSync(file, line);
  }
}

/** ========== الرئيسية ========== */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(rowSelector, { timeout: 15000 });

    const rows = await page.$$(rowSelector);
    const results = [];
    for (const row of rows) {
      const cells = await row.$$('td');
      if (!cells || cells.length < 3) continue;

      const getText = async (idx) => {
        if (cells[idx]) {
          const t = await cells[idx].innerText();
          return t ? t.trim() : '';
        }
        return '';
      };

      const symbolText = await getText(cellIndexes.symbol);
      const nameText = await getText(cellIndexes.name);
      const priceText = await getText(cellIndexes.price);
      const changeText = await getText(cellIndexes.changePercent);
      const vInText = await getText(cellIndexes.volumeIn);
      const vOutText = await getText(cellIndexes.volumeOut);

      const symbol = symbolText || 'UNKNOWN';
      const name = nameText || '';
      const price = parseNumber(priceText);
      const changePercent = parseNumber(changeText);
      const volumeIn = parseNumber(vInText);
      const volumeOut = parseNumber(vOutText);
      const netVol = volumeIn - volumeOut;

      appendHistory(symbol, price, volumeIn, volumeOut);

      const priceHistory = readHistoryPrices(symbol);
      if (priceHistory.length === 0 || priceHistory[priceHistory.length - 1] !== price) {
        priceHistory.push(price);
      }

      const ema9 = calculateEMA(priceHistory, 9);
      const ema20 = calculateEMA(priceHistory, 20);

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
    }

    const outCsv = path.join(__dirname, 'summary.csv');
    const csvWriter = createCsvWriter({
      path: outCsv,
      header: [
        {id: 'Symbol', title: 'Symbol'},
        {id: 'Name', title: 'Name'},
        {id: 'Price', title: 'Price'},
        {id: 'ChangePercent', title: 'Change%'},
        {id: 'VolumeIn', title: 'VolIn'},
        {id: 'VolumeOut', title: 'VolOut'},
        {id: 'NetVolume', title: 'NetVol'},
        {id: 'EMA9', title: 'EMA9'},
        {id: 'EMA20', title: 'EMA20'},
        {id: 'Action', title: 'Action'}
      ]
    });
    await csvWriter.writeRecords(results);

    console.table(results.map(r => ({
      Symbol: r.Symbol,
      Name: r.Name,
      Price: r.Price,
      'Change%': r.ChangePercent,
      Action: r.Action
    })));

    console.log(`Saved summary to ${outCsv} — detailed history in ${dataDir}/<SYMBOL>.csv`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
})();
