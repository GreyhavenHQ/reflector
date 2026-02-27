/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    IS_CI: process.env.IS_CI,
  },
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
};

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: "monadical",
  project: "reflector-www",
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
