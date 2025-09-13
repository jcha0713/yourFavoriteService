import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Discord, DiscordConfig, Ix } from "dfx";
import { DiscordIxLive, InteractionsRegistry } from "dfx/gateway";
import { Config, Effect, Layer, Logger, LogLevel } from "effect";
import { DatabaseLive } from "./database";
import { GitHubServiceLive } from "./github";
import { IssueMonitor, MonitorService, MonitorServiceLive } from "./monitor";
import { NotificationServiceLive } from "./notification";

const DiscordLayer = DiscordIxLive.pipe(
  Layer.provide([
    DiscordConfig.layerConfig({
      token: Config.redacted("DISCORD_BOT_TOKEN"),
    }),
    FetchHttpClient.layer,
    BunSocket.layerWebSocketConstructor,
  ]),
);

const BotLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* InteractionsRegistry;
    const monitorService = yield* MonitorService;

    const ping = Ix.global(
      {
        name: "ping",
        description: "Check if the bot is responsive",
      },
      Effect.succeed({
        type: Discord.InteractionCallbackTypes.PONG,
        data: {
          content: "Pong! Running on BunRuntime with dfx.",
        },
      }),
    );

    const monitorStart = Ix.global(
      {
        name: "monitor-start",
        description: "Start monitoring a GitHub repository for new issues",
        options: [
          {
            name: "name",
            description: "Monitor name (e.g., 'Gleam Issues')",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
          {
            name: "url",
            description: "GitHub repository URL",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
          {
            name: "channel",
            description: "Discord channel for issue notifications",
            type: Discord.ApplicationCommandOptionType.CHANNEL,
            required: true,
          },
        ],
      },
      Effect.fn("monitorStart.command")(function* (ix) {
        const name = ix.optionValue("name");
        const url = ix.optionValue("url");
        const channelId = ix.optionValue("channel");

        const monitor = new IssueMonitor({
          name,
          url,
          channelId,
          lastCheck: new Date(),
          status: "running",
        });

        const result = yield* Effect.either(
          monitorService.startMonitor(monitor),
        );

        if (result._tag === "Left") {
          return {
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Failed to start monitor: ${result.left.message}`,
            },
          };
        }

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Started monitoring **${name}** for new issues`,
          },
        };
      }),
    );

    const monitorStop = Ix.global(
      {
        name: "monitor-stop",
        description: "Stop a running monitor",
        options: [
          {
            name: "name",
            description: "Monitor name to stop",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
        ],
      },
      Effect.fn("monitorStop.command")(function* (ix) {
        const name = ix.optionValue("name");

        const result = yield* Effect.either(
          monitorService.stopMonitor(name),
        );

        if (result._tag === "Left") {
          return {
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Failed to stop monitor: ${result.left.message}`,
            },
          };
        }

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Stopped monitor: **${name}**`,
          },
        };
      }),
    );

    const monitorList = Ix.global(
      {
        name: "monitor-list",
        description: "List all monitors and their status",
      },
      Effect.fn("monitorList.command")(function* (ix) {
        const monitors = yield* monitorService.listMonitors();

        const content =
          monitors.length === 0
            ? "No monitors created yet. Use `/monitor-start` to add some!"
            : `**All Monitors:**\n${monitors
                .map(
                  (monitor) =>
                    `${monitor.status === "running" ? "🟢" : "🔴"} **${monitor.name}**: ${monitor.url}`,
                )
                .join("\n")}`;

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content,
          },
        };
      }),
    );

    yield* registry.register(
      Ix.builder
        .add(ping)
        .add(monitorStart)
        .add(monitorStop)
        .add(monitorList)
        .catchAllCause(Effect.logError),
    );

    yield* Effect.logInfo("Bot commands registered");
  }),
).pipe(
  Layer.provide(MonitorServiceLive),
  Layer.provide(NotificationServiceLive),
  Layer.provide(GitHubServiceLive),
  Layer.provide(DatabaseLive),
  Layer.provide(DiscordLayer),
);

const main = Layer.launch(BotLayer).pipe(
  Logger.withMinimumLogLevel(LogLevel.Info),
  Effect.tapErrorCause(Effect.logError),
);

BunRuntime.runMain(main);
