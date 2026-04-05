import { PostHog } from "posthog-node";

const apiKey = process.env.POSTHOG_API_KEY;
if (!apiKey) {
  console.warn("[posthog] POSTHOG_API_KEY not set — analytics will be disabled");
}

export const posthog = new PostHog(apiKey || "phc_noop", {
  host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
  enableExceptionAutocapture: !!apiKey,
  flushAt: apiKey ? 20 : 1,
  flushInterval: apiKey ? 10000 : 0,
});

// Disable sending if no API key — calls become no-ops
if (!apiKey) {
  posthog.disable();
}

process.on("SIGINT", async () => {
  await posthog.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await posthog.shutdown();
  process.exit(0);
});
