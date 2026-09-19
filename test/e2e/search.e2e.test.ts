import {expect} from 'chai'
import path from 'node:path'

import {
  createConfigDir,
  removeConfigDir,
  runCli,
  runCliJson,
  runCliOk,
  type SearchResult,
  writeSynonymsFile,
} from './helpers.js'

describe('e2e: search command', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('finds the synonyms commands for a topic query', async () => {
    const results = await runCliJson<SearchResult[]>(['search', 'synonyms', '--limit', '10'], configDir)
    const ids = results.map((entry) => entry.commandId)
    expect(ids).to.include('synonyms export')
    expect(ids).to.include('synonyms import')
  })

  it('returns the documented result shape', async () => {
    const results = await runCliJson<SearchResult[]>(['search', 'synonyms', '--limit', '10'], configDir)
    expect(results.length).to.be.greaterThan(0)

    const first = results[0]
    expect(first).to.include.keys(['args', 'command', 'commandId', 'description', 'flags'])
    // `command` is the usage line: the command id plus its argument spec.
    expect(first.command.startsWith(first.commandId)).to.be.true
    expect(first.commandId).to.be.a('string')

    // The import command declares a required <file> argument; its entry must
    // carry the argument metadata the JSON contract promises.
    const imported = results.find((entry) => entry.commandId === 'synonyms import')
    expect(imported, 'synonyms import missing from results').to.exist
    expect(imported!.args[0]).to.have.property('file')
    expect(imported!.args[0].file.required).to.be.true
    expect(imported!.flags[0]).to.have.property('merge')
  })

  it('ranks the exact command match first', async () => {
    const results = await runCliJson<SearchResult[]>(['search', 'synonyms import'], configDir)
    expect(results[0].commandId).to.equal('synonyms import')
  })

  it('caps results to --limit', async () => {
    // 'search' matches the command itself plus both synonyms commands on the
    // standalone surface, and far more under the sdkck host — two matches are
    // guaranteed on both, so an exact count proves the cap is applied.
    const results = await runCliJson<SearchResult[]>(['search', 'search', '--limit', '2'], configDir)
    expect(results).to.have.lengthOf(2)
  })

  it('defaults to at most 5 results', async () => {
    const results = await runCliJson<SearchResult[]>(['search', 'search'], configDir)
    expect(results.length).to.be.at.most(5)
  })

  it('prints a human-readable listing with --details', async () => {
    const {stdout} = await runCliOk(['search', 'synonyms', '--details'], configDir)
    expect(stdout).to.contain('Found')
    // --details prints each match's full help, whose USAGE block names the
    // command id — without the host's bin name, which differs per leg.
    expect(stdout).to.contain('USAGE')
    expect(stdout).to.contain('synonyms export')
  })

  it('returns nothing for an unknown query', async () => {
    const results = await runCliJson<unknown[]>(['search', 'zzzzqqqqnope'], configDir)
    expect(results).to.deep.equal([])
  })

  it('exits 0 and prints nothing for an unknown query in human mode', async () => {
    const {code, stdout} = await runCli(['search', 'zzzzqqqqnope'], configDir)
    expect(code, stdout).to.equal(0)
    expect(stdout).to.equal('')
  })

  describe('with synonyms loaded through the CLI', () => {
    let synonymsFile: string

    before(async () => {
      synonymsFile = await writeSynonymsFile([['find', 'search']])
      // Imported through the CLI under test, not written into the config dir
      // directly — the search reads whatever the import command wrote.
      await runCliOk(['synonyms', 'import', synonymsFile], configDir)
    })

    after(async () => {
      // The file lives alone in its own mkdtemp dir — remove the dir.
      await removeConfigDir(path.dirname(synonymsFile))
    })

    it('matches a synonym of a command word to the command', async () => {
      // 'find' is in no command id, summary or plugin name; only the imported
      // find↔search group bridges it to the `search` command.
      const results = await runCliJson<SearchResult[]>(['search', 'find'], configDir)
      expect(results.map((entry) => entry.commandId)).to.include('search')
    })
  })
})
