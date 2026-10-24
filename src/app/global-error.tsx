"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 16 }}>
          <h1>Что-то пошло не так</h1>
          <p>Попробуйте обновить страницу.</p>
          <button onClick={reset} style={{ padding: "12px 20px", borderRadius: 12, border: 0, background: "#141414", color: "#fff" }}>
            Попробовать снова
          </button>
        </main>
      </body>
    </html>
  );
}
