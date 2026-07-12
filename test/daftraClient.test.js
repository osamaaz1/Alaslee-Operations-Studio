// Verifies the read-only Daftra adapter pagination, wrappers, and authorization headers.

import test from "node:test";
import assert from "node:assert/strict";

test("Daftra product reads follow API2 pagination without write requests", async () => {
  process.env.DAFTRA_SUBDOMAIN = "example-account";
  process.env.DAFTRA_API_KEY = "api-key-test";
  process.env.DAFTRA_ACCESS_TOKEN = "access-token-test";
  process.env.DAFTRA_PAGE_LIMIT = "2";
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify({
      data: [{ Product: { id: page, name: `Product ${page}` } }],
      pagination: { page_count: 2 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const { daftraConfigured, fetchDaftraProducts } = await import("../src/services/daftraClient.js");
    const { config } = await import("../src/config.js");
    const rows = await fetchDaftraProducts();
    assert.deepEqual(rows.map((row) => row.id), ["1", "2"]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.options.method === undefined));
    assert.ok(calls[0].url.includes("/api2/products.json"));
    assert.ok(calls[0].url.includes("load_custom_data=1"));
    assert.equal(calls[0].options.headers.apikey, "api-key-test");
    assert.equal(calls[0].options.headers.Authorization, "Bearer access-token-test");
    config.daftra.accessToken = "";
    assert.equal(daftraConfigured(), true);
    calls.length = 0;
    await fetchDaftraProducts();
    assert.equal(calls[0].options.headers.apikey, "api-key-test");
    assert.equal(calls[0].options.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
