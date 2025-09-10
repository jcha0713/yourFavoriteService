import { test, expect } from "bun:test";
import { Effect } from "effect";
import {
  Repository,
  RepositoryService,
  RepositoryLive,
} from "../src/repository.js";

test("RepositoryService - should add and retrieve repositories", async () => {
  const testEffect = Effect.gen(function* () {
    const service = yield* RepositoryService;

    const repo1 = new Repository({
      repoName: "discord-bots",
      authorName: "jcha0713",
    });
    const repo2 = new Repository({
      repoName: "test-repo",
      authorName: "test-user",
    });

    yield* service.add(repo1);
    yield* service.add(repo2);

    return yield* service.getAll();
  }).pipe(Effect.provide(RepositoryLive));

  const result = await Effect.runPromise(testEffect);

  expect(result).toHaveLength(2);
  expect(result.some((repo) => repo.repoName === "discord-bots")).toBe(true);
  expect(result.some((repo) => repo.repoName === "test-repo")).toBe(true);
});

test("RepositoryService - should remove repositories", async () => {
  const testEffect = Effect.gen(function* () {
    const service = yield* RepositoryService;

    const repo = new Repository({
      repoName: "temp-repo",
      authorName: "test-user",
    });
    yield* service.add(repo);

    let repos = yield* service.getAll();
    expect(repos).toHaveLength(1);

    yield* service.remove("temp-repo");

    repos = yield* service.getAll();
    return repos;
  }).pipe(Effect.provide(RepositoryLive));

  const result = await Effect.runPromise(testEffect);
  expect(result).toHaveLength(0);
});

test("RepositoryService - should clear all repositories", async () => {
  const testEffect = Effect.gen(function* () {
    const service = yield* RepositoryService;

    yield* service.add(
      new Repository({ repoName: "repo1", authorName: "user1" }),
    );
    yield* service.add(
      new Repository({ repoName: "repo2", authorName: "user2" }),
    );

    yield* service.removeAll();

    return yield* service.getAll();
  }).pipe(Effect.provide(RepositoryLive));

  const result = await Effect.runPromise(testEffect);
  expect(result).toHaveLength(0);
});
