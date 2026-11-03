import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MASTER_KEY_HEX } from "../sign.mjs";
import { createStateStore } from "../state.mjs";
import {
  DIAGNOSTICS_TOKEN_HEADER,
  diagnosticsPort,
  diagnosticsSnapshot,
  hostAllowed,
  originAllowed,
  runSelfCheck,
  startDiagnosticsService,
} from "../diagnostics.mjs";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function rawRequest(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path, method, headers },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, text }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("diagnostics port, Host and Origin rules are loopback-only", () => {
  assert.equal(diagnosticsPort(3478), 3478);
  assert.equal(diagnosticsPort("4567"), 4567);
  assert.equal(diagnosticsPort(80), 3478);
  assert.equal(diagnosticsPort("bad"), 3478);
  assert.equal(hostAllowed("127.0.0.1:3478", 3478), true);
  assert.equal(hostAllowed("localhost:3478", 3478), true);
  assert.equal(hostAllowed("127.0.0.1:3479", 3478), false);
  assert.equal(hostAllowed("evil.example:3478", 3478), false);
  assert.equal(originAllowed(undefined, 3478), true);
  assert.equal(originAllowed(undefined, 3478, { required: true }), false);
  assert.equal(originAllowed("null", 3478, { required: true }), true);
  assert.equal(originAllowed("http://127.0.0.1:3478", 3478, { required: true }), true);
  assert.equal(originAllowed("https://127.0.0.1:3478", 3478, { required: true }), false);
});

test("offline self-check exercises signing without network access", () => {
  const ok = runSelfCheck({ clientVersion: "5.2.3", masterKeyHex: MASTER_KEY_HEX });
  assert.equal(ok.ok, true);
  assert.equal(ok.checks.signature, true);
  assert.equal(ok.checks.version, true);
  assert.equal(ok.checks.configuration, true);

  const failed = runSelfCheck({ clientVersion: "", masterKeyHex: "bad" });
  assert.equal(failed.ok, false);
  assert.equal(failed.checks.version, false);
  assert.equal(failed.checks.configuration, false);
});

test("snapshot exposes only redacted persisted account data", async () => {
  const snapshot = await diagnosticsSnapshot({
    state: {
      version: 1,
      accounts: {
        abcdef0123456789: {
          digest: "abcdef0123456789",
          loginSource: "atomcode-cli",
          models: [{ id: "model-a" }, { id: "model-b" }],
          modelSource: "live",
          modelUpdatedAt: new Date(1000).toISOString(),
          quota: {
            plan: "Plan",
            windows: [{ name: "5h", used: 10, unit: "calls" }],
          },
          quotaUpdatedAt: new Date(2000).toISOString(),
          lastError: { category: "network", message: "masked" },
        },
      },
    },
    version: { version: "5.2.3", source: "manifest" },
    config: { locale: "en", diagnosticsPort: 3478 },
  });
  assert.equal(snapshot.account.digest, "abcdef0123456789");
  assert.equal(snapshot.models.count, 2);
  assert.equal(snapshot.quota.stale, true);
  assert.equal(snapshot.config.readOnly, true);
  assert.doesNotMatch(JSON.stringify(snapshot), /access|refresh|email/i);
});

test("loopback service serves a read-only page and token-gated APIs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atomcode-diagnostics-"));
  const stateStore = createStateStore({ directory });
  await stateStore.recordLogin("42", "atomcode-cli");
  await stateStore.recordQuota("42", {
    plan: "CodingPlan Lite",
    windows: [{ name: "5h", used: 12, unit: "calls" }],
  });

  const port = await freePort();
  const versionSource = { status: () => ({ version: "5.2.3", source: "manifest" }) };
  const service = startDiagnosticsService({
    port,
    stateStore,
    versionSource,
    locale: "en",
    config: { locale: "en", diagnosticsPort: port, autoClaim: true, autoVersion: false },
    selfCheckConfig: { clientVersion: "5.2.3", masterKeyHex: MASTER_KEY_HEX },
  });
  try {
    assert.equal(await service.ready, service);
    assert.equal(startDiagnosticsService({ port }), service);

    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const html = await page.text();
    assert.match(html, /name="atomcode-token" content="[a-f0-9]{64}"/);
    assert.match(html, /Read-only/);
    assert.doesNotMatch(html, /person@example\.com|Bearer/);

    const css = await fetch(`http://127.0.0.1:${port}/app.css`);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /--accent/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/icon.svg`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status, 404);

    assert.equal((await fetch(`http://127.0.0.1:${port}/api/state`)).status, 403);
    const state = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { [DIAGNOSTICS_TOKEN_HEADER]: service.token },
    });
    assert.equal(state.status, 200);
    const snapshot = await state.json();
    assert.equal(snapshot.account.loginSource, "atomcode-cli");
    assert.equal(snapshot.quota.plan, "CodingPlan Lite");
    assert.equal(snapshot.config.autoVersion, false);

    const wrongOrigin = await fetch(`http://127.0.0.1:${port}/api/self-check`, {
      method: "POST",
      headers: {
        [DIAGNOSTICS_TOKEN_HEADER]: service.token,
        origin: "http://evil.example",
      },
    });
    assert.equal(wrongOrigin.status, 403);

    const checked = await fetch(`http://127.0.0.1:${port}/api/self-check`, {
      method: "POST",
      headers: {
        [DIAGNOSTICS_TOKEN_HEADER]: service.token,
        origin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(checked.status, 200);
    assert.equal((await checked.json()).ok, true);

    const withBody = await fetch(`http://127.0.0.1:${port}/api/self-check`, {
      method: "POST",
      body: "{}",
      headers: {
        [DIAGNOSTICS_TOKEN_HEADER]: service.token,
        origin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(withBody.status, 400);

    const forbiddenHost = await rawRequest(port, "/", {
      headers: { host: `evil.example:${port}` },
    });
    assert.equal(forbiddenHost.status, 403);
  } finally {
    await service.stop();
  }
});

test("a foreign listener fails with an actionable port-conflict error", async () => {
  const port = await freePort();
  const blocker = createServer((_req, res) => res.end("blocked"));
  await new Promise((resolve) => blocker.listen(port, "127.0.0.1", resolve));
  const service = startDiagnosticsService({ port });
  try {
    await assert.rejects(
      service.ready,
      (error) =>
        error.code === "EADDRINUSE" &&
        new RegExp(`127\\.0\\.0\\.1:${port}`).test(error.message),
    );
  } finally {
    await service.stop();
    await new Promise((resolve) => blocker.close(resolve));
  }
});
