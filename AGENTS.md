<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Operating Protocols — Business OS Platform

> اتفاق العمل الدائم لهذا المستودع. أي وكيل يقرأ هذا الملف يرثها.
> المرجع الحي الوحيد لحالة المشروع هو `PROJECT_MAP.md`. لا تخمّن حالة المشروع من الذاكرة.

## 0. Precondition — لا قالب بلا عمل

البروتوكولات التالية **قوالب**، وليست أوامر. إذا وصل طلب يحوي placeholder غير معبّأ
(`[أدخل وصف المشروع هنا]`، `[وصف التعديل/الميزة]`، `[MILESTONES]`، إلخ):

1. **لا تختار مساراً بصمت.** الغموض شرط توقف، لا مسألة تقدير.
2. اقرأ `PROJECT_MAP.md` أولاً، ثم اسأل سؤالاً واحداً محدداً ومبنياً على الحالة الحقيقية.
3. انتظر الإجابة. لا تكتب سطر كود واحد.

> بروتوكول مملوء النطاق = تفويض. بروتوكول فارغ النطاق = سؤال.

**Ground truth commands (استخدمها، لا تخترع أوامر تحقّق):**
`npm run typecheck` (tsc --noEmit) · `npm run lint` (eslint) · `npm test` (vitest run) · `npm run build` (next build --webpack) · `npx tsx scripts/org-vault.ts …` · `npx prisma migrate dev`

---

## Protocol 1 — The Planning Protocol (تخطيط)

**الدور:** Staff Software Engineer + Tech Lead. مخرج واحد: خطة معمارية معتمدة، **ولا كود**.

### Think Before Coding (إلزامي، قبل أي بروتوكول)
1. صرّح بالافتراضات حول المتطلبات.
2. عند الغموض: **توقف واسأل**. لا تخمّن.
3. Simplicity First: اقترح الحل الأبسط، وارفض كل تعقيد غير مطلوب.

### P1.1 — Time awareness & dependency honesty
- حدّد السنة/الشهر **من النظام عبر shell** (`Get-Date`)، لا من بيانات التدريب.
- قارن بإصدارات `package.json`، وابحث في npm/GitHub عن أحدث مستقر **حتى ذلك التاريخ**.
- وثّق الإصدار + سبب الرفض لأقرب بديل. **لا ترقِّ package تالفاً (Major/RC/beta) لمجرد أنه `latest`.**
  سجل القواعد القائمة في `[TECH_STACK]`: Prisma 8 = RC (مرفوض)، TS 7.0 بلا programmatic API (مرفوض)، Redis غير مطلوب (مرفوض).

### P1.2 — Logical flow, no feature creep
- النطاق المطلوب فقط. لا ميزة إضافية، لا مرونة غير مطلوبة.
- ارسم رحلة المستخدم (GUI) أو تدفق البيانات (API) كـ**أهداف قابلة للتحقق**.

### P1.3 — Surgical architecture
- أقل قدر من الكود يحل المشكلة.
- `src/core/` للتجريد المتكرر **فعلاً فقط**. لا تعمّم كوداً يُستخدم مرة واحدة.
- Domain-Driven داخل `src/modules/`. **No micro-files** — ملف واحد يحمل service + schemas + types cohesive.
- احترم قواعد الطبقات في `[ARCHITECTURE]`: UI لا يمسّ repositories · repositories تأخذ `TenantContext` وتفلتر `organizationId` تلقائياً · services لا تقرأ كائنات HTTP · المال bigint minor units فقط · audit logs append-only.

### P1.4 — Safe logging
- غير حظري (async)، بسيط، مستويات `error/warn/info/debug` فقط، redaction مفعّل. البنية قائمة في `pino` (انظر `core/logging`, `org-vault/logger`).
- **لا تضف** logging subsystem جديداً — وضّعه في `core/logging/`.

### P1.5 — PROJECT_MAP.md
`[TECH_STACK]` · `[SYSTEM_FLOW]` · `[ARCHITECTURE]` · `[ORPHANS & PENDING]` — الميزة غير المرتبطة **تظهر فوراً** في `[ORPHANS & PENDING]`، وتُحذف عند اجتياز هدفها.

### المخرج المطلوب
موجز تقني مكثف + **Milestones بأهداف قابلة للتحقق** (لكل milestone: معيار نجاح واحد واضح). ثم **انتظر الموافقة**.

---

## Protocol 2 — The Execution Engine (تنفيذ)

**الدور:** Tech Lead. صلاحية تنفيذ كامل، لكن **مقيّدة بـ `[SYSTEM_FLOW]` المكتوب**.

### معيار التنفيذ
1. **بساطة:** 50 سطراً تفضّل 200. لا برمجيات تخمينية، لا `any`، لا placeholder.
2. **Goal-driven:** لكل feature حدّد **معيار النجاح** *قبل* كودها، ولا تنتقل لما بعدها حتى يتحقق.

### P2.1 — Production-ready code
- **ممنوع منعاً باتاً** الـ Placeholders و `// TODO` في كود تُسلّمه.
- كل path معالجة خطأ + ربط logging. لا كود ميت.

### P2.2 — Loop Until Verified
- اختبارات آلية أو محاكاة تدفق. **لا تترك mess** — نظّف فقط ما أنتجته أنت.
- تحقق من عدم وجود Regression على الميزات السابقة.

> **هذا المستودع ناضج (M0–M12).** أي تعديل يلزمه:
> 1. اختبار يفشل أولاً (TDD)  2. الاختبار ينجح  3. `npm run typecheck && npm run lint && npm test && npm run build` أخضر  4. فحص بصري بـ puppeteer headless عند تغيّر UI (نمط مثبت في سجلات `PROJECT_MAP.md`).

### P2.3 — State Sync
حدّث `PROJECT_MAP.md` **فوراً** بعد كل خطوة: (1) نفّذ → (2) تحقّق → (3) حدّث الخريطة. لا تنتهي والـ `[ORPHANS & PENDING]` غير فارغ دون سبب موثّق.

### P2.4 — Flow adherence
ارجع دوماً لـ `[SYSTEM_FLOW]`. كل سطر يجب أن يخدم رحلة المستخدم المطلوبة فقط.

**أمر الانطلاق:** تنفيذ تسلسلي بلا توقف — **ولا تتجاوز بوابة الموافقة بعد Protocol 1.**

---

## Protocol 3 — The Surgical Editing Protocol (تعديل جراحي)

**الدور:** Staff SWE. تعديل **دون تخريب** أي ميزة قائمة.

### قواعد التعديل الجراحي
1. **المس فقط ما يجب لمسه:** لا تحسّن تنسيق كود مجاور، لا تعد صياغة تعليقات قديمة، لا refactor لكود يعمل بلا طلب.
2. **مطابقة الأسلوب:** التزم بأسلوب الكود الحالي حتى لو بدا غير مثالي.
3. **نظّف مخلفاتك فقط:** إن أصبح function أو import يتيماً **بسبب تعديلك**، أزله. لا تلمس الكود الميت القديم.

### P3.1 — Impact analysis
- اقرأ `PROJECT_MAP.md` + `ARCHITECTURE.md`، حدّد الملفات المتأثرة بدقة.
- **Think Before Coding:** اذكر الافتراضات قبل التنفيذ.
- ابحث عن أحدث التقنيات فقط إذا استلزم الأمر فعلاً — وإلا فالنسخة القائمة هي المرجع.

### P3.2 — Architectural safety
- DRY، وطبقة `Shared/Core` عند التكرار الحقيقي فقط.
- أضف Logging للتعديل الجديد عبر البنية القائمة.

### P3.3 — Goal-driven verification
- حوّل التعديل إلى هدف قابل للتحقق. **TDD: اكتب الاختبار، تأكد أنه يفشل، ثم اجعله ينجح.**
- أعد تشغيل اختبارات الميزات القديمة (No Regression) + typecheck + lint + build.

### P3.4 — State sync
حدّث `PROJECT_MAP.md` فوراً. أي كود أصبح Deprecated بسبب تعديلك يُعالج أو يُسجَّل في النواقص.

---

## عوالم معروفة في هذا المستودع — لا تعِد اختراعها

| العالم | القاعدة |
|---|---|
| Next.js 16 | `src/proxy.ts` بدل `middleware.ts`. اقرأ `node_modules/next/dist/docs/` قبل أي API. |
| TypeScript | `next` يُعيد كتابة `target` إلى ES2017 — بدون ES2020 يتعطل `BigInt`. |
| Next build | `--webpack` إلزامي هنا (`npm run build`). |
| `.env.local` | **BOM-less UTF-8**؛ PowerShell 5.1 يكتب BOM ويفشل parser المتغير بصمت. |
| Prisma | `url` lives في `prisma.config.ts` فقط. business tables **بلا relations** (FK أعمدة يدوية) ⇒ `createMany` للأبناء، ولا `include:`. |
| Better Auth | `nextCookies()` **آخر** عنصر في plugins. `ac.newRole(statements)`. |
| Child processes | `spawnSync`/`execFileSync` **تجمّد event loop** — استخدم `spawn` wrapped in a promise. لا ترث pipes مع `pg_ctl start`. |
| Windows/Postgres | لا تقتل postmaster بالقوة (`pre-existing shared memory block`); استخدم `pg_ctl -m immediate stop`. |
| Prisma/DB | `prisma migrate dev` قد لا يُولّد الـ client — شغّل `npx prisma generate` بعد تغيّر المخطط. |
| RSC | `notFound()` لا `throw` (الأخير = 500). |
| react-hooks | ممنوع `setState` متزامن داخل effect. |
| Sub-apps | `demo-systems/grocery` و`demo-systems/dental`… submodule/apps مستقلة — عدّلها من جذرها هي، لا عبر monorepo index. |
| Env shell | APIs المستأجرة tenant-scoped؛ أي تعديل مالي يمر `single Prisma $transaction` (انظر F3). |
