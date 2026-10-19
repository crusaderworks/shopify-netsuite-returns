

CREATE TABLE IF NOT EXISTS netsuite_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shop_domain TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),

    account_id TEXT,
    consumer_key TEXT,
    consumer_secret_enc TEXT,
    token_id TEXT,
    token_secret_enc TEXT,

    invoice_lookup_url TEXT,
    rma_creation_url TEXT,

    auto_sync_on_approval INTEGER NOT NULL DEFAULT 1,
    connection_status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (connection_status IN ('connected', 'disconnected', 'error')),
    last_tested_at TEXT,
    last_error_message TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(shop_domain, environment)
);

CREATE INDEX idx_netsuite_shop_env ON netsuite_configs(shop_domain, environment);