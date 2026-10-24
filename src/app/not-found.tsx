import Link from "next/link";
import { primaryButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Страница не найдена</h1>
      <p className="text-muted">Возможно, ссылка устарела или запись уже удалена.</p>
      <Link href="/" className={primaryButton}>
        На главную
      </Link>
    </main>
  );
}
