import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.local/**',
      '**/coverage/**',
      '**/migrations/meta/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: [
      'apps/web/src/views/**/*.vue',
      'apps/web/src/components/classroom/**/*.vue',
      'apps/web/src/App.vue',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'confirm', message: 'Use the shared confirmation dialog.' },
        { object: 'window', property: 'alert', message: 'Use the shared message components.' },
        { object: 'window', property: 'prompt', message: 'Use a component form dialog.' },
      ],
      'vue/no-restricted-html-elements': [
        'error',
        'button',
        'input',
        'select',
        'option',
        'textarea',
        'details',
        'summary',
        'form',
      ],
    },
  },
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  prettier,
)
