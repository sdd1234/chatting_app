CREATE TABLE IF NOT EXISTS friends (
    owner      VARCHAR(250) NOT NULL,
    friend     VARCHAR(250) NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, friend)
);
