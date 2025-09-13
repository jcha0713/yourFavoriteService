import { Database } from "bun:sqlite";
import { Context, Data, Effect, Layer, Option } from "effect";
import { IssueMonitor } from "./monitor.js";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  operation: string;
  message: string;
}> {}

export interface DatabaseService {
  db: Database;

  saveMonitor: (monitor: IssueMonitor) => Effect.Effect<void, DatabaseError>;
  deleteMonitor: (name: string) => Effect.Effect<void, DatabaseError>;
  getMonitor: (
    name: string,
  ) => Effect.Effect<Option.Option<IssueMonitor>, DatabaseError>;
  getAllMonitors: () => Effect.Effect<IssueMonitor[], DatabaseError>;
  updateMonitorLastCheck: (
    name: string,
    lastCheck: Date,
  ) => Effect.Effect<void, DatabaseError>;
  updateMonitorStatus: (
    name: string,
    status: "running" | "stopped" | "error",
  ) => Effect.Effect<void, DatabaseError>;
}

export const DatabaseService =
  Context.GenericTag<DatabaseService>("DatabaseService");

export const DatabaseLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const db = new Database("issue-net.db");

    db.query(`
      CREATE TABLE IF NOT EXISTS monitors (
        name TEXT PRIMARY KEY NOT NULL,
        url TEXT NOT NULL,
        last_check TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        filters TEXT,
        status TEXT DEFAULT 'stopped'
      )
    `).run();

    yield* Effect.logInfo("Database initialized");

    return {
      db,
      saveMonitor: (monitor: IssueMonitor) =>
        Effect.try({
          try: () => {
            const insertMonitor = db.prepare(`
              INSERT INTO monitors (name, url, last_check, channel_id, filters, status)
              VALUES (?, ?, ?, ?, ?, ?)
            `);
            insertMonitor.run(
              monitor.name,
              monitor.url,
              monitor.lastCheck.toISOString(),
              monitor.channelId,
              monitor.filter ? JSON.stringify(monitor.filter) : null,
              monitor.status || "stopped",
            );
          },
          catch: (error) =>
            new DatabaseError({
              operation: "saveMonitor",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),

      deleteMonitor: (name: string) =>
        Effect.try({
          try: () => {
            const deleteMonitor = db.prepare(`
              DELETE FROM monitors WHERE name = ?
            `);
            deleteMonitor.run(name);
          },
          catch: (error) =>
            new DatabaseError({
              operation: "deleteMonitor",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),

      getMonitor: (name: string) =>
        Effect.try({
          try: () => {
            const selectMonitor = db.prepare(`
              SELECT name, url, last_check, channel_id, filters, status
              FROM monitors
              WHERE name = ?
            `);
            const row = selectMonitor.get(name) as
              | {
                  name: string;
                  url: string;
                  last_check: string;
                  channel_id: string;
                  filters: string | null;
                  status: string;
                }
              | undefined;

            return Option.fromNullable(row).pipe(
              Option.map(
                (row) =>
                  new IssueMonitor({
                    name: row.name,
                    url: row.url,
                    lastCheck: new Date(row.last_check),
                    channelId: row.channel_id,
                    filter: row.filters ? JSON.parse(row.filters) : undefined,
                    status: row.status as "running" | "stopped" | "error",
                  }),
              ),
            );
          },
          catch: (error) =>
            new DatabaseError({
              operation: "getMonitor",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),

      getAllMonitors: () =>
        Effect.try({
          try: () => {
            const selectAllMonitors = db.prepare(`
              SELECT name, url, last_check, channel_id, filters, status FROM monitors
            `);
            const rows = selectAllMonitors.all() as Array<{
              name: string;
              url: string;
              last_check: string;
              channel_id: string;
              filters: string | null;
              status: string;
            }>;

            return rows.map(
              (row) =>
                new IssueMonitor({
                  name: row.name,
                  url: row.url,
                  lastCheck: new Date(row.last_check),
                  channelId: row.channel_id,
                  filter: row.filters ? JSON.parse(row.filters) : undefined,
                  status: row.status as "running" | "stopped" | "error",
                }),
            );
          },
          catch: (error) =>
            new DatabaseError({
              operation: "getAllMonitors",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),

      updateMonitorLastCheck: (name: string, lastCheck: Date) =>
        Effect.try({
          try: () => {
            const updateRepositoryLastCheck = db.prepare(`
             UPDATE monitors
             SET last_check = ?
             WHERE name = ?
           `);
            updateRepositoryLastCheck.run(lastCheck.toISOString(), name);
          },
          catch: (error) =>
            new DatabaseError({
              operation: "updateMonitorLastCheck",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),

      updateMonitorStatus: (
        name: string,
        status: "running" | "stopped" | "error",
      ) =>
        Effect.try({
          try: () => {
            const updateMonitorStatus = db.prepare(`
              UPDATE monitors
              SET status = ?
              WHERE name = ?
            `);
            updateMonitorStatus.run(status, name);
          },
          catch: (error) =>
            new DatabaseError({
              operation: "updateMonitorStatus",
              message: error instanceof Error ? error.message : String(error),
            }),
        }),
    };
  }),
);
