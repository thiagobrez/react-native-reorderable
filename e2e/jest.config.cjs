/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  testMatch: ['<rootDir>/e2e/contracts/**/*.e2e.cjs'],
  reporters: ['detox/runners/jest/reporter'],
  verbose: true,
};
