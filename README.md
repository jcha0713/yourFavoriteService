# YourFavoriteService

A collection of personal Discord bots for programming productivity.

## Services

### Monitoring Service
*Location: `packages/monitoring-service/`*

Discord bot that monitors GitHub repository issues and sends notifications when issues are updated.

## Usage

### Run all services
```bash
bun install
bun run monitoring:dev
```

### Run individual service
```bash
cd packages/monitoring-service
bun install
bun run dev
```

### Deploy individual service
Each service can be deployed independently with its own `package.json` and dependencies.
