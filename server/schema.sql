PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS world (
  id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS authority (
  id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS adoption (
  agent_id INTEGER PRIMARY KEY CHECK(agent_id BETWEEN 1 AND 1000),
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash)
);
CREATE INDEX IF NOT EXISTS adoption_session ON adoption(session_hash);
CREATE TABLE IF NOT EXISTS chronicle (
  sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, at INTEGER NOT NULL, record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chronicle_kind ON chronicle(kind, sequence DESC);
CREATE TABLE IF NOT EXISTS character_history (
  agent_id INTEGER NOT NULL, sequence INTEGER NOT NULL, text TEXT NOT NULL,
  PRIMARY KEY(agent_id, sequence)
);
CREATE TABLE IF NOT EXISTS event_history (
  event_id TEXT PRIMARY KEY, record_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_replies (
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash), request_id TEXT NOT NULL,
  command_json TEXT NOT NULL, message TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY(session_hash, request_id)
);
CREATE TRIGGER IF NOT EXISTS chronicle_no_update BEFORE UPDATE ON chronicle BEGIN SELECT RAISE(ABORT, 'Chronicle is append only'); END;
CREATE TRIGGER IF NOT EXISTS chronicle_no_delete BEFORE DELETE ON chronicle BEGIN SELECT RAISE(ABORT, 'Chronicle is append only'); END;
CREATE TRIGGER IF NOT EXISTS history_no_update BEFORE UPDATE ON character_history BEGIN SELECT RAISE(ABORT, 'History is append only'); END;
CREATE TRIGGER IF NOT EXISTS history_no_delete BEFORE DELETE ON character_history BEGIN SELECT RAISE(ABORT, 'History is append only'); END;
CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON event_history BEGIN SELECT RAISE(ABORT, 'Event evidence is append only'); END;
CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON event_history BEGIN SELECT RAISE(ABORT, 'Event evidence is append only'); END;
