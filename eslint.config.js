import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/atabey/src/**/*.js',
      'packages/atabey/src/**/*.d.ts',
      'packages/atabey/src/**/*.js.map',
      'packages/atabey-mcp/src/**/*.js',
      'packages/atabey-mcp/src/**/*.d.ts',
      'packages/atabey-mcp/src/**/*.js.map',
      'eslint.config.js'
    ]
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/tests/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    }
  }
);
