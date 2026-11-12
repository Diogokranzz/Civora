import { createBaseConfig } from './base.mjs';

export function createNestConfig(options = {}) {
  return [
    ...createBaseConfig(options),
    {
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
  ];
}

export default createNestConfig();

