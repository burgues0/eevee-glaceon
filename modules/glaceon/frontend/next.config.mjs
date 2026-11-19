// Plain JS, not .ts: next.config.ts needs `typescript` resolvable at runtime
// to transpile, and the production image's node_modules has devDependencies
// (including typescript) stripped — Next then tries to self-install it and
// fails as the non-root container user.
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.GLACEON_BACKEND_URL ?? "http://localhost:3020"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
