import type { NextConfig } from 'next';

const isStandalone = process.env.NEXT_OUTPUT_STANDALONE === 'true';
const isStaticExport = process.env.NEXT_OUTPUT_EXPORT === 'true';
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim().replace(/\/+$/, '');
const basePath =
  rawBasePath && rawBasePath !== '/'
    ? rawBasePath.startsWith('/')
      ? rawBasePath
      : `/${rawBasePath}`
    : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: 'export' as const,
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath } : {}),
      }
    : isStandalone
      ? { output: 'standalone' as const }
      : {}),
  transpilePackages: [
    '@civora/ui',
    '@civora/ui-spatial',
    '@civora/types',
    '@civora/config',
    '@civora/sdk',
  ],
};

export default nextConfig;
