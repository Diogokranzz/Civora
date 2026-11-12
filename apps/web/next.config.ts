import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.NEXT_OUTPUT_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),
  transpilePackages: ['@civora/ui', '@civora/ui-spatial', '@civora/types', '@civora/config', '@civora/sdk'],
};

export default nextConfig;
