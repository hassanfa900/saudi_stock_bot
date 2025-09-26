module.exports = {
  apps: [
    {
      name: 'saudi_scraper',
      script: 'saudi_stock_bot.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '*/5 * * * *', // خيار: إعادة تشغيل كل 5 دقائق (إذا تريد)
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'saudi_web',
      script: 'server.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production', PORT: 3000 }
    }
  ]
};
