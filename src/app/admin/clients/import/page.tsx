import Link from "next/link";
import { card } from "@/components/form";
import { ImportForm } from "./import-form";

export default function ImportPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/admin/clients" className="text-muted">← Клиенты</Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold">Импорт клиентов</h1>
      <section className={`${card} flex flex-col gap-3 text-sm`}>
        <p>Загрузите таблицу Excel (.xlsx) или CSV. Подойдёт выгрузка из YCLIENTS: «Клиенты» → «Экспорт в Excel».</p>
        <p className="text-muted">
          Нужна колонка «Телефон»; также читаются «Имя», «Фамилия», «Email», «Дата рождения», «Комментарий». Клиенты с уже
          известным номером не дублируются: у них заполняются только пустые поля, имя и заметки не перезаписываются.
        </p>
        <ImportForm />
      </section>
    </div>
  );
}
