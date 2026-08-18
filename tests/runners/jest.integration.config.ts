import type { Config } from 'jest';

const config: Config = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
    ],
  },
  maxWorkers: 1,
};

export default config;
