"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/components/form";
import { importClientsAction, type ImportResult } from "../../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importClientsAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="file" name="file" accept=".xlsx,.csv,text/csv" required className="text-sm" />
      <button className={`${btnPrimary} self-start`} disabled={pending}>
        {pending ? "Загружаем…" : "Загрузить"}
      </button>
      {state && !state.ok && <p className="text-danger">{state.error}</p>}
      {state?.ok && (
        <p className="rounded-xl bg-green-50 p-3 text-green-900">
          Готово: новых клиентов — {state.created}, дополнено — {state.updated}, без изменений — {state.unchanged}
          {state.skipped ? `, пропущено строк без телефона или с неверным номером — ${state.skipped}` : ""}.
          {state.invalid.length > 0 && (
            <span className="mt-1 block text-sm">Номера, которые не удалось распознать: {state.invalid.join(", ")}</span>
          )}
        </p>
      )}
    </form>
  );
}
