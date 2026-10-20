PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE activity_logs_new (
    id TEXT PRIMARY KEY,

    tenant_id TEXT,
    shop_domain TEXT NOT NULL,

    order_id TEXT,
    order_number TEXT,
    return_id TEXT,
    return_number TEXT,

    category TEXT NOT NULL,

    action TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'info'
        CHECK (status IN (
            'started',
            'success',
            'failed',
            'warning',
            'info'
        )),

    message TEXT,
    error_code TEXT,
    http_status INTEGER,

    source TEXT NOT NULL DEFAULT 'system'
        CHECK (source IN (
            'customer',
            'admin',
            'shopify',
            'netsuite',
            'system'
        )),

    correlation_id TEXT,
    ip_hash TEXT,
    metadata_json TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (shop_domain)
        REFERENCES shop_installations(shop_domain)
        ON DELETE RESTRICT
);

INSERT INTO activity_logs_new (
    id,
    tenant_id,
    shop_domain,
    order_id,
    order_number,
    return_id,
    return_number,
    category,
    action,
    status,
    message,
    error_code,
    http_status,
    source,
    correlation_id,
    ip_hash,
    metadata_json,
    created_at
)
SELECT
    id,
    tenant_id,
    shop_domain,
    order_id,
    order_number,
    return_id,
    return_number,
    category,
    action,
    status,
    message,
    error_code,
    http_status,
    source,
    correlation_id,
    ip_hash,
    metadata_json,
    created_at
FROM activity_logs;

DROP TABLE activity_logs;

ALTER TABLE activity_logs_new RENAME TO activity_logs;

COMMIT;

PRAGMA foreign_keys = ON;