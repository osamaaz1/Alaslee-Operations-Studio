import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("production configuration accepts dynamic LAN URLs and rejects mismatched PostgreSQL ports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-config-test-"));
  try {
    const valid = path.join(root, "valid.env");
    await fs.writeFile(valid, environment("55432"));
    assert.equal(runReport(valid).ok, true);

    const invalid = path.join(root, "invalid.env");
    await fs.writeFile(invalid, environment("5433"));
    const invalidReport = runReport(invalid);
    assert.equal(invalidReport.ok, false);
    assert.ok(invalidReport.errors.some((message) => message.includes("CRM_POSTGRES_PORT")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function environment(port) {
  return `NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=
AI_PROVIDER=gpt
OPENAI_API_KEY=test-only
CRM_POSTGRES_PORT=${port}
CRM_DATABASE_URL=postgresql://app:test@127.0.0.1:55432/test
CRM_DATA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CRM_STAFF_PIN=2468
CRM_SUPERUSER_PIN=8642
CRM_LOGIN_RATE_LIMIT_DISABLED=false
CRM_SECURE_COOKIE=false
`;
}

function runReport(environmentFile) {
  const script = "import('./src/configValidation.js').then(({runtimeConfigReport})=>console.log(JSON.stringify(runtimeConfigReport())))";
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("CRM_") && !name.startsWith("SUPABASE_") && !name.startsWith("OPENAI_") && !name.startsWith("GEMINI_") && !new Set(["NODE_ENV", "PORT", "PUBLIC_BASE_URL", "AI_PROVIDER"]).has(name)));
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8", env: { ...inherited, ENV_FILE: environmentFile },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}
