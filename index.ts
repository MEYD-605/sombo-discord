import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";
import { readFileSync } from "fs";

export const command = {
  // `maw sombo discord <cmd>` is the canonical form (P'Nat 2026-06-05 — nested group).
  // `sombo-discord` / `sd` kept as aliases for backward compatibility.
  name: ["sombo", "sombo-discord", "sd"],
  description: "Manage the Oracle School Discord (channels/threads/messages) via REST API + bot token.",
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

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const logs: string[] = [];
  const say = (...a: any[]) => { (ctx.writer ? ctx.writer : (s: string) => logs.push(s))(a.map(String).join(" ")); };

  // Normalize args from CLI (string[]) or API (record).
  const a = ctx.source === "cli" ? (ctx.args as string[]) : ((ctx.args as any)?._ ?? []);
  // Nested form `maw sombo discord <cmd>`: strip an optional leading "discord" subgroup
  // so both `maw sombo discord whoami` and `maw sombo-discord whoami` resolve the same.
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
