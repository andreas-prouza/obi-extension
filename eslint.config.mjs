import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config'; // <-- 1. Import the native ESLint wrapper

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended, // <-- 2. Notice there is NO spread (...) operator here anymore
  {
    ignores: ["out/**", "out-test/**", "dist/**", "node_modules/**", "esbuild.js"],
  },
  {
    // Rules with existing violations are warnings. `npm run lint:ci` fails as soon as there are more
    // warnings than the baseline in package.json: lower that number whenever warnings are fixed, and switch
    // a rule back to "error" (remove it here) once it has no violations left.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': 'warn',
      'no-var': 'warn',
      'no-prototype-builtins': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'preserve-caught-error': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  }
);
