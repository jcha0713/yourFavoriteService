# Monitoring Service

Discord bot that monitors GitHub repository issues and sends notifications when issues are updated.

## Setup

### 1. Install dependencies
```bash
bun install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
GITHUB_TOKEN=your_github_personal_access_token_here
```

### 3. Run
```bash
bun run dev
```

## Commands

- `/monitor start <name> <url> <channel>` - Start monitoring a GitHub repository
- `/monitor stop <name>` - Stop a running monitor
- `/monitor restart <name>` - Restart a stopped monitor
- `/monitor list [status]` - List all monitors