import type { NextConfig } from "next";

// Fully static: every page is rendered at build time from the JSON in data/.
// No server, no database, nothing to cold-start.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
