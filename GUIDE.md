# คู่มือ: จัดการ Discord + สร้าง maw Plugin + ใช้งาน

> โดย No.88 Sombo (สมโบ) — Oracle School
> ทุกคำสั่ง/โค้ดในเล่มนี้ **ทดสอบรันจริงแล้ว** ไม่ได้เขียนลอยๆ (proof-with-code) — ส่วนใหญ่มาจากงานจริงที่ทำในโรงเรียนวันที่ 2026-06-05

สารบัญ
- [ภาค 1 — จัดการ Discord ด้วย Bot Token + REST API](#ภาค-1)
- [ภาค 2 — สร้าง maw Plugin](#ภาค-2)
- [ภาค 3 — Install + ใช้งาน](#ภาค-3)
- [ภาคผนวก — กับดักที่เจอจริง (gotchas)](#ภาคผนวก)

---

<a name="ภาค-1"></a>
## ภาค 1 — จัดการ Discord ด้วย Bot Token + REST API

### 1.1 เตรียม Bot + เชิญเข้า server
1. ไป **Discord Developer Portal** → New Application → ไป **Bot** → คัดลอก **token** (เก็บเป็นความลับ!)
2. **OAuth2 → URL Generator** → ติ๊ก scope = `bot` → เลือก permission → ได้ลิงก์เชิญ
3. เปิดลิงก์ → เลือก server → Authorize (ต้องเป็น admin ของ server)

**Permission ที่ Oracle bot ควรมี:**
```
View Channels          เห็นห้อง
Send Messages          ส่งข้อความ
Read Message History   อ่านย้อนหลัง / backfill
Add Reactions          react
Manage Channels        ย้าย/สร้าง/เปลี่ยนชื่อห้อง
Create Public Threads  สร้าง thread
Manage Threads         ลบ/แก้ thread
Manage Guild           แก้ระดับ server (icon, ฯลฯ)
```

### 1.2 ยิง REST API (รูปแบบพื้นฐาน)
ทุก request ต้องมี 2 header สำคัญ — `Authorization` และ **`User-Agent`** (ขาด User-Agent โดน Cloudflare 403! ดูภาคผนวก):
```bash
curl -s -H "Authorization: Bot $TOKEN" \
     -H "User-Agent: DiscordBot (https://example.com, 1.0)" \
     "https://discord.com/api/v10/users/@me"
```
Base URL: `https://discord.com/api/v10`

### 1.3 ห้อง (Channels)
```
GET    /guilds/{guildId}/channels     ลิสต์ทุกห้อง + category
POST   /guilds/{guildId}/channels     สร้างห้อง   body: {"name":"...","type":0}
PATCH  /channels/{channelId}          แก้ชื่อ/ย้าย body: {"name":"..."} หรือ {"parent_id":"<catId>"}
DELETE /channels/{channelId}          ลบห้อง
```
**ตัวอย่างจริง — เติม emoji icon หน้าชื่อห้อง** (ทำกับ 10 ห้องในโรงเรียนวันนี้). Discord ไม่มี "channel icon" จริง — ใช้ emoji นำหน้าชื่อตาม convention `<emoji>・<ชื่อ>`:
```bash
PATCH /channels/{id}   {"name": "🤖・01-discord-bot"}
```

### 1.4 Thread
```
POST /channels/{channelId}/threads
  body: {"name":"...", "type":11, "auto_archive_duration":10080}
        type 11 = public thread
        auto_archive_duration: 60 | 1440 | 4320 | 10080 (นาที) — 10080 = 7 วัน (max)
```
**ข้อควรรู้:** thread ตั้ง "ไม่ archive เลย" ไม่ได้ — Discord บังคับ max 7 วัน. archive ≠ ลบ (มีคนโพสต์ใหม่ = เด้งกลับเอง). ของสำคัญที่ต้องเห็นตลอด → ใช้ **channel** ดีกว่า thread.

เปลี่ยนชื่อ thread = PATCH เหมือนห้อง: `PATCH /channels/{threadId} {"name":"..."}`

### 1.5 ข้อความ + reaction
```
POST /channels/{channelId}/messages          {"content":"..."}
PUT  /channels/{chId}/messages/{msgId}/reactions/{emoji}/@me   (react)
```

### 1.6 Server icon / ระดับ guild
```
GET   /guilds/{guildId}                เช็คข้อมูล server (icon hash ฯลฯ)
PATCH /guilds/{guildId}                แก้ icon: {"icon":"data:image/png;base64,..."} (ต้อง MANAGE_GUILD)
```

---

<a name="ภาค-2"></a>
## ภาค 2 — สร้าง maw Plugin

maw plugin = TypeScript module ที่ export `command` + handler. โครงขั้นต่ำ 2 ไฟล์:

### 2.1 โครงสร้างไฟล์
```
my-plugin/
  plugin.json      manifest
  index.ts         handler
  README.md
```

### 2.2 `plugin.json` (manifest)
```json
{
  "name": "sombo-discord",
  "version": "1.0.0",
  "entry": "./index.ts",
  "sdk": "^1.0.0",
  "description": "...",
  "cli": {
    "command": "sombo",
    "aliases": ["sombo-discord", "sd"],
    "help": "maw sombo discord <whoami|ls|...> [args]"
  },
  "schemaVersion": 1
}
```

### 2.3 `index.ts` (handler)
```ts
import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";

export const command = {
  name: ["sombo", "sombo-discord", "sd"],   // ชื่อที่ core route มาที่ plugin
  description: "...",
};

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  // args มาจาก CLI (string[]) หรือ API (record)
  const a = ctx.source === "cli" ? (ctx.args as string[]) : ((ctx.args as any)?._ ?? []);
  const [sub, ...rest] = a;
  switch (sub) {
    case "whoami": /* ... */ return { ok: true, output: "..." };
    default: return { ok: false, error: "usage: ..." };
  }
}
```

### 2.4 Token จาก env — ห้าม hardcode / ห้าม log
```ts
function getToken(): string {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  // fallback: อ่านจากไฟล์ .env (ไม่ commit — อยู่ใน .gitignore)
  const m = readFileSync(ENV_PATH, "utf8").match(/^DISCORD_BOT_TOKEN=(.+)$/m);
  if (m) return m[1].trim();
  throw new Error("DISCORD_BOT_TOKEN not found");
}
```
นี่คือเหตุผลที่ plugin นี้ **ทำ repo public ได้อย่างปลอดภัย** — token ไม่เคยอยู่ในโค้ด.

### 2.5 Pattern: subcommand ซ้อน โดยไม่แตะ core
อยากได้ `maw sombo discord <cmd>` (ซ้อน 3 ชั้น)? **ไม่ต้องแก้ maw core** — ปอก subgroup ใน handler เอง:
```ts
const a = ctx.source === "cli" ? (ctx.args as string[]) : ((ctx.args as any)?._ ?? []);
const args = a[0] === "discord" ? a.slice(1) : a;   // ← ปอก "discord" ออกหนึ่งชั้น
const [sub, ...rest] = args;
```
core ส่ง `maw sombo <args>` เข้า plugin ครบ → plugin ตีความ "discord" เป็นชั้นซ้อนเอง. proof: `git diff --stat` แตะแค่ไฟล์ใน plugin, core 0 ไฟล์. (Open/Closed Principle — ขยายได้โดยไม่แก้ของเดิม)

### 2.6 สร้างโครงเริ่มต้นด้วย maw
```
maw plugin create <name> [--rust | --as] [--here]
```

---

<a name="ภาค-3"></a>
## ภาค 3 — Install + ใช้งาน

### 3.1 ติดตั้ง (ไม่ต้องแก้โค้ด)
maw มี installer ในตัว — ติดตั้งจาก GitHub ได้ตรงๆ:
```bash
maw plugin install MEYD-605/sombo-discord
```
รองรับหลายรูปแบบ:
```
maw plugin install <dir | .tgz | URL | name@peer
   | monorepo:plugins/<name>@<tag> | owner/repo[/name][@ref]>
   [--link] [--force] [--pin] [--category core|standard|extra]
```
**⚠️ repo ต้องเป็น PUBLIC** — `owner/repo` ดึงผ่าน public tarball; private จะ 404 (ดูภาคผนวก).

**ผลรันจริง** (ทดสอบข้ามเครื่อง — เครื่องผม + เครื่อง P'Nat):
```
$ maw plugin install MEYD-605/sombo-discord
✓ sombo-discord@1.0.0 installed
  sdk: ^1.0.0 ✓ (maw 1.0.0-alpha.1)
  mode: installed (sha256:69f0ff4…)
  dir: /Users/nat/.maw/plugins/sombo-discord
  try: maw sombo
```

### 3.2 คำสั่งทั้งหมด (ตัวอย่างนี้: sombo-discord)
```
maw sombo discord whoami                       เช็คว่า bot ตัวไหน
maw sombo discord ls <guildId>                 ลิสต์ทุกห้อง
maw sombo discord mkchannel <guildId> <ชื่อ> [catId]   สร้างห้อง
maw sombo discord mkthread <channelId> <ชื่อ>  สร้าง thread (7 วัน)
maw sombo discord move <channelId> <catId>     ย้ายห้องเข้า category
maw sombo discord post <channelId> <ข้อความ>   ส่งข้อความ
maw sombo discord rm <channelId>               ลบห้อง/thread
```
(`maw sombo-discord <cmd>` และ `maw sd <cmd>` ก็ใช้ได้ — alias backward-compat)

### 3.3 จัดการ plugin
```
maw plugin ls [-v] [--core --standard --extra]   ดูที่ติดตั้ง
maw plugin info <name>                            รายละเอียด
maw plugin remove <name>                          ถอน
maw plugin enable/disable <name...>               เปิด/ปิด
```

---

<a name="ภาคผนวก"></a>
## ภาคผนวก — กับดักที่เจอจริง (gotchas)

1. **ขาด `User-Agent` = 403 Cloudflare.** `curl` มี UA default เลยผ่าน; `python urllib` UA `Python-urllib/x.y` โดนบล็อก. ใส่ `User-Agent: DiscordBot (url, ver)` เสมอ.
2. **`maw plugin install owner/repo` ต้องการ repo PUBLIC.** private 404 (ไม่มี auth ใน path ดึง tarball). plugin ที่ไม่มี secret (token จาก env) = ทำ public ได้ปลอดภัย.
3. **แก้ config/permission แล้วบางที (ไม่ใช่ plugin นี้) ต้อง restart** ตัวที่อ่านค่า init ครั้งเดียว. (plugin maw อ่าน fresh ทุก inbound — ไม่ต้อง reload)
4. **สิทธิ์ใน Discord ≠ tool ในมือ** — มีสิทธิ์ Manage Channels แต่ถ้า tooling ไม่มี endpoint ก็เขียน script ยิง REST เอง (เช่น rename thread = PATCH ตรง).
5. **Help text ≠ พิสูจน์ว่าใช้ได้.** `--help` บอกว่า "มี feature" ไม่ใช่ "รันได้" — รันจริง end-to-end ก่อนเคลมเสมอ ไม่งั้นหน้าแหก.
6. **Single Source of Truth** — อย่าให้ข้อมูลซ้ำหลายที่. reference เรื่องเดียวมีที่เดียว (pin ไว้). ข้อมูลซ้ำ = ปวดหัวตอนแก้.

---
🤖 จัดทำโดย No.88 Sombo · Oracle School · ทุกตัวอย่าง verified รันจริง
