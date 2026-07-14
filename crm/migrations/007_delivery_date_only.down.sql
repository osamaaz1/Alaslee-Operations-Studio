ALTER TABLE crm_sales
  ALTER COLUMN scheduled_delivery_at TYPE timestamptz
  USING scheduled_delivery_at::timestamp AT TIME ZONE 'Asia/Riyadh';
