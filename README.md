# Saudi Stock Bot

سكربت بسيط يستخدم Playwright لسحب بيانات أسهم من موقع تداول، يحفظ تاريخ الأسعار لكل سهم، ويحسب EMA9/EMA20 وصافي السيولة ليعطي Action: شراء/انتظار/بيع.

## إعداد على السيرفر (Ubuntu 22.04)
1. تثبيت الحزم الأساسية (نفّذ على السيرفر عبر SSH):
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl wget git python3 python3-pip nodejs npm
sudo apt install -y xvfb libnss3 libatk1.0-0 libcups2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0
