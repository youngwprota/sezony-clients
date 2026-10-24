import { redirect } from "next/navigation";
import { getSession, login } from "@/lib/auth";
import { primaryButton } from "@/components/ui";

export const dynamic = "force-dynamic";

function target(role: string, next?: string) {
  if (next?.startsWith("/admin") && role !== "MASTER") return next;
  if (next?.startsWith("/master")) return next;
  return role === "MASTER" ? "/master" : "/admin";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const session = await getSession();
  if (session && !error) redirect(target(session.role, next));

  async function submit(form: FormData) {
    "use server";
    const s = await login(String(form.get("login") ?? ""), String(form.get("password") ?? ""));
    const nextPath = String(form.get("next") ?? "");
    if (!s) redirect(`/login?error=1${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""}`);
    redirect(target(s.role, nextPath));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center px-4">
      <h1 className="text-[26px] font-bold">Вход для сотрудников</h1>
      <p className="mt-1 mb-6 text-muted">Sезоны</p>
      <form action={submit} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <input name="login" placeholder="Логин" autoComplete="username" autoCapitalize="none" required className="h-12 rounded-xl border border-line px-3 outline-none focus:border-ink" />
        <input name="password" type="password" placeholder="Пароль" autoComplete="current-password" required className="h-12 rounded-xl border border-line px-3 outline-none focus:border-ink" />
        {error && <p className="text-danger">Неверный логин или пароль</p>}
        <button className={`${primaryButton} mt-2`}>Войти</button>
      </form>
    </main>
  );
}
