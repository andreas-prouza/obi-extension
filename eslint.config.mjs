import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config'; // <-- 1. Import the native ESLint wrapper

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended, // <-- 2. Notice there is NO spread (...) operator here anymore
  {
    ignores: ["out/**", "dist/**", "node_modules/**", "esbuild.js"],
  }
);