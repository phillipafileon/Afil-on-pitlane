CREATE TABLE IF NOT EXISTS submissions (
  submission_id TEXT PRIMARY KEY,
  driver_id TEXT,
  display_name TEXT NOT NULL,
  country TEXT,
  track TEXT NOT NULL,
  layout TEXT NOT NULL,
  lap_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  profile_confirmed INTEGER NOT NULL DEFAULT 0,
  app_version TEXT,
  review_state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_review ON submissions(review_state, created_at);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  country TEXT,
  track TEXT NOT NULL,
  layout TEXT NOT NULL,
  lap_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1,
  approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_track_layout_time
ON leaderboard_entries(track, layout, lap_ms);
