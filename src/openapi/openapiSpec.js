// Provides a compact OpenAPI document for the local API surface.

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Optical Product Image Generator API",
    version: "2.0.0",
  },
  paths: {
    "/v1/auth/status": {
      get: { summary: "Get local CRM configuration status" },
    },
    "/v1/auth/pin": {
      post: { summary: "Create a protected staff or superuser CRM session" },
    },
    "/v1/auth/session": {
      get: { summary: "Inspect the active CRM session" },
    },
    "/v1/auth/logout": {
      post: { summary: "Destroy the active CRM session" },
    },
    "/v1/crm/customers": {
      get: { summary: "Search active CRM customers" },
      post: { summary: "Create an encrypted customer profile" },
    },
    "/v1/crm/customers/sources": {
      get: { summary: "List Arabic customer acquisition sources" },
    },
    "/v1/crm/customers/{id}": {
      get: { summary: "Read one customer and optical history with an audit event" },
      put: { summary: "Superuser: update an encrypted customer profile" },
      delete: { summary: "Superuser: soft-delete a customer profile" },
    },
    "/v1/crm/customers/{id}/restore": {
      post: { summary: "Superuser: restore a soft-deleted customer" },
    },
    "/v1/crm/customers/{id}/prescriptions": {
      post: { summary: "Add a consented encrypted optical prescription" },
    },
    "/v1/crm/customers/{id}/audit": {
      get: { summary: "Superuser: list customer audit events" },
    },
    "/v1/crm/sales": {
      get: { summary: "List manual and imported customer sales" },
      post: { summary: "Record a manual sale without decrementing Daftra stock" },
    },
    "/v1/crm/sales/{id}": {
      get: { summary: "Read a sale and its locked product snapshots" },
    },
    "/v1/crm/sales/{id}/corrections": {
      post: { summary: "Superuser: edit, void, delete, or restore a sale with audit history" },
    },
    "/v1/crm/sales/{id}/payments": {
      post: { summary: "Add an immutable payment to a tracked sale" },
    },
    "/v1/crm/sales/{id}/refunds": {
      post: { summary: "Superuser: record an immutable sale refund" },
    },
    "/v1/crm/sales/{id}/delivery": {
      put: { summary: "Update a sale delivery appointment and status" },
    },
    "/v1/crm/rfm/rules": {
      get: { summary: "Get explainable RFM classification rules" },
      put: { summary: "Superuser: update RFM thresholds and rescore customers" },
    },
    "/v1/crm/imports": {
      get: { summary: "Superuser: list historical import batches" },
    },
    "/v1/crm/imports/history": {
      post: { summary: "Superuser: import local customer and invoice exports idempotently" },
    },
    "/v1/crm/imports/candidates": {
      get: { summary: "Superuser: list unresolved historical records" },
    },
    "/v1/crm/imports/candidates/{id}/decision": {
      post: { summary: "Superuser: resolve, separate, or ignore a historical record" },
    },
    "/v1/daftra/products": {
      get: {
        summary: "Search the read-only Daftra product and stock snapshot",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Product name, code, SKU, or barcode" },
          { name: "availableOnly", in: "query", schema: { type: "boolean", default: false }, description: "Exclude tracked products whose stock is zero or below" },
        ],
      },
    },
    "/v1/daftra/sync/status": {
      get: { summary: "Get Daftra sync freshness and last run" },
    },
    "/v1/daftra/sync": {
      post: { summary: "Superuser: run a read-only Daftra synchronization" },
    },
    "/v1/accounts": {
      get: { summary: "Superuser: list store-account vault entries without secrets" },
      post: { summary: "Superuser: create an encrypted store-account vault entry" },
    },
    "/v1/accounts/{id}": {
      get: { summary: "Superuser: read account metadata without revealing the secret" },
      put: { summary: "Superuser: update an encrypted account vault entry" },
      delete: { summary: "Superuser: soft-delete an account vault entry" },
    },
    "/v1/accounts/{id}/reveal": {
      post: { summary: "Superuser: reveal one encrypted secret and write an audit event" },
    },
    "/v1/feedback/status": {
      get: { summary: "Get public Supabase feedback readiness without exposing credentials" },
    },
    "/v1/feedback": {
      post: { summary: "Submit a global Arabic feedback report and optional private screenshot to Supabase" },
    },
    "/v1/data/summary": {
      get: { summary: "Get OriginalEye data workspace KPIs, tables, and search results" },
    },
    "/v1/data/widget-catalog": {
      get: { summary: "Get supported Data workspace widget presets and controls" },
    },
    "/v1/data/widgets/preview": {
      post: { summary: "Preview one Data workspace widget configuration" },
    },
    "/v1/data/product-merge": {
      get: { summary: "List canonical product rows and invoice item source names for merge cleanup" },
      post: { summary: "Merge one product row into another by updating Invoice_items.csv with a backup" },
    },
    "/v1/data/dashboard-profiles": {
      get: { summary: "List Data workspace dashboard profiles" },
      post: { summary: "Create a Data workspace dashboard profile" },
    },
    "/v1/data/dashboard-profiles/{id}": {
      get: { summary: "Get and render one Data workspace dashboard profile" },
      put: { summary: "Update a Data workspace dashboard profile" },
    },
    "/v1/salla/status": {
      get: { summary: "Get local Salla integration readiness status" },
    },
    "/v1/products/upload": {
      post: { summary: "Upload a single product reference image set" },
    },
    "/v1/products/generate": {
      post: { summary: "Output 1: generate the four ecommerce product images only" },
    },
    "/v1/products/{id}/output-1/generate": {
      post: { summary: "Generate real AI Output 1 for one product" },
    },
    "/v1/products/{id}/output-1/mock": {
      post: { summary: "Create Free Test / Mock Output 1 without AI" },
    },
    "/v1/products/{id}/output-1": {
      get: { summary: "Get Output 1 metadata" },
    },
    "/v1/products/{id}/output-1/estimate": {
      get: { summary: "Estimate GPT Output 1 cost before paid generation" },
    },
    "/v1/products/{id}/output-2": {
      get: { summary: "Get Output 2 metadata" },
    },
    "/v1/products/{id}": {
      get: { summary: "Get product metadata" },
    },
    "/v1/products/{id}/instagram": {
      post: { summary: "Output 2: prepare selected Output 1 images for Instagram for one product" },
    },
    "/v1/instagram/uploads": {
      post: { summary: "Upload ready images as direct Output 1 sources for Instagram preparation" },
    },
    "/v1/instagram/generate": {
      post: { summary: "Output 2: prepare selected Output 1 images for Instagram across products" },
    },
    "/v1/instagram/estimate": {
      post: { summary: "Estimate Output 2 GPT price-label cost before generation" },
    },
    "/v1/branding/assets": {
      get: { summary: "Check background, logo, and footer access" },
      post: { summary: "Upload background, logo, and footer assets" },
    },
    "/v1/branding/settings": {
      get: { summary: "Get Instagram composition defaults" },
      put: { summary: "Save Instagram composition defaults" },
    },
    "/v1/branding/preview": {
      post: { summary: "Create a no-AI preview from a product image normalized without distortion" },
    },
    "/v1/branding/preview/output": {
      post: { summary: "Save a no-AI preview as a local Instagram test output for a product" },
    },
    "/v1/batches/import-folder": {
      post: { summary: "Import products from a local folder" },
    },
    "/v1/batches/{id}": {
      get: { summary: "Get batch metadata and products" },
    },
    "/v1/batches/{id}/generate": {
      post: { summary: "Output 1: generate ecommerce images for all products in a batch" },
    },
    "/v1/batches/{id}/output-1/mock": {
      post: { summary: "Create Free Test batch Output 1 without AI" },
    },
    "/v1/batches/{id}/output-1/estimate": {
      get: { summary: "Estimate GPT batch Output 1 cost before paid generation" },
    },
    "/v1/batches/{id}/instagram": {
      post: { summary: "Output 2: prepare selected Output 1 images for Instagram for a batch" },
    },
    "/v1/prompts": {
      get: { summary: "Get all AI prompts with metadata" },
      put: { summary: "Update one or more AI prompts" },
    },
    "/v1/prompts/reset": {
      post: { summary: "Reset all prompts to factory defaults" },
    },
  },
};
