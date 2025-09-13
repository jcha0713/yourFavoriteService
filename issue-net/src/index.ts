import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Discord, DiscordConfig, Ix } from "dfx";
import { DiscordIxLive, InteractionsRegistry } from "dfx/gateway";
import { Config, Effect, Layer, Logger, LogLevel, Option } from "effect";
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

    const monitor = Ix.global(
      {
        name: "monitor",
        description: "Manage GitHub issue monitoring",
        options: [
          {
            name: "start",
            description: "Start monitoring a GitHub repository for new issues",
            type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
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
          {
            name: "stop",
            description: "Stop a running monitor",
            type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
            options: [
              {
                name: "name",
                description: "Monitor name to stop",
                type: Discord.ApplicationCommandOptionType.STRING,
                required: true,
                autocomplete: true,
              },
            ],
          },
          {
            name: "list",
            description: "List all monitors and their status",
            type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
            options: [
              {
                name: "status",
                description: "Filter monitors by status",
                type: Discord.ApplicationCommandOptionType.STRING,
                required: false,
                choices: [
                  { name: "Running", value: "running" },
                  { name: "Stopped", value: "stopped" },
                  { name: "Error", value: "error" },
                ],
              },
            ],
          },
        ],
      },
      Effect.fn("monitor.command")(function* (ix) {
        return yield* ix.subCommands({
          start: Effect.gen(function* () {
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
                type: Discord.InteractionCallbackTypes
                  .CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `Failed to start monitor: ${result.left.message}`,
                },
              };
            }

            return {
              type: Discord.InteractionCallbackTypes
                .CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `Started monitoring **${name}** for new issues`,
              },
            };
          }),

          stop: Effect.gen(function* () {
            const name = ix.optionValue("name");

            const result = yield* Effect.either(
              monitorService.stopMonitor(name),
            );

            if (result._tag === "Left") {
              return {
                type: Discord.InteractionCallbackTypes
                  .CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `Failed to stop monitor: ${result.left.message}`,
                },
              };
            }

            return {
              type: Discord.InteractionCallbackTypes
                .CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `Stopped monitor: **${name}**`,
              },
            };
          }),

          list: Effect.gen(function* () {
            const maybeFilter = ix.optionValueOptional("status");
            const monitors = yield* monitorService.listMonitors();

            const allMonitors = Option.match(maybeFilter, {
              onSome: (filter) =>
                monitors.filter((monitor) => monitor.status === filter),
              onNone: () => monitors,
            });

            const content =
              allMonitors.length === 0
                ? Option.isSome(maybeFilter)
                  ? `No monitors found with status: ${maybeFilter.value}`
                  : "No monitors created yet. Use `/monitor start` to add some!"
                : `**All Monitors**\n${allMonitors
                    .map(
                      (monitor) =>
                        `**${monitor.name}** (${monitor.status}): ${monitor.url}`,
                    )
                    .join("\n")}`;

            return {
              type: Discord.InteractionCallbackTypes
                .CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content,
              },
            };
          }),
        });
      }),
    );

    const monitorAutocomplete = Ix.autocomplete(
      Ix.option("monitor", "name"),
      Effect.gen(function* () {
        const query = String(yield* Ix.focusedOptionValue);
        const allMonitors = yield* monitorService.listMonitors();
        const runningMonitors = allMonitors.filter(
          (m) => m.status === "running",
        );

        const filtered = runningMonitors
          .filter((monitor) =>
            monitor.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 25)
          .map((monitor) => ({
            name: `${monitor.name} (${monitor.url})`,
            value: monitor.name,
          }));

        return Ix.response({
          type: Discord.InteractionCallbackTypes
            .APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: { choices: filtered },
        });
      }),
    );

    yield* registry.register(
      Ix.builder
        .add(ping)
        .add(monitor)
        .add(monitorAutocomplete)
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
