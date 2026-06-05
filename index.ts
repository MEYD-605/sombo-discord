import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";

export const command = {
  // `maw sombo <discord|notion> <cmd>` — nested service groups (P'Nat 2026-06-05).
  // `sombo-discord` / `sd` kept as aliases for the discord group (backward compat).
  name: ["sombo", "sombo-discord", "sd"],
  description: "Sombo's ops: `maw sombo discord <cmd>` (Discord via REST) + `maw sombo notion <cmd>` (Notion via notion-cli).",
};

const API = "https://discord.com/api/v10";
const ENV_PATH = "/root/.claude/channels/discord-sombo/.env";

// Token is never an argument and never logged — read from env, fall back to the bot's .env.
function getToken(): string {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  try {
    const m = readFileSync(ENV_PATH, "utf8").match(/^DISCORD_BOT_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  throw new Error("DISCORD_BOT_TOKEN not found (env or " + ENV_PATH + ")");
}

async function dapi(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${getToken()}`,
      "Content-Type": "application/json",
      "User-Agent": "maw-sombo-discord/1.0",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json: any = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }
  if (res.status >= 300) throw new Error(`Discord ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const TYPES: Record<number, string> = { 0: "text", 2: "voice", 4: "CATEGORY", 5: "news", 11: "pub-thread", 12: "priv-thread", 15: "forum" };

// ── notion subgroup ── wraps notion-cli (must be installed + configured on the host).
function notionBin(): string {
  for (const p of ["/root/.local/bin/notion-cli", "notion-cli"]) {
    try { if (p.startsWith("/")) { readFileSync(p); return p; } } catch { /* try next */ }
  }
  return "notion-cli"; // fall back to PATH lookup
}
function ncli(args: string[]): any {
  const out = execFileSync(notionBin(), args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  try { return JSON.parse(out); } catch { return { raw: out }; }
}
function nodeTitle(it: any): string {
  if (it?.object === "database") return (it.title ?? []).map((x: any) => x.plain_text).join("") || "(db)";
  for (const v of Object.values(it?.properties ?? {}) as any[]) {
    if (v?.type === "title") return (v.title ?? []).map((x: any) => x.plain_text).join("");
  }
  return "(untitled)";
}
async function handleNotion(a: string[], say: (...x: any[]) => void): Promise<InvokeResult> {
  const [sub, ...rest] = a;
  try {
    switch (sub) {
      case "whoami": {
        const d = ncli(["whoami", "--output", "json"]);
        const u = d?.data?.results?.[0] ?? d?.data ?? d;
        say(`notion bot: ${u?.name ?? "?"}  id: ${u?.id ?? "?"}`);
        break;
      }
      case "search": {
        const q = rest.join(" ");
        const d = ncli(["search", "--query", q, "--limit", "12", "--output", "json"]);
        const res = d?.data?.results ?? [];
        say(`${res.length} result(s):`);
        for (const it of res) say(`  [${it.object}] ${nodeTitle(it)}  ${it.id}`);
        break;
      }
      case "push": {
        // maw sombo notion push <parentPageId> <markdownFile> <title...>
        const [parent, file, ...titleParts] = rest;
        const title = titleParts.join(" ");
        if (!parent || !file || !title) return { ok: false, error: "usage: maw sombo notion push <parentPageId> <markdownFile> <title...>" };
        const props = JSON.stringify({ title: [{ text: { content: title } }] });
        const cr = ncli(["page", "create", "-p", parent, "--icon-emoji", "🗄️", "--properties", props, "--output", "json"]);
        const id = cr?.data?.id;
        if (!id) return { ok: false, error: `page create failed: ${JSON.stringify(cr).slice(0, 200)}` };
        // markdown set chunks server-side (page create -f caps at 100 blocks)
        const sr = ncli(["markdown", "set", id, "--file", file, "--output", "json"]);
        if (sr?.success === false) return { ok: false, error: `content push failed: ${JSON.stringify(sr?.error).slice(0, 200)}` };
        const url = ncli(["page", "retrieve", id, "--output", "json"])?.data?.url;
        say(`✓ pushed: ${title}`);
        say(`  ${url ?? id}`);
        break;
      }
      default:
        return { ok: false, error: "usage: maw sombo notion <whoami|search <q>|push <parentPageId> <mdFile> <title...>>" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const logs: string[] = [];
  const say = (...a: any[]) => { (ctx.writer ? ctx.writer : (s: string) => logs.push(s))(a.map(String).join(" ")); };

  // Normalize args from CLI (string[]) or API (record).
  const a = ctx.source === "cli" ? (ctx.args as string[]) : ((ctx.args as any)?._ ?? []);
  // Service groups: `maw sombo notion <cmd>` routes to the notion handler;
  // `maw sombo discord <cmd>` (or bare, for backward compat) routes to the discord switch below.
  if (a[0] === "notion") {
    const r = await handleNotion(a.slice(1), say);
    return { ...r, output: logs.join("\n") || undefined };
  }
  const args = a[0] === "discord" ? a.slice(1) : a;
  const [sub, ...rest] = args;

  try {
    switch (sub) {
      case "whoami": {
        const me = await dapi("GET", "/users/@me");
        say(`bot: ${me.username}  id: ${me.id}`);
        break;
      }
      case "ls": {
        const guild = rest[0];
        if (!guild) return { ok: false, error: "usage: maw sombo discord ls <guildId>" };
        const ch = await dapi("GET", `/guilds/${guild}/channels`);
        const cats: Record<string, string> = {};
        for (const c of ch) if (c.type === 4) cats[c.id] = c.name;
        for (const c of ch.sort((x: any, y: any) => (x.position ?? 0) - (y.position ?? 0))) {
          if (c.type === 4) say(`== [${c.name}] id=${c.id}`);
          else say(`   ${(TYPES[c.type] || c.type).padEnd(10)} #${c.name}  id=${c.id}  under=${cats[c.parent_id] || "-"}`);
        }
        break;
      }
      case "mkthread": {
        const [channel, ...nameParts] = rest;
        const name = nameParts.join(" ");
        if (!channel || !name) return { ok: false, error: "usage: maw sombo discord mkthread <channelId> <name...>" };
        const t = await dapi("POST", `/channels/${channel}/threads`, { name, type: 11, auto_archive_duration: 10080 });
        say(`thread created: ${t.id}  "${t.name}"`);
        break;
      }
      case "move": {
        const [channel, category] = rest;
        if (!channel || !category) return { ok: false, error: "usage: maw sombo discord move <channelId> <categoryId>" };
        await dapi("PATCH", `/channels/${channel}`, { parent_id: category });
        say(`moved ${channel} -> category ${category}`);
        break;
      }
      case "post": {
        const [channel, ...msgParts] = rest;
        const content = msgParts.join(" ");
        if (!channel || !content) return { ok: false, error: "usage: maw sombo discord post <channelId> <message...>" };
        const m = await dapi("POST", `/channels/${channel}/messages`, { content });
        say(`posted: ${m.id}`);
        break;
      }
      case "mkchannel": {
        const [guild, name, category] = rest;
        if (!guild || !name) return { ok: false, error: "usage: maw sombo discord mkchannel <guildId> <name> [categoryId]" };
        const body: any = { name, type: 0 };
        if (category) body.parent_id = category;
        const c = await dapi("POST", `/guilds/${guild}/channels`, body);
        say(`channel created: ${c.id}  #${c.name}`);
        break;
      }
      case "rm": {
        const [channel] = rest;
        if (!channel) return { ok: false, error: "usage: maw sombo discord rm <channelId>" };
        await dapi("DELETE", `/channels/${channel}`);
        say(`deleted ${channel}`);
        break;
      }
      default:
        return { ok: false, error: "usage: maw sombo discord <whoami|ls|mkthread|move|post|mkchannel|rm> [args]" };
    }
    return { ok: true, output: logs.join("\n") || undefined };
  } catch (e: any) {
    return { ok: false, error: e.message, output: logs.join("\n") || undefined };
  }
}
