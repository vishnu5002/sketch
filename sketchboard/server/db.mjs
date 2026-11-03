// SQLite storage. One file, WAL mode, schema upgraded in place by numbered migrations.
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS = [
  // 1 — initial schema
  `
  CREATE TABLE projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    created       INTEGER NOT NULL,
    updated       INTEGER NOT NULL,
    opened        INTEGER,
    pinned        INTEGER NOT NULL DEFAULT 0,
    deleted       INTEGER,
    thumb         BLOB,
    page_count    INTEGER NOT NULL DEFAULT 0,
    element_count INTEGER NOT NULL DEFAULT 0,
    linked_path   TEXT,
    linked_mtime  INTEGER,
    source_path   TEXT
  );
  CREATE INDEX projects_by_opened ON projects(deleted, opened);

  CREATE TABLE project_docs (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    rev        INTEGER NOT NULL,
    doc        TEXT NOT NULL,
    content_hash TEXT
  );

  CREATE TABLE versions (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created       INTEGER NOT NULL,
    kind          TEXT NOT NULL,
    label         TEXT,
    reason        TEXT,
    summary       TEXT NOT NULL,
    hash          TEXT NOT NULL,
    page_count    INTEGER NOT NULL,
    element_count INTEGER NOT NULL,
    thumb         BLOB,
    doc           TEXT NOT NULL
  );
  CREATE INDEX versions_by_project ON versions(project_id, created);

  CREATE TABLE blobs (
    hash    TEXT PRIMARY KEY,
    mime    TEXT NOT NULL,
    size    INTEGER NOT NULL,
    created INTEGER NOT NULL,
    data    BLOB NOT NULL
  );

  CREATE TABLE library (
    id       TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    item     TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE folders (
    id    TEXT PRIMARY KEY,
    path  TEXT UNIQUE NOT NULL,
    added INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE project_search USING fts5(project_id UNINDEXED, name, body, tokenize = 'unicode61 remove_diacritics 2');
  `,
];

export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const fresh = !existsSync(file);
  const db = new DatabaseSync(file);
  if (fresh) chmodSync(file, 0o600);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get();
  let version = row?.version ?? 0;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  for (; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.prepare("UPDATE schema_version SET version = ?").run(version + 1);
    });
  }
  return db;
}

/** Run `fn` atomically. Nested calls join the outer transaction. */
let depth = 0;
export function transaction(db, fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}
