import { db } from './sqlite.js';

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      script_name TEXT NOT NULL DEFAULT '',
      started INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      phase_name TEXT NOT NULL DEFAULT '',
      turn_index INTEGER NOT NULL DEFAULT 0,
      current_actor_id TEXT NOT NULL DEFAULT '',
      current_actor_name TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0,
      public_status TEXT NOT NULL DEFAULT '',
      presentation_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      is_owner INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_room_timeline_room_created_at
    ON room_timeline (room_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS room_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_room_chat_messages_room_created_at
    ON room_chat_messages (room_id, created_at DESC, id DESC);
  `);

  const roomColumns = db.prepare('PRAGMA table_info(rooms)').all().map((column) => column.name);
  if (!roomColumns.includes('presentation_json')) {
    db.exec("ALTER TABLE rooms ADD COLUMN presentation_json TEXT NOT NULL DEFAULT '{}'");
  }
}
