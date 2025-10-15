import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // 🔒 빈 블록문 금지
      'no-empty': 'off',
      // ▶️ console.log 허용 (원하면 off)
      'no-console': 'off',
      // ▶️ var 사용 금지 (권장)
      'no-var': 'error',
      // ▶️ 등등 자주 쓰는 규칙 추가 가능
    },
  },
]);
