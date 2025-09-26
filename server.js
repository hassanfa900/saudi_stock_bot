// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/lib/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const repoRoot = path.dirname(__filename);
const summaryFile = path.join(repoRoot, 'summary.csv');
const publicDir = path.join(repoRoot, 'public');

app.use(express.static(publicDir));

app.get('/api/summary', (req, res) => {
  try {
    if (!fs.existsSync(summaryFile)) return res.json({ data: [], message: 'summary.csv not found' });
    const raw = fs.readFileSync(summaryFile, 'utf8');
    const records = csvParse(raw, { columns: true, skip_empty_lines: true });
    const data = records.map(r => ({
      Symbol: r.Symbol,
      Name: r.Name,
      Price: parseFloat(r.Price) || 0,
      ChangePercent: parseFloat(r['Change%']) || 0,
      VolIn: parseFloat(r.VolIn) || 0,
      VolOut: parseFloat(r.VolOut) || 0,
      NetVol: parseFloat(r.NetVol) || 0,
      EMA9: r.EMA9 || '',
      EMA20: r.EMA20 || '',
      Action: r.Action || ''
    }));
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read summary.csv' });
  }
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
