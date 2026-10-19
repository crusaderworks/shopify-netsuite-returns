
-- Delete only existing reason records
DELETE FROM return_portal_config
WHERE config_type = 'reason';

-- Seed default NetSuite return reasons for every installed shop
WITH reasons(label, value, sort_order) AS (
    VALUES
        ('Damaged or Missing Product', 'Damaged or Missing Product', 1),
        ('Customer Ordered Incorrect Item (Return for Credit)', 'Customer Ordered Incorrect Item (Return for Credit)', 2),
        ('Received Incorrect Product (Return for Credit)', 'Received Incorrect Product (Return for Credit)', 3),
        ('Warranty Repair (Defective Part)', 'Warranty Repair (Defective Part)', 4),
        ('Non-Warranty Repair', 'Non-Warranty Repair', 5),
        ('Duplicate Shipment', 'Duplicate Shipment', 6),
        ('Items Without Label', 'Items Without Label', 7),
        ('Wrong Customer', 'Wrong Customer', 8)
)
INSERT INTO return_portal_config (
    id,
    tenant_id,
    shop_domain,
    config_type,
    label,
    value,
    is_active,
    sort_order
)
SELECT
    'cfg_reason_' || lower(hex(randomblob(8))),
    si.tenant_id,
    si.shop_domain,
    'reason',
    r.label,
    r.value,
    1,
    r.sort_order
FROM shop_installations AS si
CROSS JOIN reasons AS r;
