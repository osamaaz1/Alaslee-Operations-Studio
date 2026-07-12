# متطلبات وتشغيل Alaslee Operations Studio على Windows 11

هذا الدليل يفترض جهاز Windows 11 جديداً لا يحتوي على أدوات تطوير. سكربت الإعداد يثبت الأدوات ويجهز المشروع تلقائياً، ولا يستبدل ملف `.env` موجوداً إلا عند طلب ذلك صراحة.

## متطلبات الجهاز

- Windows 11 بنظام 64-bit ومحدّث عبر Windows Update.
- صلاحية Administrator أثناء الإعداد الأول فقط.
- اتصال إنترنت لتنزيل Node.js وGit وDocker Desktop وحزم npm وصورة PostgreSQL.
- مساحة خالية موصى بها: 15 GB على الأقل.
- ذاكرة: 8 GB كحد عملي أدنى، و16 GB موصى بها.
- تفعيل Virtualization (Intel VT-x أو AMD-V) من UEFI/BIOS لتشغيل WSL 2 وDocker.
- وجود ملفات المشروع في مسار محلي، والمسار الحالي المدعوم هو `D:\Codex\Alaslee-Operations-Studio`.

## ما الذي يتم تثبيته؟

عند تشغيل `setup-windows.cmd` يثبت السكربت تلقائياً عبر WinGet:

1. Node.js LTS مع npm.
2. Git for Windows.
3. WSL 2 ومكوّناته.
4. Docker Desktop.
5. حزم المشروع بالإصدارات المقفلة في `package-lock.json` باستخدام `npm ci`.
6. PostgreSQL 16 داخل Docker، ثم ترحيلات قاعدة بيانات CRM.

بعدها ينشئ `.env` للمرة الأولى بقيم محلية عشوائية، ويستخدم `free-test` افتراضياً كي يعمل النظام بلا حسابات AI مدفوعة، ثم يبني الواجهة ويشغل الاختبارات.

## التثبيت الأول

1. افتح مجلد المشروع.
2. انقر نقراً مزدوجاً على `setup-windows.cmd`.
3. وافق على نافذة Administrator.
4. إذا طلب Windows أو WSL أو Docker إعادة تشغيل الجهاز، أعد تشغيله ثم شغّل `setup-windows.cmd` مرة أخرى. السكربت آمن لإعادة التشغيل ولا يحذف `.env` الحالي.
5. في أول تشغيل لـDocker Desktop، وافق على اتفاقية الاستخدام وانتظر ظهور حالة التشغيل، ثم أعد السكربت إذا كان قد توقف بانتظار Docker.

يسجل السكربت رقمي PIN عشوائيين للموظف والمشرف في `.env` ويعرضهما عند الإنشاء. لا ترفع `.env` إلى Git ولا تشاركه.

## التشغيل اليومي

للتشغيل بدون Docker، نفّذ `setup-windows-no-docker.cmd` مرة واحدة ثم انقر نقراً مزدوجاً على `start-local.cmd`. سيعمل النظام الأساسي محلياً، بينما تتطلب وظائف CRM وقاعدة بيانات العملاء PostgreSQL.

لتشغيل النظام كاملاً مع CRM، استخدم `setup-windows.cmd` للإعداد ثم `start-local-with-docker.cmd` للتشغيل اليومي.

افتح:

- الواجهة: `http://localhost:5173`
- API: `http://localhost:3000`

أوقف النظام بالضغط على `Ctrl+C` في نافذة التشغيل. عند استخدام نسخة Docker، تبقى بيانات PostgreSQL محفوظة في Docker volume ولا تضيع عند إيقاف الحاوية.

## مفاتيح الذكاء الاصطناعي (اختياري)

الوضع المحلي المجاني لا يستدعي خدمات AI. لاستخدام التوليد الفعلي، عدّل `.env` واختر أحد الخيارين:

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=ضع_المفتاح_هنا
```

أو:

```ini
AI_PROVIDER=gpt
OPENAI_API_KEY=ضع_المفتاح_هنا
```

ثم أوقف النظام وشغّل `start-local.cmd` من جديد.

## خيارات متقدمة وحل المشكلات

شغّل الخيارات التالية من PowerShell داخل مجلد المشروع:

```powershell
# إعادة إنشاء .env (يحفظ نسخة احتياطية أولاً)
.\setup-windows.ps1 -ForceEnvironment

# تجهيز الوظائف التي لا تحتاج CRM/PostgreSQL فقط
.\setup-windows.ps1 -SkipDocker

# تخطي البناء والاختبارات لتجهيز أسرع
.\setup-windows.ps1 -SkipTests
```

- إذا لم يتوفر `winget`، ثبّت أو حدّث **App Installer** من Microsoft Store ثم أعد المحاولة.
- إذا أبلغ Docker أن virtualization غير متاح، فعّله من UEFI/BIOS ثم أعد تشغيل Windows.
- إذا بقي Docker في وضع Starting، نفّذ `wsl --update` من PowerShell كمسؤول ثم أعد تشغيل الجهاز.
- إذا كان المنفذ `5433` مستخدماً، غيّر `CRM_POSTGRES_PORT` وموضع المنفذ داخل `CRM_DATABASE_URL` في `.env` إلى الرقم نفسه.
- لا تشغّل `npm install` يدوياً للتجهيز النظيف؛ استخدم السكربت أو `npm ci` للمحافظة على الإصدارات المقفلة.
