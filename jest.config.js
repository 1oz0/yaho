/**
 * 테스트 범위는 순수 함수 단위 테스트로 제한한다 (프롬프트 §9).
 * 해커톤이므로 E2E 는 만들지 않는다.
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: [
    '**/*calculator.ts',
    '**/classification/*.ts',
    'common/utils/*.ts',
    '**/blur-policy.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  clearMocks: true,
};
