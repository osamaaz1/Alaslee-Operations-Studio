-- Delivery appointments are calendar dates; staff do not choose or see a time.
ALTER TABLE crm_sales
  ALTER COLUMN scheduled_delivery_at TYPE date
  USING (scheduled_delivery_at AT TIME ZONE 'Asia/Riyadh')::date;
