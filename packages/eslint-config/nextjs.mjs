import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { createBaseConfig } from './base.mjs';

export function createNextConfig(options = {}) {
  return [
    ...createBaseConfig(options),
    {
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
        },
      },
      plugins: {
        'jsx-a11y': jsxA11y,
        'react-hooks': reactHooks,
      },
      rules: {
        ...jsxA11y.configs.recommended.rules,
        ...reactHooks.configs.recommended.rules,
        'jsx-a11y/label-has-associated-control': [
          'error',
          {
            labelComponents: ['Label'],
            assert: 'either',
          },
        ],
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
  ];
}

export default createNextConfig();
