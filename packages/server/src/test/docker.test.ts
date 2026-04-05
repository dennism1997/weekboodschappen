import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {GenericContainer, type StartedTestContainer, Wait} from "testcontainers";
import {execSync} from "node:child_process";
import {join} from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "../../../..");
const IMAGE_NAME = "weekboodschappen:test";

// Build once for all suites
beforeAll(async () => {
  console.log("[docker-test] Building image...");
  execSync(`docker build -t ${IMAGE_NAME} ${PROJECT_ROOT}`, { stdio: "inherit" });
}, 300_000);

function startContainer() {
  return new GenericContainer(IMAGE_NAME)
    .withExposedPorts(6883)
    .withEnvironment({ BETTER_AUTH_SECRET: "ci-test-secret" })
    .withWaitStrategy(Wait.forHttp("/api/health", 6883).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();
}

describe("Docker: API and migrations", () => {
  let container: StartedTestContainer;
  let baseUrl: string;

  beforeAll(async () => {
    container = await startContainer();
    baseUrl = `http://localhost:${container.getMappedPort(6883)}`;
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("health endpoint returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("creates all expected database tables", async () => {
    const result = await container.exec(
      [
        "node", "--input-type=module", "-e",
        `import Database from 'better-sqlite3';
         const db = new Database('/data/weekboodschappen.db');
         const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all();
         process.stdout.write(JSON.stringify(tables.map(t => t.name)));`,
      ],
      { workingDir: "/app/packages/server" },
    );
    const match = result.output.match(/\[.*\]/);
    expect(match, `Expected JSON array, got: ${result.output}`).toBeTruthy();

    const tables = JSON.parse(match![0]);
    for (const name of [
      "account", "cached_suggestion", "favorite_website", "grocery_item",
      "grocery_list", "invitation", "member", "organization", "passkey",
      "product_discount", "recipe", "recovery_token", "session",
      "shopping_history", "store_config", "user", "verification",
      "weekly_plan", "weekly_plan_recipe", "weekly_staple",
    ]) {
      expect(tables, `Missing table: ${name}`).toContain(name);
    }
  });

  it("config endpoint returns posthog fields", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
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
    const statusRes = await fetch(`${baseUrl}/api/setup/status`);
    expect((await statusRes.json()).needsSetup).toBe(true);

    const registerRes = await fetch(`${baseUrl}/api/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CI User", householdName: "CI Household", password: "testpassword123" }),
    });
    expect((await registerRes.json()).success).toBe(true);

    const statusRes2 = await fetch(`${baseUrl}/api/setup/status`);
    expect((await statusRes2.json()).needsSetup).toBe(false);
  });

  it("Playwright Chromium works inside container", async () => {
    const result = await container.exec(
      [
        "node", "--input-type=module", "-e",
        `import { chromium } from 'playwright';
         const browser = await chromium.launch({ channel: 'chromium' });
         const page = await browser.newPage();
         await page.goto('http://localhost:6883/api/health');
         const text = await page.textContent('body');
         await browser.close();
         process.stdout.write(text || '');`,
      ],
      { workingDir: "/app/packages/server", user: "node" },
    );
    expect(result.exitCode, `Playwright failed: ${result.output}`).toBe(0);
    expect(result.output).toContain("ok");
  }, 60_000);
});

describe("Docker: restart resilience", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await startContainer();
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("survives restart (migrations are idempotent)", async () => {
    await container.restart({ timeout: 30 });

    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const result = await container.exec([
          "node", "-e",
          "fetch('http://localhost:6883/api/health').then(r=>{if(r.ok){process.stdout.write('ok');process.exit(0)}else{process.exit(1)}}).catch(()=>process.exit(1))",
        ]);
        if (result.exitCode === 0 && result.output.includes("ok")) {
          healthy = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(healthy, "Container should be healthy after restart").toBe(true);
  }, 120_000);
});
