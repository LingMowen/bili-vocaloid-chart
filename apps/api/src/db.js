const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", ".data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  social_uid TEXT,
  email TEXT,
  nickname TEXT,
  faceimg TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users(provider, social_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(provider, email);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aid TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_aid ON comments(aid, id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
`);

const stmts = {
  upsertOAuth: db.prepare(`
    INSERT INTO users (provider, social_uid, nickname, faceimg, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider, social_uid) DO UPDATE SET
      nickname = excluded.nickname,
      faceimg = excluded.faceimg
    RETURNING id, provider, social_uid, nickname, faceimg
  `),
  upsertEmail: db.prepare(`
    INSERT INTO users (provider, email, nickname, created_at)
    VALUES ('email', ?, ?, ?)
    ON CONFLICT(provider, email) DO UPDATE SET nickname = excluded.nickname
    RETURNING id, provider, email, nickname
  `),
  findById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  insertComment: db.prepare(`
    INSERT INTO comments (aid, user_id, parent_id, content, created_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `),
  listComments: db.prepare(`
    SELECT c.id, c.aid, c.user_id, c.parent_id, c.content, c.created_at
    FROM comments c
    WHERE c.aid = ? AND c.parent_id IS NULL
    ORDER BY c.id DESC
    LIMIT ? OFFSET ?
  `),
  countComments: db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE aid = ? AND parent_id IS NULL`),
  findComment: db.prepare(`SELECT * FROM comments WHERE id = ?`),
  replyCounts: db.prepare(`
    SELECT parent_id, COUNT(*) AS n FROM comments WHERE parent_id IS NOT NULL GROUP BY parent_id
  `),
  listReplies: db.prepare(`
    SELECT c.id, c.user_id, c.parent_id, c.content, c.created_at
    FROM comments c
    WHERE c.aid = ? AND c.parent_id = ?
    ORDER BY c.id ASC
    LIMIT ?
  `),
  // 「我的」页：某用户的评论（含其收到的回复，parent_id 非空也一并列出）
  listUserComments: db.prepare(`
    SELECT c.id, c.aid, c.parent_id, c.content, c.created_at
    FROM comments c
    WHERE c.user_id = ?
    ORDER BY c.id DESC
    LIMIT ? OFFSET ?
  `),
  countUserComments: db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE user_id = ?`),
  deleteComment: db.prepare(`DELETE FROM comments WHERE id = ? AND user_id = ?`),
  deleteRepliesAll: db.prepare(`DELETE FROM comments WHERE parent_id = ?`),
};

function findUser(id) {
  const row = stmts.findById.get(id);
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    social_uid: row.social_uid,
    email: row.email,
    nickname: row.nickname,
    faceimg: row.faceimg,
    created_at: row.created_at,
  };
}

module.exports = { db, stmts, findUser };