module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  collectCoverageFrom: [
    'controllers/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!config/connect.js'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 40,
      functions: 50,
      lines: 55
    }
  }
};
