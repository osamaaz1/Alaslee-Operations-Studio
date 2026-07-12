-- Rolls back protected manual sales and Daftra snapshots.
DROP TABLE IF EXISTS crm_sale_corrections;
DROP TABLE IF EXISTS crm_sale_items;
DROP TABLE IF EXISTS crm_sales;
DROP TABLE IF EXISTS daftra_sync_runs;
DROP TABLE IF EXISTS daftra_stock_levels;
DROP TABLE IF EXISTS daftra_stock_transactions;
DROP TABLE IF EXISTS daftra_stores;
DROP TABLE IF EXISTS daftra_products;
