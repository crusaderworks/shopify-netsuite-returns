-- Migration to remove CHECK constraint from requested_resolution in returns table
PRAGMA defer_foreign_keys = ON;

CREATE TABLE returns_new (
    id TEXT PRIMARY KEY,
    return_number TEXT NOT NULL UNIQUE,

    tenant_id TEXT NOT NULL,
    shop_domain TEXT NOT NULL,

    source TEXT NOT NULL
        CHECK (source IN ('website', 'assisted')),

    shopify_order_id TEXT,
    order_number TEXT,

    customer_id TEXT,
    invoice_number TEXT,

    customer_email_hash TEXT,
    customer_email_masked TEXT,
    customer_email_enc TEXT,

    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN (
            'submitted',
            'under_review',
            'approved',
            'rejected',
            'awaiting_shipment',
            'in_transit',
            'received',
            'refunded',
            'cancelled',
            'closed'
        )),

    reason TEXT,
    requested_resolution TEXT, -- CHECK constraint removed completely
    condition_json TEXT,
    attachments_json TEXT,
    customer_note TEXT,
    items_json TEXT,
    status_token_hash TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (shop_domain)
        REFERENCES shop_installations(shop_domain)
        ON DELETE RESTRICT,

    UNIQUE (id, tenant_id, shop_domain)
);

INSERT INTO returns_new (
    id, return_number, tenant_id, shop_domain, source,
    shopify_order_id, order_number, customer_id, invoice_number,
    customer_email_hash, customer_email_masked, customer_email_enc,
    status, reason, requested_resolution, condition_json, attachments_json,
    customer_note, items_json, status_token_hash, created_at, updated_at
)
SELECT
    id, return_number, tenant_id, shop_domain, source,
    shopify_order_id, order_number, customer_id, invoice_number,
    customer_email_hash, customer_email_masked, customer_email_enc,
    status, reason, requested_resolution, condition_json, attachments_json,
    customer_note, items_json, status_token_hash, created_at, updated_at
FROM returns;

DROP TABLE returns;

ALTER TABLE returns_new RENAME TO returns;

CREATE INDEX idx_returns_tenant_shop_status
    ON returns (tenant_id, shop_domain, status, created_at);

CREATE INDEX idx_returns_shop_number
    ON returns (shop_domain, return_number);

CREATE INDEX idx_returns_shop_order
    ON returns (shop_domain, shopify_order_id);

CREATE INDEX idx_returns_customer_email
    ON returns (shop_domain, customer_email_hash);

CREATE INDEX idx_returns_status_token
    ON returns (status_token_hash);