import Link from "next/link";
import { card } from "@/components/form";
import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/clients" className="text-muted">← Клиенты</Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold">Новый клиент</h1>
      <section className={card}>
        <NewClientForm />
      </section>
    </div>
  );
}
