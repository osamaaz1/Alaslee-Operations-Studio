// Serves searchable Daftra product and warehouse snapshots without live API calls.

import { withCrmTransaction } from "../infra/crm/postgres.js";

export async function listDaftraProducts(actor, query = "", options = {}) {
  return withCrmTransaction(actor, async (client) => {
    const text = String(query || "").trim().toLowerCase();
    const availableOnly = options.availableOnly === true;
    const result = await client.query(
      `SELECT p.external_id,p.product_code,p.sku,p.barcode,p.name,p.brand,p.category,
              p.unit_price,p.minimum_price,p.stock_balance,p.track_stock,p.status,p.synced_at,
              COALESCE(jsonb_agg(jsonb_build_object('storeId',s.external_id,'storeName',s.name,'quantity',l.quantity))
                FILTER (WHERE s.external_id IS NOT NULL),'[]'::jsonb) AS warehouses
       FROM daftra_products p LEFT JOIN daftra_stock_levels l ON l.product_id=p.external_id
       LEFT JOIN daftra_stores s ON s.external_id=l.store_id
       WHERE ($1='' OR lower(p.name) LIKE $2 OR lower(COALESCE(p.product_code,'')) LIKE $2 OR lower(COALESCE(p.sku,'')) LIKE $2 OR lower(COALESCE(p.barcode,'')) LIKE $2)
         AND ($3::boolean = false OR COALESCE(p.track_stock,false) = false OR COALESCE(p.stock_balance,0) > 0)
       GROUP BY p.external_id ORDER BY p.name LIMIT 200`,
      [text, `%${text}%`, availableOnly],
    );
    return result.rows;
  });
}
