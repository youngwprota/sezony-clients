import { vi } from "vitest";

/** Текущий «вошедший» сотрудник для серверных действий. */
export const auth = { session: { userId: 1, role: "OWNER" as "OWNER" | "ADMIN" | "MASTER", staffId: null as number | null, v: 0 } };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
}));

const cookieJar = new Map<string, string>();
export const headerJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => ({ get: (name: string) => headerJar.get(name.toLowerCase()) ?? null }),
}));
export { cookieJar };

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    requireAdmin: async () => {
      if (auth.session.role === "MASTER") throw new Error("NEXT_REDIRECT /login");
      return auth.session;
    },
    requireMaster: async () => {
      if (auth.session.staffId == null) throw new Error("NEXT_REDIRECT /login");
      return auth.session;
    },
  };
});
