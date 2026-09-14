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

-- Authoritative reference floor for each supported circuit/layout.
-- Pitlane leaderboard laps may equal this time or be slower, but may never be faster.
-- A layout with no configured reference record is not eligible for public leaderboard upload.
CREATE TABLE IF NOT EXISTS track_records (
  track TEXT NOT NULL,
  layout TEXT NOT NULL,
  record_ms INTEGER NOT NULL CHECK(record_ms >= 5000 AND record_ms <= 3600000),
  record_holder TEXT,
  record_vehicle TEXT,
  record_source TEXT,
  source_url TEXT,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (track, layout)
);

CREATE INDEX IF NOT EXISTS idx_track_records_lookup
ON track_records(track, layout);
