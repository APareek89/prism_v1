/** @type {import('next').NextConfig} */
const nextConfig = {
  // Render-portable: standalone server output (no Vercel-specific APIs).
  output: 'standalone',
  // LangGraph/LangChain + Inngest run in-process on the server; keep them external
  // so they are not bundled/treeshaken incorrectly by the RSC compiler.
  serverExternalPackages: [
    '@langchain/langgraph',
    '@langchain/core',
    '@langchain/anthropic',
    'inngest',
    'pg',
  ],
  // Workspace packages ship as TypeScript source; Next transpiles them.
  transpilePackages: ['@prism/engine', '@prism/contract'],
  reactStrictMode: true,
};

export default nextConfig;
