"use client";

import { useActionState } from "react";
import { primaryButton } from "@/components/ui";
import { loginAction } from "./actions";

const field = "h-12 rounded-xl border border-line px-3 outline-none focus:border-ink";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input name="login" placeholder="Логин" autoComplete="username" autoCapitalize="none" maxLength={40} required className={field} />
      <input name="password" type="password" placeholder="Пароль" autoComplete="current-password" maxLength={72} required className={field} />
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
      <button className={`${primaryButton} mt-2`} disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
