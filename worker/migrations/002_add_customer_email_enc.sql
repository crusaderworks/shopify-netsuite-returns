-- =====================================================
-- MIGRATION 002: Add encrypted customer email column
-- Allows two-way decryption for admin detail view while 
-- keeping customer_email_hash for secure one-way lookups.
-- =====================================================

ALTER TABLE returns ADD COLUMN customer_email_enc TEXT;