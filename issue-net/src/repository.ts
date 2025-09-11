import { Data, Effect, Context, Layer } from "effect";

export class Repository extends Data.TaggedClass("Repository")<{
  repoName: string;
  authorName: string;
  lastCheck: Date;
}> {}

interface RepositoryService {
  add: (repo: Repository) => Effect.Effect<void>;
  remove: (repoName: string) => Effect.Effect<void>;
  getAll: () => Effect.Effect<Repository[]>;
  removeAll: () => Effect.Effect<void>;
}

export const RepositoryService =
  Context.GenericTag<RepositoryService>("RepositoryService");

const makeInMemoryRepositoryService = Effect.sync((): RepositoryService => {
  const repos = new Map<string, Repository>();

  return {
    add: (repo: Repository) =>
      Effect.sync(() => {
        repos.set(repo.repoName, repo);
      }),

    remove: (repoName: string) =>
      Effect.sync(() => {
        repos.delete(repoName);
      }),

    getAll: () => Effect.sync(() => Array.from(repos.values())),

    removeAll: () =>
      Effect.sync(() => {
        repos.clear();
      }),
  };
});

export const RepositoryLive = Layer.effect(
  RepositoryService,
  makeInMemoryRepositoryService,
);
