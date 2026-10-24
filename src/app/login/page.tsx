import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginTarget } from "./actions";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session) redirect(await loginTarget(session.role, next));

  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center px-4">
      <h1 className="text-[26px] font-bold">Вход для сотрудников</h1>
      <p className="mt-1 mb-6 text-muted">Sезоны</p>
      <LoginForm next={next ?? ""} />
    </main>
  );
}
