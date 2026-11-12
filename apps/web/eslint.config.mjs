import { createNextConfig } from '@civora/eslint-config/nextjs';

export default createNextConfig({
  ignores: ['next-env.d.ts', 'tests/e2e/**'],
});

