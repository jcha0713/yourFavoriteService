import { Database } from "bun:sqlite";
import { Context, Effect, Layer } from "effect";
import { IssueMonitor } from "./monitor.js";

export interface DatabaseService {
  db: Database;

  saveMonitor: (monitor: IssueMonitor) => Effect.Effect<void>;
  deleteMonitor: (name: string) => Effect.Effect<void>;
  getAllMonitors: () => Effect.Effect<IssueMonitor[]>;
  updateMonitorLastCheck: (
    name: string,
    lastCheck: Date,
  ) => Effect.Effect<void>;
  updateMonitorStatus: (
    name: string,
    status: "running" | "stopped" | "error",
  ) => Effect.Effect<void>;
}

export const DatabaseService =
  Context.GenericTag<DatabaseService>("DatabaseService");

export const DatabaseLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const db = new Database("issue-net.db");

    db.query(`
      CREATE TABLE IF NOT EXISTS monitors (
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        last_check TEXT NOT NULL,
        filters TEXT,
        status TEXT DEFAULT 'stopped',
        PRIMARY KEY (name, url)
      )
    `).run();

    yield* Effect.logInfo("Database initialized");

    return {
      db,

      saveMonitor: (monitor: IssueMonitor) =>
        Effect.sync(() => {
          const insertMonitor = db.prepare(`
            INSERT INTO monitors (name, url, last_check, filters, status)
            VALUES (?, ?, ?, ?, ?)
          `);
          insertMonitor.run(
            monitor.name,
            monitor.url,
            monitor.lastCheck.toISOString(),
            monitor.filter ? JSON.stringify(monitor.filter) : null,
            monitor.status || "stopped",
          );
        }),

      deleteMonitor: (name: string) =>
        Effect.sync(() => {
          const deleteMonitor = db.prepare(`
            DELETE FROM monitors WHERE name = ?
          `);
          deleteMonitor.run(name);
        }),

      getAllMonitors: () =>
        Effect.sync(() => {
          const selectAllMonitors = db.prepare(`
            SELECT name, url, last_check, filters, status FROM monitors
          `);
          const rows = selectAllMonitors.all() as Array<{
            name: string;
            url: string;
            last_check: string;
            filters: string | null;
            status: string;
          }>;

          return rows.map(
            (row) =>
              new IssueMonitor({
                name: row.name,
                url: row.url,
                lastCheck: new Date(row.last_check),
                filter: row.filters ? JSON.parse(row.filters) : undefined,
                status: row.status as "running" | "stopped" | "error",
              }),
          );
        }),

      updateMonitorLastCheck: (name: string, lastCheck: Date) =>
        Effect.sync(() => {
          const updateRepositoryLastCheck = db.prepare(`
           UPDATE monitors
           SET last_check = ?
           WHERE name = ?
         `);
          updateRepositoryLastCheck.run(lastCheck.toISOString(), name);
        }),

      updateMonitorStatus: (name: string, status: "running" | "stopped" | "error") =>
        Effect.sync(() => {
          const updateMonitorStatus = db.prepare(`
            UPDATE monitors
            SET status = ?
            WHERE name = ?
          `);
          updateMonitorStatus.run(status, name);
        }),
    };
  }),
);
