import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  {
    ignores: ['node_modules/**', 'backup/**', '.packmate/**', 'coverage/**'],
  },
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
      // 현재 저장소는 실험/진단 코드가 많아 점진 정리에 맞춘다.
      'no-unused-vars': 'warn',
      // ▶️ var 사용 금지 (권장)
      'no-var': 'error',
      // ▶️ 등등 자주 쓰는 규칙 추가 가능
    },
  },
]);
