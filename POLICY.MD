إليك قائمة القواعد الصارمة (Master Rulebook) التي يجب على المودل اتباعها أثناء العمل، مقسمة بدون أي شرح:

**1. قواعد الذكاء الاصطناعي (AI Behavior & Vibe Coding)**

* Zero Hallucination: يُمنع اختراع مكتبات، دوال، أو ميزات غير موجودة.
* Stop on Ambiguity: التوقف فوراً وطلب التوضيح عند غياب تفاصيل التقنية أو المتطلبات.
* Incremental Generation: توليد الكود تدريجياً ومنع كتابة ملفات ضخمة (Monolithic).
* File Limits: الحد الأقصى للملف 300 سطر، وللدالة 30 سطراً (ما لم يُبرر عكس ذلك).
* File Header: وضع تعليق في بداية كل ملف يحدد مسؤوليته المباشرة.
* Immediate Refactoring: إعادة الهيكلة فوراً عند ظهور أي تكرار في الكود.

**2. الهندسة المعمارية ومبادئ التصميم (Architecture & Design)**

* Clean Architecture Dependencies: (الـ Domain مستقل، والـ Application يعتمد عليه، والـ Infra/UI يعتمدان على الـ Application).
* SOLID Principles.
* DRY (Don't Repeat Yourself).
* KISS (Keep It Simple, Stupid).
* YAGNI (You Aren't Gonna Need It): يُمنع إضافة أي Abstractions (Interfaces, Factories) قبل الحاجة الفعلية لها.
* Separation of Concerns (SoC).
* Single Source of Truth (SSOT).
* Stateless Services: جعل الخدمات عديمة الحالة لتسهيل التوسع.
* Frontend Isolation: يُمنع استدعاء الـ APIs من الواجهات مباشرة؛ يجب المرور عبر Service Layer.
* ADRs: توثيق أي قرار معماري أو تقني (Context, Decision, Alternatives).

**3. قاعدة البيانات (Database Governance)**

* Schema First: توثيق المخطط، المفاتيح الأساسية والأجنبية، والفهارس قبل كتابة الكود.
* Versioned Migrations: استخدام أنظمة الترحيل مع دعم التراجع (Rollback).
* Audit Columns: إلزامية وجود (`created_at`, `updated_at`, `created_by`, `updated_by`) في الجداول الأساسية.
* Pragmatic Soft Delete: استخدام الحذف المنطقي فقط للبيانات التي يتطلب العمل استرجاعها.
* Zero N+1 Queries: يُمنع كتابة استعلامات تؤدي لمشكلة N+1.

**4. الأمان وواجهات البرمجة (Security & APIs)**

* Standardized Envelope: إرجاع جميع استجابات الـ API بهيكل ثابت: `{success, data, errors}`.
* OWASP Top 10: حماية صارمة ضد SQLi, XSS, CSRF وغيرها.
* Access Control: تطبيق Authentication وتحديد صلاحيات RBAC/ABAC لكل نقطة وصول.
* Security Limits: تطبيق Rate Limiting وإضافة Security Headers.
* Secrets Management: يُمنع كتابة الأسرار في الكود؛ تُستخدم متغيرات البيئة فقط.
* API Versioning: تطبيق إصدارات للواجهات (مثال: `/v1/`).
* OpenAPI: توليد توثيق للواجهات تلقائياً (Swagger).

**5. الأداء والجودة (Performance & Quality)**

* Performance Budgets: استجابة الـ API < 300ms، واستعلام قاعدة البيانات < 100ms.
* No Magic Values: منع النصوص والأرقام السحرية واستبدالها بثوابت مركزية.
* Explicit Dependency Audit: تبرير وتوثيق أي مكتبة خارجية قبل إضافتها.
* Centralized Error Handling: معالجة الأخطاء مركزياً ومنع تسريب أخطاء النظام للمستخدم.
* Validation Layer: التحقق من جميع المدخلات عند الأطراف (Edges) قبل وصولها لمنطق الأعمال.
* Quality Gates: مراجعة الكود ذاتياً (أمان، أداء، معمارية) قبل توليده واعتماده.