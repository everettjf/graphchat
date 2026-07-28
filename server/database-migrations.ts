import { DATABASE_SCHEMA_VERSION } from "../shared/version.js";
import type { SQLiteDatabase } from "./database.js";

export function migrateGraphDatabase(db: SQLiteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS graphs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      knowledge_status TEXT NOT NULL DEFAULT 'exploring',
      mastery TEXT NOT NULL DEFAULT 'new',
      source_url TEXT NOT NULL DEFAULT '',
      credibility INTEGER,
      rating INTEGER NOT NULL DEFAULT 0,
      context_snapshot TEXT,
      selected_text TEXT,
      x REAL NOT NULL,
      y REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'complete',
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      include_in_context INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS graph_revisions (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS graph_events (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_graph ON nodes(graph_id);
    CREATE INDEX IF NOT EXISTS idx_edges_graph ON edges(graph_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    CREATE INDEX IF NOT EXISTS idx_graph_events_graph_created
      ON graph_events(graph_id, created_at);
  `);
  const graphColumns = db
    .prepare("PRAGMA table_info(graphs)")
    .all() as Array<{ name: string }>;
  if (!graphColumns.some((column) => column.name === "archived_at")) {
    db.exec("ALTER TABLE graphs ADD COLUMN archived_at TEXT;");
  }
  const nodeColumns = db
    .prepare("PRAGMA table_info(nodes)")
    .all() as Array<{ name: string }>;
  const additions = [
    ["tags", "TEXT NOT NULL DEFAULT '[]'"],
    ["knowledge_status", "TEXT NOT NULL DEFAULT 'exploring'"],
    ["mastery", "TEXT NOT NULL DEFAULT 'new'"],
    ["source_url", "TEXT NOT NULL DEFAULT ''"],
    ["credibility", "INTEGER"],
    ["rating", "INTEGER NOT NULL DEFAULT 0"],
    ["context_snapshot", "TEXT"],
  ] as const;
  for (const [name, definition] of additions) {
    if (!nodeColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE nodes ADD COLUMN ${name} ${definition};`);
    }
  }
  const currentSchemaVersion = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
  );
  if (currentSchemaVersion < 3) {
    db.exec(`
      UPDATE edges
      SET kind = 'continuation', label = 'Continue'
      WHERE kind = 'branch'
        AND target IN (SELECT id FROM nodes WHERE selected_text IS NULL);
      UPDATE edges SET label = 'Branch' WHERE kind = 'branch';
      UPDATE edges SET label = 'Reference' WHERE kind = 'reference';
      UPDATE edges SET label = 'Supports' WHERE kind = 'supports';
      UPDATE edges SET label = 'Contradicts' WHERE kind = 'contradicts';
    `);
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      id UNINDEXED,
      graph_id UNINDEXED,
      title,
      prompt,
      summary,
      content,
      tags,
      source_url,
      content='nodes',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(
        rowid, id, graph_id, title, prompt, summary, content, tags, source_url
      ) VALUES (
        new.rowid, new.id, new.graph_id, new.title, new.prompt, new.summary,
        new.content, new.tags, new.source_url
      );
    END;
    CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
      INSERT INTO nodes_fts(
        nodes_fts, rowid, id, graph_id, title, prompt, summary, content, tags, source_url
      ) VALUES (
        'delete', old.rowid, old.id, old.graph_id, old.title, old.prompt,
        old.summary, old.content, old.tags, old.source_url
      );
    END;
    CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
      INSERT INTO nodes_fts(
        nodes_fts, rowid, id, graph_id, title, prompt, summary, content, tags, source_url
      ) VALUES (
        'delete', old.rowid, old.id, old.graph_id, old.title, old.prompt,
        old.summary, old.content, old.tags, old.source_url
      );
      INSERT INTO nodes_fts(
        rowid, id, graph_id, title, prompt, summary, content, tags, source_url
      ) VALUES (
        new.rowid, new.id, new.graph_id, new.title, new.prompt, new.summary,
        new.content, new.tags, new.source_url
      );
    END;
  `);
  if (currentSchemaVersion < 4) {
    db.exec("INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild');");
  }
  db.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION};`);
}
