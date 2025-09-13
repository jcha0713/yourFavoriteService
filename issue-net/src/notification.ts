import { DiscordREST } from "dfx";
import { Context, Data, Effect, Layer } from "effect";
import type { GitHubIssue } from "./github";

interface NotificationService {
  sendIssueNotification: (
    channelId: string,
    issues: GitHubIssue[],
    repoInfo: { owner: string; repo: string },
  ) => Effect.Effect<void, never>;
}

export const NotificationService = Context.GenericTag<NotificationService>(
  "NotificationService",
);

export const NotificationServiceLive = Layer.effect(
  NotificationService,
  Effect.gen(function* () {
    const rest = yield* DiscordREST;

    return {
      sendIssueNotification: (
        channelId: string,
        issues: GitHubIssue[],
        repoInfo: { owner: string; repo: string },
      ) =>
        Effect.gen(function* () {
          // Format issues into Discord message
          const issueList = issues
            .slice(0, 5) // Limit to 5 issues to avoid message length limits
            .map(
              (issue) =>
                `• **#${issue.number}**: [${issue.title}](${issue.url})\n  👤 ${issue.author} | 🏷 ${issue.labels.join(", ") || "no labels"}`,
            )
            .join("\n\n");

          const summary =
            issues.length > 5
              ? `\n\n...and ${issues.length - 5} more issues`
              : "";

          const content = `🔍 **${repoInfo.owner}/${repoInfo.repo}**: Found ${issues.length} new issue${issues.length === 1 ? "" : "s"}!\n\n${issueList}${summary}`;

          // Send to Discord using the Effect-TS pattern
          yield* rest
            .createMessage(channelId, {
              content:
                content.length > 2000
                  ? content.substring(0, 1997) + "..."
                  : content,
            })
            .pipe(
              Effect.catchAll((error) =>
                Effect.logError(
                  `Failed to send Discord notification: ${error}`,
                ),
              ),
            );
        }),
    };
  }),
);
