# الأصلي | استوديو العمليات

مساحة عمليات عربية موحّدة لمتجر الأصلي: البيانات، منتجات المتجر، صور الذكاء الاصطناعي، أصول الحملات، وحالة تكامل سلة.

## تشغيل V2

على Windows 11، شغّل الإعداد الكامل بدون Docker مرة واحدة:

```powershell
.\setup-windows-no-docker.cmd
.\start-local.cmd
```

- واجهة React/Vite متاحة على `http://localhost:5173` أثناء التطوير.
- الخادم وواجهات `/v1/*` يعملان على `http://localhost:3000`.
- لنسخة الإنتاج استخدم خطوات قسم «تشغيل الإنتاج على شبكة المحل» أدناه، وليس خادم Vite.

## تشغيل الإنتاج على شبكة المحل

اضبط `.env` ثم نفّذ الاختبار المعزول. لا يغيّر هذا الاختبار قاعدة الإنتاج ولا يرسل طلب توليد صور مدفوعاً:

```powershell
npm run production:test
```

بعد نجاحه افتح PowerShell كمسؤول مرة واحدة وشغّل:

```powershell
.\scripts\install-production-windows.ps1 -EnvironmentFile .env
```

ينشئ المثبّت نسخة احتياطية، يقيد PostgreSQL، يسمح بالمنفذ 3000 لأجهزة `LocalSubnet` على شبكة Windows الخاصة فقط، ويسجل مهمة تشغيل تلقائي. لعرض عنوان IPv4 الحالي:

```powershell
.\scripts\show-lan-url.ps1
```

أوامر الصيانة:

```powershell
npm run production:preflight
npm run production:backup
npm run production:restore:verify
```

النشر الحالي يستخدم HTTP وعنوان IPv4 متغير حسب قرار المتجر؛ لا تفتح المنفذ للإنترنت، وقد يلزم تحديث رابط الأجهزة إذا غيّر الراوتر العنوان.

## تشغيل إدارة العملاء المحلية

إدارة العملاء جزء مستقل داخل واجهة Vite وليست تطبيق Streamlit. يثبت `setup-windows-no-docker.cmd` PostgreSQL 16 كخدمة Windows أصلية، وينشئ كلمات المرور ومفتاح التشفير ورقمي PIN وقاعدة CRM وترحيلاتها تلقائياً. لا يحتاج هذا المسار إلى Docker أو WSL أو Virtualization.

افتح `http://localhost:5173` واختر «إدارة العملاء». تبقى قاعدة SQLite الحالية لعمليات الصور والحملات، بينما تستخدم إدارة العملاء PostgreSQL محلياً تمهيداً للانتقال إلى Supabase دون تغيير عقود البيانات.

مزامنة دفترة اختيارية حتى توضع بيانات الربط في `DAFTRA_SUBDOMAIN` و`DAFTRA_API_KEY` أو `DAFTRA_ACCESS_TOKEN`. المزامنة للقراءة فقط كل 60 دقيقة؛ تسجيل البيع اليدوي لا يخصم المخزون من دفترة.

## ترحيل آمن من V1

راجع ما سيتم نقله أولاً، من دون أي تعديل:

```bash
npm run import:v1 -- --source "D:\\Codex\\originalEye Tool" --dry-run
```

ثم نفّذ الاستيراد عند الجاهزية:

```bash
npm run import:v1 -- --source "D:\\Codex\\originalEye Tool" --apply
```

ينقل المستورد قاعدة البيانات والأصول وملفات التحليل فقط. لا ينسخ ملفات `.env` أو المفاتيح، ويحفظ نسخة احتياطية قبل الاستبدال ويمنع تكرار المصدر نفسه.

---

Professional production workspace for uploading eyeglass references, importing product folders, generating Output 1 ecommerce images with Gemini or GPT, and explicitly preparing Output 2 Instagram images with a price label.

V2 presents this work as a single Arabic-first operations studio:

- `الرئيسية` for live operational status and priority work
- `المنتجات والإنتاج` for references, batches, and Output 1
- `الحملات` for the Brand Kit, direct sources, and Output 2
- `البيانات` for analytics, quality signals, search, and saved dashboard profiles
- `التكاملات والإعدادات` for Salla readiness, prompts, and local migration guidance

## Setup

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

During development, open the Vite client at `http://localhost:5173`. After `npm run build`, Express serves the production app from `http://localhost:3000`.

Configure `.env`:

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_API_MODE=developer
GEMINI_MODEL=gemini-3.1-flash-image
```

For a service-account-bound Gemini Enterprise Agent Platform key that uses Google Cloud billing:

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=your_bound_google_cloud_key
GEMINI_API_MODE=agent-platform
GEMINI_MODEL=gemini-3.1-flash-image
```

or GPT through the backend OpenAI image API:

```ini
AI_PROVIDER=gpt
OPENAI_API_KEY=your_openai_key
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_REQUEST_TIMEOUT_MS=180000
OPENAI_IMAGE_REQUEST_SIZE=auto
OPENAI_IMAGE_QUALITY=medium
```

Optional local settings:

```ini
ALLOWED_IMPORT_ROOTS=.
BRAND_BACKGROUND_PATH=
BRAND_LOGO_PATH=
BRAND_FOOTER_PATH=
BRAND_PRICE_LABEL_REFERENCE_PATH=
BRAND_LOGO_CORNER=top-right
```

الأصول المعتمدة في هذا المشروع هي `background.png` و`Logo.png` و`footer.png` و`Label.png` في جذر المشروع.

Branding assets can also be uploaded from the **Brand Kit** screen. The UI checks that each file is readable by the backend and reports its access status before generation.

## Free Composition Debugging

Choose **Try Free** in the generation mode menu before spending AI credits. OriginalEye switches to the local Output 2 preview workflow, so no Gemini or ChatGPT/OpenAI call is made. Upload a background-free product image at any resolution or aspect ratio, then preview the selected Instagram composition locally. The image is fitted inside a transparent 1080x1080 canvas with its original proportions preserved; it is never stretched.

Available output profiles:

- 4:5 Feed portrait — 1080x1350
- 1:1 Square post — 1080x1080
- 9:16 Story / Reel — 1080x1920
- 1.91:1 Feed landscape — 1080x566

Each profile stores its own independent layout settings. Saving 1:1 does not overwrite the saved 4:5, 9:16, or landscape calibration.

The preview controls:

- background zoom
- background horizontal and vertical crop
- product width and vertical position
- product silhouette shadow, softness, opacity, and position
- logo width, opacity, margin, position, and corner
- footer width, maximum height, opacity, horizontal position, and distance from the bottom edge

Transparent padding around logo and footer PNG files is trimmed automatically before sizing, so percentage controls apply to the visible artwork rather than the source canvas.

Choose **Save as production defaults** after calibration. The same compositor and saved settings are used for future generated Instagram images. Settings are stored locally at `uploads/branding/composition-settings.json`.

After a sample is selected, slider and logo-corner changes refresh the preview automatically. Updates are debounced and stale requests are cancelled so only the newest settings are displayed.

## API

All API responses use:

```json
{ "success": true, "data": {}, "errors": [] }
```

Upload required front, side, and 45-degree angle images. Add `temple` when available.

```bash
curl -X POST http://localhost:3000/v1/products/upload \
  -F "front=@front.jpg" \
  -F "side=@side.jpg" \
  -F "angle=@angle.jpg" \
  -F "temple=@temple.jpg"
```

Generate Output 1 ecommerce images:

```bash
curl -X POST http://localhost:3000/v1/products/generate \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"PRODUCT_ID\",\"provider\":\"gemini\"}"
```

Create a backend-only mock Output 1 without AI:

```bash
curl -X POST http://localhost:3000/v1/products/PRODUCT_ID/output-1/mock
```

Generate Output 2 Instagram images from selected Output 1 images:

```bash
curl -X POST http://localhost:3000/v1/instagram/generate \
  -H "Content-Type: application/json" \
  -d "{\"profileId\":\"portrait-4x5\",\"items\":[{\"productId\":\"PRODUCT_ID\",\"generatedImageId\":1}],\"products\":{\"PRODUCT_ID\":{\"price\":\"$129\",\"sku\":\"SKU-001\"}}}"
```

Fetch metadata:

```bash
curl http://localhost:3000/v1/products/PRODUCT_ID
curl http://localhost:3000/v1/products/PRODUCT_ID/gallery
```

Import a batch folder:

```bash
curl -X POST http://localhost:3000/v1/batches/import-folder \
  -H "Content-Type: application/json" \
  -d "{\"folderPath\":\"E:\\\\Products\\\\Batch-01\",\"provider\":\"gpt\",\"brandingEnabled\":true}"
```

Generate the imported batch:

```bash
curl -X POST http://localhost:3000/v1/batches/BATCH_ID/generate \
  -H "Content-Type: application/json" \
  -d "{\"force\":false}"
```

## Storage

Originals are stored under:

```text
uploads/originals/
```

Output 1 images are stored under:

```text
uploads/generated/
```

Batch imports are stored under:

```text
uploads/products/<batch-id>/<product-code>/originals/
uploads/products/<batch-id>/<product-code>/gallery/
uploads/products/<batch-id>/<product-code>/instagram/
```

Metadata is saved to SQLite at `data/products.sqlite` by default.

## UI Flow

The unified workspace keeps the production sequence visible throughout the app:

1. Upload or import a product in `المنتجات والإنتاج`.
2. Review the Brand Kit assets in `الحملات`.
3. Generate Output 1 ecommerce images.
4. Select an output (or upload a ready source), enter Price and SKU, and create Output 2.
5. Review sales, products, customers, and data quality in `البيانات` without leaving the tool.

The `Try Free` generation mode disables paid Output 1 and batch actions, then opens the no-cost local Output 2 preview workflow. Its browser value remains `free-test` for compatibility with existing backend records and APIs.

## Output Layers

Output 1 is independent. Each ecommerce run creates four square product images:

- `product-id-front.png`
- `product-id-side.png`
- `product-id-angle.png`
- `product-id-hero.png`

Instagram generation is an explicit final step that never runs automatically during Output 1 generation. The user selects one or more saved Output 1 images, chooses a saved social profile, enters one Price and one SKU per product, and the app creates one Output 2 image per selected source image.

Output 1 images are normalized to PNG at 2048x2048. Instagram outputs use the selected saved format profile, local Brand Kit composition, and a backend OpenAI image edit that adds only the price label using the uploaded price-label reference image. Try Free Instagram outputs use local composition only and are labeled as local previews.

## Provider Notes

- Gemini defaults to Nano Banana 2: `gemini-3.1-flash-image`.
- GPT defaults to `gpt-image-2` through the backend OpenAI Image Edits endpoint with multiple image references.
- Try Free never calls Gemini, GPT, OpenAI, or paid AI image endpoints. In the UI it creates local-preview Output 2 only; the documented mock Output 1 API remains available for backend workflow testing.
- Add future providers by implementing `AIProvider.generateImages()` and registering the provider in `src/providers/index.js`.
