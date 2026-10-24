export const inputCls = "h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-ink";
export const btnPrimary = "h-11 rounded-xl bg-ink px-5 font-medium text-white disabled:opacity-40";
export const btnSecondary = "h-11 rounded-xl bg-chip px-5 disabled:opacity-40";
export const card = "rounded-2xl bg-white p-4";

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}
