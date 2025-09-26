// saudi_stock_bot.js
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


const headers = ['Symbol','Name','Price','Change%','VolIn','VolOut','NetVol','EMA9','EMA20','Action'];
const tmpWriter = createCsvWriter({ path: SUMMARY_TMP, header: headers.map(h => ({ id: h, title: h })) });
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
