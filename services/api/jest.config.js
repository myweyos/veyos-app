/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.spec.json" }],
  },
  testEnvironment: "node",
  moduleNameMapper: {
    "^@weyos/shared-schema$":
      "<rootDir>/../../packages/shared-schema/src/index.ts",
  },
};
