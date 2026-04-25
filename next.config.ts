import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth"],
};

export default nextConfig;
