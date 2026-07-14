// Serves searchable Daftra product and warehouse snapshots without live API calls.

import { withCrmTransaction } from "../infra/crm/postgres.js";

const productListLimit = 5_000;

export async function listDaftraProducts(actor, query = "", options = {}) {
  return withCrmTransaction(actor, async (client) => {
    const text = String(query || "").trim().toLowerCase();
    const availableOnly = options.availableOnly === true;
    const requestedLimit = Number.parseInt(options.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(productListLimit, Math.max(1, requestedLimit)) : productListLimit;
    const result = await client.query(
      `SELECT p.external_id,p.product_code,p.sku,p.barcode,p.name,p.brand,p.category,
              p.unit_price,p.minimum_price,p.stock_balance,p.track_stock,p.status,p.synced_at,
              COALESCE(r.reserved_quantity,0)::numeric AS reserved_quantity,
              CASE WHEN COALESCE(p.track_stock,false)=false THEN p.stock_balance
                   ELSE GREATEST(COALESCE(p.stock_balance,0)-COALESCE(r.reserved_quantity,0),0) END::numeric AS available_quantity,
              COALESCE(jsonb_agg(jsonb_build_object('storeId',s.external_id,'storeName',s.name,'quantity',l.quantity))
                FILTER (WHERE s.external_id IS NOT NULL),'[]'::jsonb) AS warehouses
       FROM daftra_products p LEFT JOIN daftra_stock_levels l ON l.product_id=p.external_id
       LEFT JOIN daftra_stores s ON s.external_id=l.store_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(i.quantity),0) AS reserved_quantity
         FROM crm_sale_items i JOIN crm_sales sale ON sale.id=i.sale_id
         WHERE i.daftra_product_id=p.external_id AND sale.status='posted'
           AND sale.delivery_status IN ('pending','ready')
       ) r ON true
       WHERE ($1='' OR lower(p.name) LIKE $2 OR lower(COALESCE(p.product_code,'')) LIKE $2 OR lower(COALESCE(p.sku,'')) LIKE $2 OR lower(COALESCE(p.barcode,'')) LIKE $2)
         AND ($3::boolean = false OR COALESCE(p.track_stock,false) = false
           OR GREATEST(COALESCE(p.stock_balance,0)-COALESCE(r.reserved_quantity,0),0) > 0)
       GROUP BY p.external_id,r.reserved_quantity ORDER BY p.name LIMIT $4`,
      [text, `%${text}%`, availableOnly, limit],
    );
    return result.rows;
  });
}
