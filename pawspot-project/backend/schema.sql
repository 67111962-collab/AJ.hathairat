-- PawSpot database schema (PostgreSQL)
-- Runs automatically when the server starts; safe to run many times.

CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(20)  NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
    name           VARCHAR(40)  NOT NULL,
    email          VARCHAR(100) UNIQUE,                 -- optional, stored in lowercase
    password_hash  TEXT,                                -- NULL for social-login-only accounts
    google_id      TEXT UNIQUE,
    line_id        TEXT UNIQUE,
    avatar_url     TEXT,
    role           VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users DROP COLUMN IF EXISTS facebook_id;   -- Facebook login was removed

-- Every login attempt (password, signup, Google, LINE)
CREATE TABLE IF NOT EXISTS login_history (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    email       VARCHAR(100),                           -- account email (or what was typed, for failed attempts)
    username    VARCHAR(100),
    method      VARCHAR(20)  NOT NULL CHECK (method IN ('password', 'register', 'google', 'line')),
    success     BOOLEAN      NOT NULL,
    ip          VARCHAR(64),
    user_agent  VARCHAR(300),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_history_created_idx ON login_history (created_at DESC);
CREATE INDEX IF NOT EXISTS login_history_email_idx   ON login_history (email);

-- One row per email that has logged in successfully (open this view in pgAdmin)
CREATE OR REPLACE VIEW login_emails AS
SELECT lower(h.email)                         AS email,
       max(u.username)                        AS username,
       max(u.name)                            AS name,
       count(*)::int                          AS login_count,
       min(h.created_at)                      AS first_login,
       max(h.created_at)                      AS last_login,
       string_agg(DISTINCT h.method, ', ')    AS methods
FROM login_history h
LEFT JOIN users u ON u.id = h.user_id
WHERE h.success AND h.email IS NOT NULL
GROUP BY lower(h.email);

-- Uploaded photos (kept apart from items so listing posts stays fast)
CREATE TABLE IF NOT EXISTS images (
    id            SERIAL PRIMARY KEY,
    data          BYTEA       NOT NULL,
    content_type  VARCHAR(30) NOT NULL,
    size          INTEGER     NOT NULL,
    owner_id      INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lost / found posts
CREATE TABLE IF NOT EXISTS items (
    id           SERIAL PRIMARY KEY,
    type         VARCHAR(10)   NOT NULL CHECK (type IN ('lost', 'found')),
    name         VARCHAR(80)   NOT NULL,
    category     VARCHAR(40)   NOT NULL,
    breed        VARCHAR(60)   NOT NULL DEFAULT '',
    gender_age   VARCHAR(60)   NOT NULL DEFAULT '',
    location     VARCHAR(120)  NOT NULL,
    event_date   DATE          NOT NULL,                -- date lost / found
    reward       VARCHAR(60)   NOT NULL DEFAULT '',
    description  VARCHAR(1000) NOT NULL,
    contact      VARCHAR(120)  NOT NULL,
    status       VARCHAR(10)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'returned')),
    image_id     INTEGER       REFERENCES images(id) ON DELETE SET NULL,
    image_url    TEXT,                                  -- external photo (demo data)
    reporter_id  INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_created_at_idx ON items (created_at DESC);
CREATE INDEX IF NOT EXISTS items_reporter_idx   ON items (reporter_id);
CREATE INDEX IF NOT EXISTS items_type_status_idx ON items (type, status);

-- Tips from people who saw the pet
CREATE TABLE IF NOT EXISTS sightings (
    id          SERIAL PRIMARY KEY,
    item_id     INTEGER      NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        VARCHAR(500) NOT NULL,
    location    VARCHAR(120) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sightings_item_idx ON sightings (item_id);

-- ---------------------------------------------------------------- map + moderation
ALTER TABLE items ADD COLUMN IF NOT EXISTS lat    DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE items ADD COLUMN IF NOT EXISTS lng    DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180);
ALTER TABLE items ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;   -- hidden by an admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;   -- blocked by an admin

-- In-app notifications (bell icon)
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- who receives it
    type        VARCHAR(20)  NOT NULL,   -- allowed values: see notifications_type_check below
    item_id     INTEGER      REFERENCES items(id) ON DELETE CASCADE,
    other_item_id INTEGER    REFERENCES items(id) ON DELETE CASCADE,            -- the matching post
    actor_id    INTEGER      REFERENCES users(id) ON DELETE SET NULL,           -- who caused it
    message     VARCHAR(300) NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('sighting', 'match', 'hidden', 'report', 'review', 'approved', 'rejected'));

-- ---------------------------------------------------------------- approval
-- New posts from members wait for an admin: pending -> approved / rejected.
-- Existing posts (before this column existed) count as approved.
ALTER TABLE items ADD COLUMN IF NOT EXISTS review_status VARCHAR(10) NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE items ADD COLUMN IF NOT EXISTS review_note VARCHAR(300);   -- reason when rejected
CREATE INDEX IF NOT EXISTS items_review_idx ON items (review_status);

-- Reports of fake / scam posts
CREATE TABLE IF NOT EXISTS reports (
    id          SERIAL PRIMARY KEY,
    item_id     INTEGER      NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      VARCHAR(300) NOT NULL,
    resolved    BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (item_id, user_id)                                                    -- one report per person per post
);
