import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export function createBaseConfig({ ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', ...ignores],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: {
          ...globals.node,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-ignore': true,
            'ts-nocheck': true,
            'ts-expect-error': 'allow-with-description',
          },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
  );
}

export default createBaseConfig();

