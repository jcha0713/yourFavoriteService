import { Context, Data, Effect, Fiber, Layer, Ref, Schedule } from "effect";
import { DatabaseService } from "./database";
import { GitHubService, type IssueFilter } from "./github";

export class IssueMonitor extends Data.TaggedClass("IssueMonitor")<{
  name: string;
  url: string;
  lastCheck: Date;
  filter?: IssueFilter;
  status?: "running" | "stopped" | "error";
}> {}

interface MonitorService {
  startMonitor: (monitor: IssueMonitor) => Effect.Effect<void, Error>;
  stopMonitor: (name: string) => Effect.Effect<void, Error>;
  listMonitors: () => Effect.Effect<IssueMonitor[]>;
}

export const MonitorService =
  Context.GenericTag<MonitorService>("MonitorService");

export const MonitorServiceLive = Layer.effect(
  MonitorService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const githubService = yield* GitHubService;

    const activeMonitors = new Map<string, Fiber.RuntimeFiber<number, never>>();

    const parseGitHubUrl = (url: string) => {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      return match ? { owner: match[1], repo: match[2] } : null;
    };

    const startMonitorFiber = (monitor: IssueMonitor) =>
      Effect.gen(function* () {
        const parsed = parseGitHubUrl(monitor.url);
        if (!parsed || !parsed.owner || !parsed.repo) {
          yield* Effect.logError(
            `Invalid GitHub URL for monitor ${monitor.name}: ${monitor.url}`,
          );
          return;
        }

        const { owner, repo } = parsed;
        yield* Effect.logInfo(
          `Starting fiber for monitor: ${monitor.name} (${owner}/${repo})`,
        );

        const lastCheckRef = yield* Ref.make(monitor.lastCheck);

        const fiber = Effect.runFork(
          Effect.schedule(
            createMonitorTask(
              owner,
              repo,
              monitor.name,
              lastCheckRef,
              monitor.filter,
            ),
            Schedule.spaced("1 minutes"),
          ),
        );

        activeMonitors.set(monitor.name, fiber);
        yield* Effect.logInfo(`Monitor fiber started: ${monitor.name}`);
      });

    const createMonitorTask = (
      owner: string,
      repo: string,
      monitorName: string,
      lastCheckRef: Ref.Ref<Date>,
      filter?: IssueFilter,
    ) =>
      Effect.gen(function* () {
        const currentLastCheck = yield* Ref.get(lastCheckRef);

        const issueFilter: IssueFilter = {
          ...filter,
          since: currentLastCheck.toISOString(),
        };

        yield* Effect.logInfo(
          `Searching for issues since ${currentLastCheck.toISOString()}`,
        );

        const issues = yield* githubService
          .fetchIssues(owner, repo, issueFilter)
          .pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `GitHub API error for ${owner}/${repo}: ${error.message}`,
                );
                return [];
              }),
            ),
          );

        yield* Effect.logInfo(
          `GitHub API returned ${issues.length} issues for ${owner}/${repo}`,
        );

        if (issues.length > 0) {
          yield* Effect.logInfo(
            `Found ${issues.length} new issues in ${owner}/${repo}`,
          );

          // TODO: Send Discord notification here
          const issueList = issues
            .slice(0, 3)
            .map(
              (issue) =>
                `• **#${issue.number}**: ${issue.title}\n  👤 ${issue.author} | 🏷 ${issue.labels.join(", ") || "no labels"}`,
            )
            .join("\n");

          const notificationContent = `🔍 **${owner}/${repo}**: ${issues.length} new issues\n${issueList}${
            issues.length > 3 ? `\n...and ${issues.length - 3} more` : ""
          }`;

          yield* Effect.logInfo(
            `Discord notification:\n${notificationContent}`,
          );

          const newTimestamp = new Date();
          yield* Ref.set(lastCheckRef, newTimestamp);
          yield* db.updateMonitorLastCheck(monitorName, newTimestamp);
        }
      });

    yield* Effect.logInfo(
      "Initializing MonitorService - loading existing monitors",
    );

    const existingMonitors = yield* db.getAllMonitors();
    const runningMonitors = existingMonitors.filter(
      (m) => m.status === "running",
    );

    yield* Effect.logInfo(
      `Found ${runningMonitors.length} running monitors to restore`,
    );

    for (const monitor of runningMonitors) {
      yield* startMonitorFiber(monitor);
    }

    yield* Effect.logInfo("MonitorService initialization complete");

    return {
      startMonitor: (monitor: IssueMonitor) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Starting monitor: ${monitor.name}`);

          const runningMonitor = new IssueMonitor({
            ...monitor,
            status: "running",
          });

          yield* db.saveMonitor(runningMonitor);

          yield* startMonitorFiber(runningMonitor);
        }),

      stopMonitor: (name: string) =>
        Effect.gen(function* () {
          const fiber = activeMonitors.get(name);

          if (!fiber) {
            return yield* Effect.fail(
              new Error(`Monitor '${name}' is not running`),
            );
          }

          yield* Fiber.interrupt(fiber);
          activeMonitors.delete(name);

          yield* db.updateMonitorStatus(name, "stopped");

          yield* Effect.logInfo(`Stopped monitor: ${name}`);
        }),

      listMonitors: () =>
        Effect.gen(function* () {
          const allMonitors = yield* db.getAllMonitors();
          return allMonitors;
        }),
    };
  }),
);
