module.exports = {
apps: [
{
name: 'saudi_scraper',
script: 'saudi_stock_bot.js',
interpreter: 'node',
instances: 1,
autorestart: true,
watch: false,
cron_restart: '*/5 * * * *',
max_memory_r
