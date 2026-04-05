import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import posthog from "posthog-js";
import {PostHogErrorBoundary, PostHogProvider} from "@posthog/react";
import App from "./App.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

async function init() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    if (config.posthogToken) {
      posthog.init(config.posthogToken, {
        api_host: config.posthogHost || "https://eu.i.posthog.com",
        defaults: "2026-01-30",
      });
    }
  } catch {
    // PostHog is optional — app works without it
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <PostHogProvider client={posthog}>
        <PostHogErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </PostHogErrorBoundary>
      </PostHogProvider>
    </StrictMode>,
  );
}

init();
