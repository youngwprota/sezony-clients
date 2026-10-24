"use client";

import { useEffect } from "react";
import { primaryButton } from "@/components/ui";

/** Страница на случай непредвиденной ошибки: без технических подробностей, с повтором. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Что-то пошло не так</h1>
      <p className="text-muted">Попробуйте ещё раз. Если ошибка повторяется, позвоните в салон.</p>
      <button className={primaryButton} onClick={reset}>
        Попробовать снова
      </button>
    </main>
  );
}
