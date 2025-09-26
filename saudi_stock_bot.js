// saudi_stock_bot.js (محدثة للصفحة الحية لتداول السعودية)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const SITE_URL = 'https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch/';
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
  txt = String(txt).replac
