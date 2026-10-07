# نظام السوق والأنظمة (Marketplace & Systems)

Central dynamic system catalog + self-service marketplace + admin manager.

## المبدأ

- **كتالوج مركزي واحد** هو جدول `app` في المخطط المشترك (`businessos`). كل
  صفحة سوق تقرأ منه — لا يوجد كاردات مكررة في الواجهات:
  - سوق المشترك: `/apps`
  - لوحة الإدارة: `/platform-admin/systems`
- **الأنظمة التجريبية (demo)**: تُفتح فوراً بدون موافقة.
- **الأنظمة الحقيقية (real)**: إعدادها **دائماً** يدخل قائمة موافقة المنصة
  أولاً (`organizationAppRequest` → `pending`)، ويبتّ فيه المدير من
  `/platform-admin/approvals`.

## التصنيف

`src/core/systems/catalog.ts` هو مصدر المنطق النقي المشترك (مختبر في
`tests/core/m15-system-catalog.test.ts`):

| دالة | الدلالة |
|---|---|
| `systemKind(slug)` | `real` \| `demo` \| `none` |
| `openRouteForSlug(slug)` | مسار الفتح (مدمج `/app/<slug>` أو ديمو `/pos` إلخ) |
| `installState(input)` | آلة الحالة `unavailable/installed/pending/demo/installable` |
| `catalogAppSchema` | مخطط إنشاء/تعديل سجل الكتالوج (شكل موحّد للواجهة وAPI) |

`real = { grocery: /app/grocery, sama-center: /app/sama-center }` هي وحدها
الأنظمة ذات الوحدة المدمجة داخل القشرة. كل ما عداها تجريبي.

## واجهات برمجية (API)

### إدارة المنصة (آمنة بـ `requirePlatformAdmin`)
- `GET /api/platform/apps` — الكتالوج كاملاً مع عدد التثبيتات والطلبات.
- `POST /api/platform/apps` — إنشاء/تحديث سجل.
- `PATCH /api/platform/apps/[slug]` — تبديل `isActive` / `status`.
- `DELETE /api/platform/apps/[slug]` — حذف (مرفوض إن كان النظام مثبّتاً أو
  عليه طلبات).

### المشترك (آمنة بـ `requireTenantContext`)
- `POST /api/v1/apps/[slug]/request` — الإجراء الوحيد للسوق: ديمو → يفتح
  فوراً؛ حقيقي → ينشئ طلب موافقة (idempotent، ويعيد فتح الطلب المرفوض).
- `PUT|DELETE /api/v1/marketplace/favorites/[slug]` — تثبيت/إلغاء `pinnedApp`
  لمستخدم السوق.

## تدفق التثبيت

1. المشترك يضغط "إعداد النظام" في `/apps`.
2. إن كان `real` → `organizationAppRequest` بحالة `pending` + سجل تدقيق
   `marketplace.app.requested` + شارة "قيد موافقة المنصة" في سوقه و`/my-apps`.
3. المدير يقرّر في `/platform-admin/approvals` (لوحة `app-requests`):
   approve → `organizationApp` فعالة (يعمل `installSystemForOrg` بنفس المعاملات)؛
   reject → تبقى مرفوضة (يُعاد الطلب من السوق عند الحاجة).
4. فور الموافقة، تظهر البطاقة بحالة `installed` وتفتح المسار الحقيقي.

`POST /api/v1/org/install-template` (الإعداد بالنموذج، onboarding) أصبح أيضاً
ينشئ طلب موافقة للأنظمة الحقيقية — متسقاً مع `docs/AUDIT-2026.md` ("install
template → status pending") وقرار المستخدم "الموافقة دائماً".

## العزل وحدود البيانات

- **كتالوج المنصة** (app/plans/requests) في المخطط المشترك — يجب أن يكون
  شاملاً عبر المؤسسات، وهو آمن عبر قيود `requirePlatformAdmin` /
  `requireTenantContext` وفلترة `organizationId` عبر `tenant-guard.ts`.
- **بيانات الأعمال لكل تنظيم**: السجل المنفصل الموجود هو
  `organizationApp` (يملكه التنظيم). تصميم schema-per-tenant/database-per-
  system موثّق في `src/core/tenancy/schemas.ts` + `context-store.ts`
  (AsyncLocalStorage) لكنه **غير مفعّل runtime حالياً** — `prisma` عميل
  واحد على `DATABASE_URL`، والعزل الفعلي هو فلاتر `organizationId`
  (انظر ملاحظة PROJECT_MAP حول حالة `sharedPrisma` غير الموجودة و`schemas.ts`
  غير المتربط بالعميل الحالي).

## إضافة نظام جديد (دليل التشغيل)

### نظام تجريبي
1. ضع التطبيق المستقل في `public/`. 2. rewrite في `next.config.ts`.
3. إدخال في `src/core/demo/demo-systems.ts`. 4. بيانات بثنائية اللغة في
   `DEMO_CATALOG_META` داخل `src/core/systems/catalog.ts`.
5. `npx tsx scripts/seed-system-catalog.ts` (idempotent).

### نظام حقيقي
1. موجّه/محوّل في `src/core/apps/adapters/*` مسجّل في `init.ts` بمفتاح `slug`.
2. هل للوحدة واجهة داخل القشرة؟ أضف `routePrefix /app/<slug>` وصفّفها في
   `REAL_SYSTEM_ROUTES` في `catalog.ts`.
3. أنشئ السجل من لوحة `/platform-admin/systems` أو seed.
4. أضف أي defaults إعدادية في مسار الموافقة عند الحاجة.

## مكونات الواجهة

- `src/app/apps/page.tsx` + `src/app/apps/app-marketplace.tsx` — السوق
  (بحث/فئات/مفضلة/مؤخراً/طلبات معلّقة/توستات).
- `src/app/platform-admin/systems/page.tsx` + `systems-manager.tsx` — الإدارة.
- `src/app/my-apps/page.tsx` — الأنظمة المثبّتة + لافتة الطلبات المعلّقة.