# Tutti

> ทุกความวุ่นวายของการโพสต์ข้ามแพลตฟอร์ม จัดการให้ — ส่วนขยาย Chrome หนึ่ง เครือข่ายสิบเอ็ด

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti ช่วยให้คุณเขียนครั้งเดียวและกระจายโพสต์เดียวกันไปยังเครือข่ายสังคมทั้งหมดของคุณด้วยการคลิกครั้งเดียว (รองรับ 11 เครือข่าย) ข้อความที่เกินขีดจำกัดจะถูกแบ่งโดยอัตโนมัติ (X ใช้สายโซ่การตอบกลับที่ถูกต้องเพื่อให้กลายเป็น thread); ภาพจะถูกปรับขนาดอัตโนมัติให้เข้ากับข้อจำกัดของแต่ละแพลตฟอร์ม; วิดีโอจะถูกตรวจสอบระยะเวลา/ขนาด และคลิปที่มีขนาดใหญ่เกินไปจะถูก transcode ทันทีด้วย `ffmpeg.wasm`

**เนื้อหาโพสต์ของคุณไม่เคยสัมผัสเซิร์ฟเวอร์บุคคลที่สามใด ๆ**

🔒 [นโยบายความเป็นส่วนตัว](https://komm64.github.io/tutti/)

## คุณสมบัติ

- 📤 **กระจายข้อความหลายเครือข่าย** — เขียนครั้งเดียว คลิกครั้งเดียว โพสต์ไปยังทุกเครือข่ายที่คุณเลือก (11 เครือข่าย)
- ✂️ **แบ่งข้อความเกินขีดจำกัดอัตโนมัติ** — กำกับด้วยหมายเลขเป็น `(1/N)` โพสต์ตามลำดับ ใน X เชื่อมต่อกันเป็น **สายโซ่การตอบกลับ (thread)** ในเครือข่ายอื่นโพสต์อย่างอิสระ
- ขอบเขตของ `#hashtag` ถูกรักษาไว้ตลอดการแบ่ง / Bluesky ได้รับ **rich-text facets** ที่ถูกต้อง (แท็กที่คลิกได้ + URL annotations)
- 🖼️ **ภาพสูงสุด 4 ภาพ + ปรับขนาดอัตโนมัติ** — พอดีกับข้อจำกัดที่เข้มงวด เช่น เพดาน 1 MB ของ Bluesky โดยอัตโนมัติ
- 🎬 **โพสต์วิดีโอ + บีบอัดอัตโนมัติ** — คลิปที่เกินขีดจำกัดถูก re-encode ในที่โดย `ffmpeg.wasm` (ในเอกสาร offscreen)
- 🔌 **เส้นทาง API อย่างเป็นทางการแบบเสริม** — สำหรับ Bluesky / Mastodon / Misskey ลงทะเบียนข้อมูลรับรองในการตั้งค่า และ Tutti จะโพสต์ผ่าน API สาธารณะแทน DOM scripting (ทนทานต่อการเปลี่ยนแปลง UI ของ SNS)
- 📊 **ความคืบหน้าแบบเรียลไทม์** — ดูสถานะของแต่ละเครือข่ายแบบเรียลไทม์
- 🪪 **แสดงบัญชีที่เข้าสู่ระบบ** — popup แสดงว่าแต่ละเครือข่ายจะโพสต์จากบัญชีใด (ช่วยป้องกันอุบัติเหตุ)
- 🛡️ **ปุ่ม autoPost** — ปิดตามค่าเริ่มต้น โหมดเริ่มต้นจะเปิดแต่ละหน้าสร้างโพสต์ ใส่เนื้อหา + ไฟล์แนบ และ **หยุดก่อนคลิกปุ่มโพสต์** (โหมด "ตัวอย่าง") เพื่อให้คุณสามารถสังเกตข้อผิดพลาดได้
- 📜 **ประวัติโพสต์** — 20 รายการล่าสุดบันทึกในเครื่อง
- 💾 **บันทึกฉบับร่างอัตโนมัติ** — ข้อความของคุณรอดจากการปิด popup
- ⌨️ **Ctrl/Cmd + Enter เพื่อโพสต์**
- ⚙️ **สลับ instance ของ Mastodon / Misskey** — ชี้ไปที่ instance ใด ๆ จากการตั้งค่า
- 🩹 **Hot-fix selector** — เมื่อ DOM ของ SNS เปลี่ยนแปลงและทำลายเส้นทาง Tutti สามารถดึง patch `selectors.json` ได้ เพื่อที่คุณจะไม่ต้องรอการเผยแพร่ส่วนขยายครั้งถัดไป
- 🐞 **ปุ่มรายงานบั๊ก** — คลิกเดียวจาก popup ส่ง GitHub issue พร้อม DOM snapshot ที่ผ่านการแก้ไข (pipeline auto-triage แปลงสิ่งนี้เป็น selector PR)
- 🌐 **แปลภาษา** — 31 ภาษา (popup + ตัวเลือก)

## เครือข่ายที่รองรับ

11 เครือข่าย "Stable" หมายความว่าการโพสต์จริงได้รับการตรวจสอบแบบครบวงจร; "Experimental" หมายความว่าอะแดปเตอร์เชื่อมต่อแล้วแต่การโพสต์จริงด้วย autoPost ยังไม่ได้รับการตรวจสอบอย่างครบถ้วน สำหรับ Experimental เริ่มต้นในโหมดตัวอย่าง (autoPost ปิด)

### Stable (การโพสต์จริงผ่านการตรวจสอบ)

| เครือข่าย | text | image | shortVideo | longVideo | เส้นทาง |
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

### Experimental (เฉพาะอะแดปเตอร์; การโพสต์จริงด้วย autoPost ยังไม่ได้ตรวจสอบ)

| เครือข่าย | text | image | shortVideo | longVideo | เส้นทาง |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti ทำให้ web UI การสร้างของ SNS เป็นแบบอัตโนมัติ (อ่อนไหวต่อการเปลี่ยนแปลง anti-bot มากขึ้น)
- **DOM + API**: หากคุณบันทึกข้อมูลรับรองในการตั้งค่า Tutti จะสลับไปยัง API อย่างเป็นทางการ เมื่อ API ล้มเหลว Tutti **ไม่หวนกลับไปที่ DOM อย่างเงียบ ๆ** — คุณจะเห็นข้อผิดพลาดที่ชัดเจน หากไม่มีข้อมูลรับรอง จะเรียกใช้เฉพาะเส้นทาง DOM
- **multi-step**: สำหรับ modals สไตล์ wizard ในหลายขั้นตอน (framework: `executeMultiStepFlow`)

## การติดตั้ง

### Chrome Web Store

เผยแพร่แล้ว (Unlisted): [Tutti บน Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Unpacked / dev build

ดาวน์โหลด zip ล่าสุดจาก [Releases](https://github.com/komm64/tutti/releases) จากนั้น:

1. แยกไฟล์
2. เปิด `chrome://extensions/` (หรือ `brave://extensions/` บน Brave)
3. เปิด "โหมดนักพัฒนา"
4. คลิก "โหลดส่วนขยายที่แตกไฟล์แล้ว" และเลือกโฟลเดอร์ที่แตกไฟล์

## การสนับสนุน

คำถาม รายงานบั๊ก คำขอคุณสมบัติ: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

หรือส่งอีเมลถึง **contact@komm64.com**

## ความเป็นส่วนตัว

ข้อความโพสต์ ภาพ และวิดีโอประมวลผล **ภายในเบราว์เซอร์ของคุณทั้งหมด** — ไม่เคยถูกส่งไปยังเซิร์ฟเวอร์ของบุคคลที่สามใด ๆ ดูรายละเอียดใน[นโยบายความเป็นส่วนตัว](https://komm64.github.io/tutti/)

## ลิขสิทธิ์

[สงวนลิขสิทธิ์](./LICENSE) — © 2026 komm64

รหัสที่มาเผยแพร่เพื่อความโปร่งใส ไม่อนุญาตการแจกจ่ายซ้ำ การนำไปใช้ใหม่ หรือการดัดแปลง

---

## การพัฒนา

เอกสารการพัฒนา (Stack, คำสั่ง, Layout) เป็นภาษาอังกฤษใน [README.md](./README.md)
