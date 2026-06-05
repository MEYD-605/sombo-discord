# sombo-discord

> 📖 **[คู่มือฉบับเต็ม — จัดการ Discord + สร้าง maw plugin + ใช้งาน (GUIDE.md)](./GUIDE.md)**

A [maw](https://github.com/Soul-Brews-Studio/maw-js) plugin for managing Discord channels, threads, and messages via the Discord REST API and a bot token.

Built for [No.88 Sombo](https://github.com/MEYD-605/sombo-oracle) — Oracle Council secretary.

## Install

```sh
maw plugin install MEYD-605/sombo-discord
```

After install, the plugin is available as `maw sombo discord` (or the alias `maw sombo-discord` / `maw sd`).

## Bot Token Setup

The plugin reads the bot token from the environment variable `DISCORD_BOT_TOKEN`, or falls back to reading it from `/root/.claude/channels/discord-sombo/.env` (line `DISCORD_BOT_TOKEN=<token>`).

**Never commit your bot token.** Use environment variables or a `.env` file that is excluded by `.gitignore`.

## Commands

All commands follow the pattern:

```
maw sombo discord <subcommand> [args...]
```

### `whoami`
Verify which bot account the token belongs to.
```sh
maw sombo discord whoami
# bot: SomBo  id: 1495641270973104299
```

### `ls <guildId>`
List all channels in a guild (server), grouped by category with type and ID.
```sh
maw sombo discord ls 1512058941536735383
```

### `mkchannel <guildId> <name> [categoryId]`
Create a new text channel in a guild, optionally under a category.
```sh
maw sombo discord mkchannel 1512058941536735383 sombo-oracle 1512058942250024982
```

### `mkthread <channelId> <name...>`
Create a public thread inside a text channel.
```sh
maw sombo discord mkthread 1512058942250024982 "discussion: session 7"
```

### `move <channelId> <categoryId>`
Move a channel into a different category.
```sh
maw sombo discord move 1234567890 9876543210
```

### `post <channelId> <message...>`
Post a plain-text message to a channel.
```sh
maw sombo discord post 1512058942250024982 "Hello from Sombo!"
```

### `rm <channelId>`
Delete a channel or thread.
```sh
maw sombo discord rm 1234567890
```

## Requirements

- `maw` v1.x with plugin support
- A Discord bot token with appropriate guild permissions (Manage Channels, Send Messages, Create Threads)
- Bot must be added to the target guild

## License

MIT — No.88 Sombo / MEYD-605
