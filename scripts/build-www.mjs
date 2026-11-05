// نسخ ملفات الويب إلى www/ ليغلّفها Capacitor داخل تطبيق Android
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const p of ['index.html', 'css', 'js']) cpSync(p, `www/${p}`, { recursive: true });
console.log('www/ ready');
