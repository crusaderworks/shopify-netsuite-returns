PRAGMA defer_foreign_keys = ON;

CREATE TABLE return_portal_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shop_domain TEXT NOT NULL,
    config_type TEXT NOT NULL 
        CHECK (config_type IN ('reason', 'resolution', 'condition_question')),
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (shop_domain)
        REFERENCES shop_installations(shop_domain)
        ON DELETE RESTRICT
);

CREATE INDEX idx_portal_config_shop_type 
    ON return_portal_config (shop_domain, config_type, is_active);

-- ====================================================================
-- SEED DEFAULT DATA FOR VIXEN SHIPPING PROTECTION SHOP
-- ====================================================================

-- 1. REASONS FOR RETURN
INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_reason_1', tenant_id, 'vixen-shipping-protection.myshopify.com', 'reason', 'Defective / Damaged', 'Defective / Damaged', 1, 1
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_reason_2', tenant_id, 'vixen-shipping-protection.myshopify.com', 'reason', 'Wrong Item Received', 'Wrong Item Received', 1, 2
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_reason_3', tenant_id, 'vixen-shipping-protection.myshopify.com', 'reason', 'Size Too Small / Large', 'Size Too Small / Large', 1, 3
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_reason_4', tenant_id, 'vixen-shipping-protection.myshopify.com', 'reason', 'Changed Mind', 'Changed Mind', 1, 4
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_reason_5', tenant_id, 'vixen-shipping-protection.myshopify.com', 'reason', 'Other', 'Other', 1, 5
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

-- 2. REQUESTED RESOLUTIONS
INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_res_1', tenant_id, 'vixen-shipping-protection.myshopify.com', 'resolution', 'Refund to Original Payment Method', 'Refund to Original Payment Method', 1, 1
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_res_2', tenant_id, 'vixen-shipping-protection.myshopify.com', 'resolution', 'Exchange for Replacement Item', 'Exchange for Replacement Item', 1, 2
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_res_3', tenant_id, 'vixen-shipping-protection.myshopify.com', 'resolution', 'Store Credit / Account Credit', 'Store Credit / Account Credit', 1, 3
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

-- 3. ITEM CONDITION QUESTIONS
INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_cond_1', tenant_id, 'vixen-shipping-protection.myshopify.com', 'condition_question', 'In original packaging?', 'inOriginalPackaging', 1, 1
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_cond_2', tenant_id, 'vixen-shipping-protection.myshopify.com', 'condition_question', 'Has item been used?', 'isUsed', 1, 2
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_cond_3', tenant_id, 'vixen-shipping-protection.myshopify.com', 'condition_question', 'All accessories included?', 'allAccessoriesIncluded', 1, 3
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';

INSERT INTO return_portal_config (id, tenant_id, shop_domain, config_type, label, value, is_active, sort_order)
SELECT 'cfg_cond_4', tenant_id, 'vixen-shipping-protection.myshopify.com', 'condition_question', 'Any visible damage?', 'hasVisibleDamage', 1, 4
FROM shop_installations WHERE shop_domain = 'vixen-shipping-protection.myshopify.com';