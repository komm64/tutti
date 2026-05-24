# Tutti

> كل متاعب النشر المتعدد، تم التعامل معها — إضافة Chrome واحدة، أحد عشر شبكة.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

يتيح لك Tutti الكتابة مرة واحدة وبث نفس المنشور إلى جميع شبكاتك الاجتماعية بنقرة واحدة (يتم دعم 11 شبكة). النص الذي يتجاوز الحد ينقسم تلقائيًا (X يستخدم سلسلة ردود مناسبة بحيث يصبح thread)؛ يتم تغيير حجم الصور تلقائيًا لتناسب قيود كل منصة؛ يتم فحص مقاطع الفيديو للمدة / الحجم، ويتم ترميز المقاطع الكبيرة الحجم على الفور باستخدام `ffmpeg.wasm`.

**محتوى منشوراتك لا يلمس أبدًا أي خادم طرف ثالث.**

🔒 [سياسة الخصوصية](https://komm64.github.io/tutti/)

## الميزات

- 📤 **بث متعدد الشبكات** — اكتب مرة واحدة، انقر مرة واحدة، انشر في كل شبكة قمت بتحديدها (11 شبكة)
- ✂️ **تقسيم تلقائي للنص الزائد عن الحد** — مرقمة كـ `(1/N)`، منشورة بالتسلسل. على X يتم توصيلها كـ **سلسلة ردود (thread)**، في شبكات أخرى يتم نشرها بشكل مستقل
- يتم الحفاظ على حدود `#hashtag` عبر التقسيمات / يحصل Bluesky على **rich-text facets** مناسبة (علامات قابلة للنقر + URL annotations)
- 🖼️ **ما يصل إلى 4 صور + تغيير حجم تلقائي** — يتناسب تلقائيًا مع الحدود الضيقة مثل سقف 1 ميغابايت من Bluesky
- 🎬 **نشر الفيديو + ضغط تلقائي** — يتم إعادة ترميز المقاطع الزائدة عن الحد في مكانها بواسطة `ffmpeg.wasm` (في مستند offscreen)
- 🔌 **مسار API رسمي اختياري** — لـ Bluesky / Mastodon / Misskey، سجل بيانات الاعتماد في الإعدادات و Tutti ينشر عبر API العام بدلاً من scripting DOM (مرن لتغييرات واجهة مستخدم SNS)
- 📊 **تقدم مباشر** — انظر حالة كل شبكة في الوقت الفعلي
- 🪪 **عرض الحساب المسجل** — يعرض popup من أي حساب ستنشر كل شبكة (يساعد على منع الحوادث)
- 🛡️ **زر autoPost** — معطل افتراضيًا. الوضع الافتراضي يفتح كل صفحة تأليف، يملأ المحتوى + المرفقات، ويتوقف **قبل النقر على زر النشر مباشرة** (وضع "معاينة") حتى تتمكن من رصد الأخطاء
- 📜 **سجل المنشورات** — آخر 20 إدخالًا محفوظة محليًا
- 💾 **مسودات محفوظة تلقائيًا** — يبقى نصك على قيد الحياة من إغلاق popup
- ⌨️ **Ctrl/Cmd + Enter للنشر**
- ⚙️ **التبديل بين instance لـ Mastodon / Misskey** — أشر إلى أي instance من الإعدادات
- 🩹 **Hot-fix للمحددات** — عندما يتغير DOM SNS ويكسر مسارًا، يمكن لـ Tutti جلب تصحيح `selectors.json` حتى لا تضطر إلى انتظار الإصدار التالي للإضافة
- 🐞 **زر تقرير الأخطاء** — نقرة واحدة من popup ترسل issue على GitHub مع لقطة DOM منقحة (يحول خط أنابيب auto-triage ذلك إلى PR للمحدد)
- 🌐 **مُترجم** — 31 لغة (popup + خيارات)

## الشبكات المدعومة

11 شبكة. "Stable" تعني أن النشر الفعلي تم التحقق منه من البداية إلى النهاية؛ "Experimental" تعني أن المهايئ متصل ولكن النشر الفعلي مع autoPost لم يتم التحقق منه بشكل كامل بعد. بالنسبة للـ Experimental، ابدأ في وضع المعاينة (autoPost إيقاف).

### Stable (تم التحقق من النشر الفعلي)

| الشبكة | text | image | shortVideo | longVideo | المسار |
|---|:---:|:---:|:---:|:---:|---|
| X | ✅ | ✅ | ✅ | ✅ | DOM |
| Bluesky | ✅ | ✅ | ✅ | — | DOM + API |
| Threads | ✅ | ✅ | ✅ | ✅ | DOM |
| Mastodon | ✅ | ✅ | ✅ | ✅ | DOM + API |
| Misskey | ✅ | ✅ | ✅ | ✅ | DOM + API |
| Tumblr | ✅ | ✅ | ✅ | ✅ | DOM |
| Pixiv | — | ✅ | — | — | DOM (multi-step) |
| TikTok | — | — | ✅ | — | DOM (multi-step) |
| YouTube (Shorts) | — | — | ✅ | — | DOM (multi-step) |
| Instagram | — | ✅ | ✅ | — | DOM (multi-step) |

### Experimental (المهايئ فقط؛ لم يتم التحقق من النشر الفعلي مع autoPost بعد)

| الشبكة | text | image | shortVideo | longVideo | المسار |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti يقوم بأتمتة واجهة المستخدم الويب للتأليف الخاصة بـ SNS (أكثر حساسية لتغييرات مكافحة الروبوتات)
- **DOM + API**: إذا قمت بحفظ بيانات الاعتماد في الإعدادات، فإن Tutti يتحول إلى API الرسمي. عند فشل API، Tutti **لا يعود بصمت إلى DOM** — سترى خطأ صريحًا. بدون بيانات اعتماد، يتم تشغيل مسار DOM فقط.
- **multi-step**: لـ modals بأسلوب المعالج عبر خطوات متعددة (إطار العمل: `executeMultiStepFlow`)

## التثبيت

### Chrome Web Store

تم النشر (Unlisted): [Tutti على Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### غير مضغوط / build التطوير

قم بتنزيل أحدث zip من [Releases](https://github.com/komm64/tutti/releases)، ثم:

1. فك ضغطه
2. افتح `chrome://extensions/` (أو `brave://extensions/` على Brave)
3. قم بتشغيل "وضع المطور"
4. انقر على "تحميل الإضافة غير المعبأة" واختر المجلد غير المضغوط

## الدعم

الأسئلة، تقارير الأخطاء، طلبات الميزات: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

أو راسلنا عبر البريد الإلكتروني على **contact@komm64.com**.

## الخصوصية

يتم معالجة نص المنشورات والصور والفيديو **بالكامل داخل متصفحك** — لا يتم إرسالها أبدًا إلى أي خادم طرف ثالث. راجع [سياسة الخصوصية](https://komm64.github.io/tutti/) للحصول على التفاصيل.

## الترخيص

[جميع الحقوق محفوظة](./LICENSE) — © 2026 komm64

تم نشر شفرة المصدر للشفافية. لا يُسمح بإعادة التوزيع أو إعادة الاستخدام أو التعديل.

---

## التطوير

وثائق التطوير (Stack، Commands، Layout) باللغة الإنجليزية في [README.md](./README.md).
