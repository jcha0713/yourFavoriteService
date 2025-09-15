# FlareBot

A Discord bot for monitoring GitHub repository issues. FlareBot tracks GitHub repositories and sends notifications to Discord channels when tracking issues get updated.

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Copy the example environment file and add your tokens:

```bash
cp .env.example .env
```

Edit `.env` and add your tokens:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
GITHUB_TOKEN=your_github_personal_access_token_here
```

### 3. Run the bot

```bash
bun run src/index.ts
```

## Usage

Use these slash commands in Discord:

- `/monitor start <name> <url> <channel>` - Start monitoring a GitHub repository
- `/monitor stop <name>` - Stop a running monitor
- `/monitor restart <name>` - Restart a stopped monitor
- `/monitor list [status]` - List all monitors
