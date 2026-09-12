"use client";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * This file replaces the document when it renders, so it cannot rely on the
 * global stylesheet or the design tokens. Styles are inlined and kept to the
 * brand minimum. No error detail is shown to the user.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#faf9fb",
          color: "#1c1a21",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#73409a",
            }}
          >
            Purple Rose
          </p>
          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "1.5rem",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            The page could not be loaded
          </h1>
          <p style={{ margin: "0.75rem 0 0", lineHeight: 1.6, color: "#5f5a66" }}>
            Please try again. If it keeps happening, come back shortly.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: "1.75rem",
              padding: "0.7rem 1.4rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#73409a",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
