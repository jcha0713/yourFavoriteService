# YourFavoriteService

A collection of your favorite service.

## Services

### Monitoring Service

<img src="./service.png" width="360" height="240" align="center">

_Location: `packages/monitoring-service/`_

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
