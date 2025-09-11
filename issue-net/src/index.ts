import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Discord, DiscordConfig, Ix } from "dfx";
import { DiscordIxLive, InteractionsRegistry } from "dfx/gateway";
import { Config, Effect, Layer, Logger, LogLevel } from "effect";
import { Repository, RepositoryLive, RepositoryService } from "./repository.js";

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
    const repoService = yield* RepositoryService;

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

    const repoAdd = Ix.global(
      {
        name: "repo-add",
        description: "Add a GitHub repository to track",
        options: [
          {
            name: "author",
            description: "Repository owner/author name",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
          {
            name: "repo",
            description: "Repository name",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
        ],
      },
      Effect.fn("repoAdd.command")(function* (ix) {
        const authorName = ix.optionValue("author");
        const repoName = ix.optionValue("repo");

        const repository = new Repository({
          authorName,
          repoName,
          lastCheck: new Date(),
        });

        yield* repoService.add(repository);

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Repository added successfully!",
          },
        };
      }),
    );

    const repoList = Ix.global(
      {
        name: "repo-list",
        description: "List all repository you're tracking",
      },
      Effect.fn("repoList.command")(function* (ix) {
        const repositories = yield* repoService.getAll();

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              repositories.length === 0
                ? "No repositories tracked yet. Use `/repo-add` to add some!"
                : `**Tracked Repositories:**\n${repositories
                    .map((repo) => `• ${repo.authorName}/${repo.repoName}`)
                    .join("\n")}`,
          },
        };
      }),
    );

    const repoRemove = Ix.global(
      {
        name: "repo-remove",
        description: "Remove repository from tracking list",
        options: [
          {
            name: "repo",
            description: "Repository name",
            type: Discord.ApplicationCommandOptionType.STRING,
            required: true,
          },
        ],
      },
      Effect.fn("repoRemove.command")(function* (ix) {
        const repoName = ix.optionValue("repo");

        yield* repoService.remove(repoName);

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Repository removed from list successfully!",
          },
        };
      }),
    );

    const repoRemoveAll = Ix.global(
      {
        name: "repo-remove-all",
        description: "Remove all repositories in tracking list",
      },
      Effect.fn("repoRemoveAll.command")(function* (ix) {
        yield* repoService.removeAll();

        return {
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Removed all repositories successfully!",
          },
        };
      }),
    );

    yield* registry.register(
      Ix.builder
        .add(ping)
        .add(repoAdd)
        .add(repoList)
        .add(repoRemove)
        .add(repoRemoveAll)
        .catchAllCause(Effect.logError),
    );

    yield* Effect.logInfo("Issue Net bot commands registered!");
  }),
).pipe(Layer.provide(RepositoryLive), Layer.provide(DiscordLayer));

const main = Layer.launch(BotLayer).pipe(
  Logger.withMinimumLogLevel(LogLevel.Info),
  Effect.tapErrorCause(Effect.logError),
);

BunRuntime.runMain(main);
