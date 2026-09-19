import {expect} from 'chai'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  createConfigDir,
  isSdkckLeg,
  removeConfigDir,
  runCliJson,
  runCliOk,
  type SearchResult,
  selectedPlugins,
  writeSynonymsFile,
} from './helpers.js'

/**
 * The sdkck topic each installable plugin registers its commands under.
 *
 * api2cli is the odd one out: its topic is `api` (hence `sdkck api import`),
 * matching its package name only loosely. Every other plugin's topic is its
 * own name.
 */
const TOPICS: Record<string, string> = {api2cli: 'api'}

const ALL_PLUGINS = ['jira', 'conni', 'bb', 'sentry', 'trello', 'mysql', 'psql', 'api2cli']

function topicFor(plugin: string): string {
  return TOPICS[plugin] ?? plugin
}

/**
 * One describe block per installable plugin, labelled the way
 * scripts/e2e.sh greps (`e2e: <topic> plugin via sdkck`), so `E2E_PLUGINS`
 * subsets select their matching blocks and unselected legs never run.
 *
 * Everything here is sdkck-leg-only: the standalone CLI has no host plugins to
 * index, so the suites skip unless E2E_HOST_CLI=sdkck and the plugin was
 * actually installed into the throwaway home.
 *
 * These are the only tests that exercise the search command against a real,
 * installed plugin surface — the standalone leg sees just this plugin's own
 * three commands, which cannot tell discoverability from tautology.
 */
for (const plugin of ALL_PLUGINS) {
  const topic = topicFor(plugin)

  describe(`e2e: ${topic} plugin via sdkck`, () => {
    let configDir: string | undefined

    before(async function () {
      if (!isSdkckLeg() || !selectedPlugins().includes(plugin)) {
        this.skip()
        return
      }

      configDir = await createConfigDir()
    })

    after(async () => {
      if (configDir) await removeConfigDir(configDir)
    })

    it(`finds ${topic} commands by topic query`, async () => {
      const results = await runCliJson<SearchResult[]>(['search', topic, '--limit', '10'], configDir!)
      expect(results.length).to.be.greaterThan(0)
      expect(
        results.some((entry) => entry.commandId === topic || entry.commandId.startsWith(`${topic} `)),
        `no commandId prefixed with "${topic}" in ${JSON.stringify(results.map((entry) => entry.commandId))}`,
      ).to.be.true
    })

    // Deep-link assertions pin one stable, long-lived command per plugin where
    // one is known — proving the installed plugin's full command surface (not
    // just any topic-mentioning metadata) is indexed. Plugins without one are
    // covered by the topic query above.
    const deepCommand: Record<string, string> = {
      api2cli: 'api import',
      jira: 'jira issue create',
      mysql: 'mysql query',
      psql: 'psql query',
      sentry: 'sentry project events',
    }

    if (Object.hasOwn(deepCommand, plugin)) {
      it(`finds the stable ${deepCommand[plugin]} command`, async () => {
        const results = await runCliJson<SearchResult[]>(['search', deepCommand[plugin]], configDir!)
        expect(results.map((entry) => entry.commandId)).to.include(deepCommand[plugin])
      })
    }

    if (plugin === 'bb') {
      it('finds bb pull-request commands through imported synonyms', async () => {
        // The pr↔"pull request" group is imported through the CLI, then the
        // query uses only the expanded term — the match can only come from the
        // synonym bridge, over the installed bb surface.
        const file = await writeSynonymsFile([['pr', 'pull request']])

        try {
          await runCliOk(['synonyms', 'import', file], configDir!)
          const results = await runCliJson<SearchResult[]>(['search', 'pull request'], configDir!)
          const ids = results.map((entry) => entry.commandId)
          expect(
            ids.some((id) => id.startsWith('bb pr')),
            `no "bb pr" command in ${JSON.stringify(ids)}`,
          ).to.be.true
        } finally {
          await fs.rm(path.dirname(file), {force: true, recursive: true})
        }
      })
    }
  })
}
