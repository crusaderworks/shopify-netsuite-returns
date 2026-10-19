
PRAGMA foreign_keys = ON;

-- =====================================================
-- 1. TENANTS
-- Future SaaS plans, billing and Super Admin support
-- =====================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    plan_code TEXT NOT NULL DEFAULT 'free',
    settings_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_status
ON tenants (status, created_at);


-- =====================================================
-- 2. SHOPIFY INSTALLATIONS
-- One record per Shopify store
-- Tokens must be encrypted by Worker code before storage
-- =====================================================

CREATE TABLE IF NOT EXISTS shop_installations (
    shop_domain TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,

    access_token_enc TEXT,
    refresh_token_enc TEXT,
    access_token_expires_at TEXT,
    refresh_token_expires_at TEXT,

    granted_scopes TEXT,

    installation_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (installation_status IN (
            'pending',
            'active',
            'uninstalled',
            'reauthorization_required',
            'error'
        )),

    installed_at TEXT,
    uninstalled_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_installations_tenant
ON shop_installations (tenant_id, installation_status);


-- =====================================================
-- 3. RETURNS
-- Merchant sees only returns belonging to current shop
-- =====================================================

CREATE TABLE IF NOT EXISTS returns (
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

    -- Initially one return per Shopify order
    UNIQUE (shop_domain, shopify_order_id),

    -- Supports tenant/shop consistency in related records
    UNIQUE (id, tenant_id, shop_domain)
);

CREATE INDEX IF NOT EXISTS idx_returns_tenant_shop_status
ON returns (tenant_id, shop_domain, status, created_at);

CREATE INDEX IF NOT EXISTS idx_returns_shop_number
ON returns (shop_domain, return_number);

CREATE INDEX IF NOT EXISTS idx_returns_shop_order
ON returns (shop_domain, shopify_order_id);

CREATE INDEX IF NOT EXISTS idx_returns_customer_email
ON returns (shop_domain, customer_email_hash);

CREATE INDEX IF NOT EXISTS idx_returns_status_token
ON returns (status_token_hash);


-- =====================================================
-- 4. RETURN STATUS HISTORY
-- Every lifecycle event belongs to the same tenant/shop
-- =====================================================

CREATE TABLE IF NOT EXISTS return_status_history (
    id TEXT PRIMARY KEY,

    return_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    shop_domain TEXT NOT NULL,

    event_type TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    message TEXT,

    actor_type TEXT NOT NULL DEFAULT 'system'
        CHECK (actor_type IN (
            'system',
            'customer',
            'admin',
            'netsuite',
            'shopify'
        )),

    actor_reference TEXT,
    metadata_json TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (return_id, tenant_id, shop_domain)
        REFERENCES returns(id, tenant_id, shop_domain)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_tenant_shop_timeline
ON return_status_history (tenant_id, shop_domain, created_at);

CREATE INDEX IF NOT EXISTS idx_history_return_timeline
ON return_status_history (return_id, created_at);

CREATE INDEX IF NOT EXISTS idx_history_event
ON return_status_history (event_type, created_at);


-- =====================================================
-- 5. ACTIVITY LOGS
-- Shared table, filtered securely per tenant/shop
-- =====================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,

    tenant_id TEXT,
    shop_domain TEXT NOT NULL,

    order_id TEXT,
    order_number TEXT,
    return_id TEXT,
    return_number TEXT,

    category TEXT NOT NULL
        CHECK (category IN (
            'order_verification',
            'return_request',
            'netsuite',
            'shopify_api',
            'admin_action',
            'system',
            'authentication'
        )),

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

CREATE INDEX IF NOT EXISTS idx_activity_tenant_shop_timeline
ON activity_logs (tenant_id, shop_domain, created_at);

CREATE INDEX IF NOT EXISTS idx_activity_order_timeline
ON activity_logs (shop_domain, order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_activity_return_timeline
ON activity_logs (shop_domain, return_id, created_at);

CREATE INDEX IF NOT EXISTS idx_activity_category_status
ON activity_logs (shop_domain, category, status, created_at);

CREATE INDEX IF NOT EXISTS idx_activity_correlation
ON activity_logs (shop_domain, correlation_id);


-- =====================================================
-- 6. SECURITY EVENTS
-- Rate limiting, authentication failures and abuse checks
-- =====================================================

CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,

    tenant_id TEXT,
    shop_domain TEXT NOT NULL,

    event_type TEXT NOT NULL,
    identifier_hash TEXT,
    ip_hash TEXT NOT NULL,

    outcome TEXT NOT NULL
        CHECK (outcome IN (
            'started',
            'success',
            'failed',
            'blocked'
        )),

    details_json TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (shop_domain)
        REFERENCES shop_installations(shop_domain)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_security_tenant_shop_timeline
ON security_events (tenant_id, shop_domain, created_at);

CREATE INDEX IF NOT EXISTS idx_security_ip_timeline
ON security_events (shop_domain, ip_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_security_identifier_timeline
ON security_events (shop_domain, identifier_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_security_event_type
ON security_events (shop_domain, event_type, created_at);


-- =====================================================
-- 7. TENANT SEQUENCES
-- Optional atomic numbering for tenant-specific records
-- =====================================================

CREATE TABLE IF NOT EXISTS tenant_sequences (
    tenant_id TEXT NOT NULL,
    sequence_name TEXT NOT NULL,
    last_value INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (tenant_id, sequence_name),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);
