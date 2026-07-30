// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/schema.sqlite.prisma'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { sourceType: 'module' },
      globals: { process: 'readonly', console: 'readonly', __dirname: 'readonly', require: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',

      /**
       * 가상 시계 강제 (docs/design.md §1-④).
       *
       * demo/fast-forward 로 시간을 점프시켜야 하므로, 현재 시각은 반드시
       * ClockService.now() 를 통해서만 얻는다. Date.now() / new Date() 를
       * 직접 부르면 그 코드 경로만 진짜 시각을 보게 되어 시연이 깨진다.
       *
       * 시드 데이터의 재현성을 위해 Math.random() 도 함께 막는다 (createPrng 사용).
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Date.now() 대신 ClockService.now() 를 사용하세요. (가상 시계 우회 금지)',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() 대신 ClockService.now() 를 사용하세요. (가상 시계 우회 금지)',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Math.random() 대신 createPrng(seed) 를 사용하세요. (시드 재현성 보장)',
        },
      ],
    },
  },
  {
    /**
     * 예외 구역.
     *  - clock.service.ts : 가상 시계 자체가 진짜 시각을 읽어야 한다
     *  - date-kst.ts      : Date.UTC 등 순수 변환 (인자로 받은 값만 다룸)
     *  - prng.ts          : 결정론적 난수 구현체
     *  - scripts, seed    : 빌드/시드 스크립트
     *  - *.spec.ts        : 테스트는 고정 시각을 직접 만든다
     */
    files: [
      'src/common/clock/clock.service.ts',
      'src/common/utils/date-kst.ts',
      'src/common/utils/prng.ts',
      'scripts/**/*.ts',
      'prisma/**/*.ts',
      '**/*.spec.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
