import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import tseslint from 'typescript-eslint'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

const config = [
  includeIgnoreFile(gitignorePath),
  {
    ignores: ['coverage/', 'dist/'],
  },
  ...oclif,
  // Disable type-checked (type-aware) rules for test files. tsconfig.json
  // excludes test/, so those files have no type information to lint against,
  // and mocks/fixtures shouldn't fail type-aware rules such as no-unsafe-*.
  {
    files: ['test/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  // eslint.config.mjs imports typescript-eslint, which is a transitive
  // dependency (via eslint-config-oclif) rather than a direct one — relax the
  // extraneous-dependency checks for this file only.
  {
    files: ['eslint.config.mjs'],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
      'n/no-extraneous-import': 'off',
    },
  },
  // Relax overly-strict rules from eslint-config-oclif@7 across the project.
  {
    files: ['src/**/*.ts'],
    rules: {
      // flexsearch ships no types, so its Index results are necessarily `any`.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // The regexp `v` flag requires an es2024 target; this project is es2022.
      'require-unicode-regexp': 'off',
      // oclif commands declare `static args`/`flags` before `run()`.
      'unicorn/consistent-class-member-order': 'off',
    },
  },
  // Test files are transpiled by ts-node at the same es2022 target, and lean on
  // type assertions to build partial oclif Config/Command mocks.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      'require-unicode-regexp': 'off',
    },
  },
  prettier,
]

export default config
