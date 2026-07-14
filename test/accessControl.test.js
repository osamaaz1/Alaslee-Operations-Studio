import test from "node:test";
import assert from "node:assert/strict";
import { sameOriginWrites } from "../src/middleware/accessControl.js";

function checkOrigin(origin, host = "studio.example.com") {
  let forwardedError;
  sameOriginWrites(
    {
      method: "POST",
      get(name) {
        if (name === "origin") return origin;
        if (name === "host") return host;
        return undefined;
      },
    },
    {},
    (error) => {
      forwardedError = error;
    },
  );
  return forwardedError;
}

test("PIN login survives HTTPS termination at a reverse proxy", () => {
  assert.equal(checkOrigin("https://studio.example.com"), undefined);
});

test("CRM writes work when the browser origin matches the LAN server address", () => {
  assert.equal(checkOrigin("http://192.168.1.50:3000", "192.168.1.50:3000"), undefined);
  assert.equal(checkOrigin("http://10.0.0.25:3000", "10.0.0.25:3000"), undefined);
});

test("a different private-network origin is not implicitly trusted", () => {
  assert.equal(checkOrigin("http://192.168.1.51:3000", "192.168.1.50:3000")?.statusCode, 403);
});

test("foreign-origin writes remain rejected", () => {
  assert.equal(checkOrigin("https://attacker.example")?.statusCode, 403);
});
