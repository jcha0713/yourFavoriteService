import { Octokit } from "@octokit/core";
import { Context, Data, Effect, Layer } from "effect";

export class NoGitHubToken extends Data.TaggedError("NoGitHubToken")<{}> {}

export class GitHubAPIFail extends Data.TaggedError("GitHubAPIFail")<{
  cause: string;
}> {}

export interface IssueFilter {
  since?: string; // ISO date string
  assigned?: boolean; // true = any assigned, false = unassigned only
  state?: "open" | "closed" | "all";
  labels?: string[];
}

export class GitHubIssue extends Data.TaggedClass("GitHubIssue")<{
  number: number;
  author: string;
  title: string;
  url: string;
  createdAt: Date;
  labels: string[];
  state: "open" | "closed";
}> {}

interface GitHubService {
  fetchIssues: (
    owner: string,
    repoName: string,
    filter?: IssueFilter,
  ) => Effect.Effect<GitHubIssue[], NoGitHubToken | GitHubAPIFail>;
}

export const GitHubService = Context.GenericTag<GitHubService>("GitHubService");

export const GitHubServiceLive = Layer.effect(
  GitHubService,
  Effect.gen(function* () {
    const githubToken = Bun.env.GITHUB_TOKEN;

    if (!githubToken) {
      yield* Effect.logError(
        "GitHub token required: Create token at https://github.com/settings/personal-access-tokens and add GITHUB_TOKEN=your_token to .env file",
      );
      return yield* new NoGitHubToken();
    }

    const octokit = new Octokit({ auth: githubToken });

    return {
      fetchIssues: (owner: string, repoName: string, filter?: IssueFilter) =>
        Effect.gen(function* () {
          const assigneeParam =
            filter?.assigned === true
              ? "*"
              : filter?.assigned === false
                ? "none"
                : undefined;

          const response = yield* Effect.tryPromise({
            try: () =>
              octokit.request(`GET /repos/${owner}/${repoName}/issues`, {
                since: filter?.since,
                assignee: assigneeParam,
                state: filter?.state || "open",
                labels: filter?.labels?.join(","),
                per_page: 100,
              }),
            catch: (error) => new GitHubAPIFail({ cause: String(error) }),
          });

          const issues = response.data.map(
            (issue: any) =>
              new GitHubIssue({
                number: issue.number,
                author: issue.user?.login ?? "unknown",
                title: issue.title,
                url: issue.html_url,
                createdAt: new Date(issue.created_at),
                labels: issue.labels.map((label: any) => {
                  return label.name ?? "";
                }),
                state: issue.state as "open" | "closed",
              }),
          );

          return issues;
        }),
    };
  }),
);
