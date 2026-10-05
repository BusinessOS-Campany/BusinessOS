# Demo Systems

منطقة مخصصة لأنظمة العرض التجريبية على منصة Business OS.

## المبدأ

كل نظام تجريبي (Demo) هو تطبيق مستقل يُدار على منفذ مستقل، وتُمرَّر طلباته عبر
نفس الأصل (same-origin) من منصة ERP عبر `rewrites` في `next.config.ts`.

**مسار الخدمة مشتقّ من مكان المصدر، لا مكتوب يدوياً.** `rootPath` في
`src/core/demo/demo-systems.ts` يُحسب من `mountPath(sourceDir, slug)`: أي مصدر
داخل `demo-systems/` يُخدَم تحت `/demo/<slug>`، وأي مصدر آخر يحتفظ بمساره
الجذري. المسار القديم `/grocery` يبقى إعادة توجيه 308 إلى `/demo/grocery`.

- `/demo/grocery` → `http://localhost:3101/demo/grocery` (مصدره في `demo-systems/`)
- `/sama` → `http://localhost:3102/sama`
- `/celia` → `http://localhost:3104/celia`
- `/hospital` → `http://localhost:3105/hospital`
- `/demo/dental` → `http://localhost:3106/demo/dental` (مصدره في `demo-systems/`)
- `/laboratory` → `http://localhost:3107/laboratory`
- `/pharmacy` → `http://localhost:5000/pharmacy`
- `/pos` → `http://localhost:3108/pos`
- `/optometry` → `http://localhost:3109/optometry`

كل مثال من `npm run dev` يشغّل عدة أنظمة عبر `concurrently`
(انظر مفتاح `scripts.dev` في `package.json`).

## السجل الموحّد

`src/core/demo/demo-systems.ts` هو المصدر الآلي (machine-readable) الوحيد
لكل نظام تجريبي: المجلد، المنفذ، المسار، متغير البيئة، التقنية، والحالة.
لا تُكتب أي بيانات نظام تجريبي في الصفحات بعد الآن — تُقرأ من هذا السجل
(أو من سجل الأنظمة المركزي — انظر أدناه).

## الكتالوج المركزي الديناميكي

صفحات السوق (`/apps`، ولاحقاً والكاملة داخل اللوحة) تقرأ من **جدول
التطبيقات المركزي** (`app`) — أي نظام تجريبي مدرج يكون:

- نوع `demo` — يفتح فوراً بدون موافقة ("تجربة مباشرة").
- الأنظمة الحقيقية (المدمجة في القشرة) نوع `real` — إعدادها **دائماً**
  يدخل قائمة موافقة المنصة أولاً.

بذر الأنظمة التجريبية في الكتالوج المركزي:

```bash
npx tsx scripts/seed-system-catalog.ts
```

(العملية idempotent — تُحدَّث البيانات دون تكرار.)

## إضافة نظام تجريبي جديد

1. ضع التطبيق المستقل داخل `public/`.
2. أضف rewrite في `next.config.ts` لنفس الأصل.
3. أضف إدخالاً في `src/core/demo/demo-systems.ts`.
4. أضف البيانات الثنائية اللغة إلى `DEMO_CATALOG_META`
   في `src/core/systems/catalog.ts`.
5. أعد تشغيل `scripts/seed-system-catalog.ts` ليظهر في السوق تلقائياً.