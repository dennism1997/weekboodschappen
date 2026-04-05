import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {GenericContainer, type StartedTestContainer, Wait} from "testcontainers";
import {join} from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "../../../..");

describe("Docker image", () => {
  let container: StartedTestContainer;
  let baseUrl: string;

  beforeAll(async () => {
    const image = await GenericContainer.fromDockerfile(PROJECT_ROOT)
      .build("weekboodschappen:testcontainer", { deleteOnExit: true });

    container = await image
      .withExposedPorts(6883)
      .withEnvironment({ BETTER_AUTH_SECRET: "ci-test-secret" })
      .withWaitStrategy(Wait.forHttp("/api/health", 6883).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start();

    const port = container.getMappedPort(6883);
    baseUrl = `http://localhost:${port}`;
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("health endpoint returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("creates all expected database tables", async () => {
    const result = await container.exec([
      "node", "--input-type=module", "-e",
      `import Database from 'better-sqlite3';
       const db = new Database('/data/weekboodschappen.db');
       const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all();
       console.log(JSON.stringify(tables.map(t => t.name)));`,
    ]);

    const tables = JSON.parse(result.output.trim());
    const expected = [
      "account", "cached_suggestion", "favorite_website", "grocery_item",
      "grocery_list", "invitation", "member", "organization", "passkey",
      "product_discount", "recipe", "recovery_token", "session",
      "shopping_history", "store_config", "user", "verification",
      "weekly_plan", "weekly_plan_recipe", "weekly_staple",
    ];
    for (const table of expected) {
      expect(tables, `Missing table: ${table}`).toContain(table);
    }
  });

  it("config endpoint returns posthog fields", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("posthogToken");
    expect(body).toHaveProperty("posthogHost");
  });

  it("unauthenticated requests return 401", async () => {
    for (const path of ["/api/recipes", "/api/lists/current", "/api/plans"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, `${path} should return 401`).toBe(401);
    }
  });

  it("setup flow works on fresh database", async () => {
    // Should need setup
    const statusRes = await fetch(`${baseUrl}/api/setup/status`);
    const status = await statusRes.json();
    expect(status.needsSetup).toBe(true);

    // Register first user
    const registerRes = await fetch(`${baseUrl}/api/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CI User", householdName: "CI Household", password: "testpassword123" }),
    });
    expect(registerRes.ok).toBe(true);
    const registerBody = await registerRes.json();
    expect(registerBody.success).toBe(true);

    // Should no longer need setup
    const statusRes2 = await fetch(`${baseUrl}/api/setup/status`);
    const status2 = await statusRes2.json();
    expect(status2.needsSetup).toBe(false);
  });

  it("Playwright Chromium works inside container", async () => {
    const result = await container.exec([
      "node", "--input-type=module", "-e",
      `import { chromium } from 'playwright';
       const browser = await chromium.launch({ channel: 'chromium' });
       const page = await browser.newPage();
       await page.goto('http://localhost:6883/api/health');
       const text = await page.textContent('body');
       await browser.close();
       console.log(text);`,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("ok");
  }, 30_000);

  it("survives restart (migrations are idempotent)", async () => {
    await container.restart();

    // Wait for it to be healthy again
    let healthy = false;
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.ok) { healthy = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(healthy, "Container should be healthy after restart").toBe(true);
  }, 60_000);
});
