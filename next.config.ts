import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push", "read-excel-file"],
  // импорт базы клиентов из Excel
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
