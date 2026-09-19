import {expect} from 'chai'
import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = path.join(REPO_ROOT, 'bin', 'run.js')

export type CliResult = {
  code: number
  stderr: string
  stdout: string
}

/**
 * One entry of `search <query> --json` — the command's documented JSON contract.
 */
export type SearchResult = {
  args: Array<Record<string, {description: string; required: boolean; type: string}>>
  command: string
  commandId: string
  description: string
  flags: Array<Record<string, {description: string; required: boolean; type: string}>>
}

/**
 * Whether the suite is running its second leg, through the sdkck host CLI.
 *
 * Set by scripts/e2e.sh (and the CI workflow) after this build has been packed
 * and installed as the host's `@hesed/search` plugin. When false, runCli drives
 * the built standalone CLI instead.
 */
export function isSdkckLeg(): boolean {
  return process.env.E2E_HOST_CLI === 'sdkck'
}

/**
 * The plugins scripts/e2e.sh installed into the throwaway sdkck home, as a
 * sorted list of topic names (e.g. ['bb', 'jira']).
 *
 * Empty on the standalone leg, where no host plugins exist.
 */
export function selectedPlugins(): string[] {
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted needs lib es2023; this repo targets es2022
  return (process.env.E2E_SDKCK_PLUGINS ?? '').split(' ').filter(Boolean).sort()
}

/**
 * Builds the subprocess invocation for the configured host CLI.
 *
 * By default the built standalone CLI (`bin/run.js`) runs with
 * `SEARCH_CONFIG_DIR` (oclif scopes that env var by bin name). When
 * `E2E_HOST_CLI=sdkck`, the same arguments go to the `sdkck` binary instead —
 * this plugin's command ids (`search`, `synonyms …`) are host-agnostic, so the
 * argv needs no rewrite — and oclif's bin-scoped `SDKCK_*` dirs are
 * redirected: config to the same throwaway config dir the standalone leg uses
 * (that is where synonyms.json lives), data/cache into the throwaway sdkck
 * home (`E2E_SDKCK_HOME`) that the script installed the plugins into.
 *
 * @param args Command line arguments, e.g. ['search', 'synonyms'].
 * @param configDir The dir the CLI reads synonyms.json from, from
 *   createConfigDir().
 * @returns The executable, its argv, and env overrides to layer over
 *   process.env.
 */
function hostInvocation(
  args: string[],
  configDir: string,
): {argv: string[]; command: string; env: Record<string, string>} {
  if (isSdkckLeg()) {
    const home = process.env.E2E_SDKCK_HOME
    if (!home) {
      throw new Error('E2E_HOST_CLI=sdkck requires E2E_SDKCK_HOME — set by scripts/e2e.sh or the CI workflow')
    }

    return {
      argv: args,
      command: 'sdkck',
      env: {
        SDKCK_CACHE_DIR: path.join(home, 'cache'),
        SDKCK_CONFIG_DIR: configDir,
        SDKCK_DATA_DIR: path.join(home, 'data'),
      },
    }
  }

  return {argv: [CLI, ...args], command: process.execPath, env: {SEARCH_CONFIG_DIR: configDir}}
}

/**
 * Creates a throwaway oclif config dir for the suite to run against.
 *
 * The search plugin is fully local — it indexes the host's loaded commands and
 * stores synonyms in `<configDir>/synonyms.json` — so unlike the sandbox-backed
 * suites this needs no credentials and creates no external fixtures: the dir
 * starts empty and every byte in it is written by the CLI under test.
 *
 * @returns Absolute path to the config dir, to be passed to runCli().
 */
export async function createConfigDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'search-e2e-'))
}

/**
 * Removes a config dir written by createConfigDir().
 *
 * @param dir The directory to remove.
 */
export async function removeConfigDir(dir: string): Promise<void> {
  await fs.rm(dir, {force: true, recursive: true})
}

/**
 * Runs the host CLI as a real subprocess. The host is the built standalone CLI
 * unless `E2E_HOST_CLI=sdkck` (see hostInvocation()). Non-zero exits are
 * returned rather than thrown so tests can assert on failure paths.
 *
 * @param args Command line arguments, e.g. ['search', 'synonyms'].
 * @param configDir Value for SEARCH_CONFIG_DIR / SDKCK_CONFIG_DIR, from
 *   createConfigDir().
 * @returns The exit code and captured stdout/stderr.
 */
export async function runCli(args: string[], configDir: string): Promise<CliResult> {
  const {argv, command, env} = hostInvocation(args, configDir)
  try {
    const {stderr, stdout} = await execFileAsync(command, argv, {
      env: {...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env},
      maxBuffer: 32 * 1024 * 1024,
    })
    return {code: 0, stderr, stdout}
  } catch (error: unknown) {
    const failure = error as {code?: number; stderr?: string; stdout?: string}
    return {code: failure.code ?? 1, stderr: failure.stderr ?? '', stdout: failure.stdout ?? ''}
  }
}

/**
 * Runs the CLI and fails the test if it exited non-zero.
 *
 * @param args Command line arguments.
 * @param configDir Value for SEARCH_CONFIG_DIR / SDKCK_CONFIG_DIR.
 * @returns The successful result.
 */
export async function runCliOk(args: string[], configDir: string): Promise<CliResult> {
  const result = await runCli(args, configDir)
  expect(result.code, `\`${args.join(' ')}\` failed:\n${result.stdout}\n${result.stderr}`).to.equal(0)
  return result
}

/**
 * Runs the CLI and parses stdout as JSON.
 *
 * Appends `--json` — a declared flag here (`enableJsonFlag`), unlike the
 * sandbox plugins where JSON is the undocumented default.
 *
 * @param args Command line arguments.
 * @param configDir Value for SEARCH_CONFIG_DIR / SDKCK_CONFIG_DIR.
 * @returns The parsed JSON payload.
 */
export async function runCliJson<T = unknown>(args: string[], configDir: string): Promise<T> {
  const {stdout} = await runCliOk([...args, '--json'], configDir)
  return JSON.parse(stdout) as T
}

/**
 * Writes a synonyms fixture file for `synonyms import` to consume.
 *
 * @param groups The synonym groups to write.
 * @returns Absolute path to the written file; delete it with fs.rm() when done.
 */
export async function writeSynonymsFile(groups: string[][]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-e2e-src-'))
  const file = path.join(dir, 'synonyms.json')
  await fs.writeFile(file, JSON.stringify(groups, null, 2), 'utf8')
  return file
}
