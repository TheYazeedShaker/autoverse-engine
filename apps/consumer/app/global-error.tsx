"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Root error boundary: reports React render errors to Sentry and shows a minimal fallback.
// It renders its own <html>/<body> because it replaces the root layout when the layout itself errors,
// so it deliberately avoids design tokens (the app's CSS may not have loaded).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* The app CSS (and so every token) may not have loaded when this renders. */}
        {/* eslint-disable-next-line no-restricted-syntax -- tokens unavailable in the root error boundary */}
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <p>Something went wrong. Please try again.</p>
        </main>
      </body>
    </html>
  );
}
