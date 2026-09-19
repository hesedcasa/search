import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {createConfigDir, removeConfigDir, runCli, runCliOk, writeSynonymsFile} from './helpers.js'

type SynonymGroups = string[][]

/**
 * Exports via the CLI and parses the JSON it printed to stdout.
 *
 * The synonyms commands do not declare oclif's `--json` flag (only `search`
 * does), but `synonyms export` with no file argument writes only JSON to
 * stdout, so the raw output parses directly.
 */
async function exportGroups(configDir: string): Promise<SynonymGroups> {
  const {stdout} = await runCliOk(['synonyms', 'export'], configDir)
  return JSON.parse(stdout) as SynonymGroups
}

describe('e2e: synonyms import/export', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('imports groups and reports where it stored them', async () => {
    const file = await writeSynonymsFile([
      ['find', 'search'],
      ['bug', 'issue'],
    ])

    try {
      const {stdout} = await runCliOk(['synonyms', 'import', file], configDir)
      expect(stdout).to.contain('Imported 2 synonym groups')
      expect(stdout).to.contain('synonyms.json')
    } finally {
      await fs.rm(path.dirname(file), {force: true, recursive: true})
    }
  })

  it('exports the imported groups to stdout unchanged', async () => {
    const groups: SynonymGroups = [
      ['ticket', 'issue'],
      ['zip', 'archive'],
    ]
    const file = await writeSynonymsFile(groups)

    try {
      await runCliOk(['synonyms', 'import', file], configDir)
      // Round-trip through the CLI: `export` to stdout prints only the JSON.
      expect(await exportGroups(configDir)).to.deep.equal(groups)
    } finally {
      await fs.rm(path.dirname(file), {force: true, recursive: true})
    }
  })

  it('exports to a file when a path is given', async () => {
    const groups: SynonymGroups = [['repo', 'repository']]
    const source = await writeSynonymsFile(groups)
    const target = path.join(os.tmpdir(), `search-e2e-export-${Date.now()}.json`)

    try {
      await runCliOk(['synonyms', 'import', source], configDir)
      const {stdout} = await runCliOk(['synonyms', 'export', target], configDir)
      expect(stdout).to.contain('Exported 1 synonym group')
      expect(stdout).to.contain(target)
      expect(JSON.parse(readFileSync(target, 'utf8'))).to.deep.equal(groups)
    } finally {
      await fs.rm(path.dirname(source), {force: true, recursive: true})
      await fs.rm(target, {force: true})
    }
  })

  it('unions overlapping groups and appends disjoint ones with --merge', async () => {
    const seed = await writeSynonymsFile([
      ['find', 'search'],
      ['bug', 'issue'],
    ])

    try {
      await runCliOk(['synonyms', 'import', seed], configDir)

      // 'search lookup' shares the term `search` with the first seed group, so
      // it must merge into it; 'pr pull request' shares nothing and is appended.
      const more = await writeSynonymsFile([
        ['search', 'lookup'],
        ['pr', 'pull request'],
      ])

      try {
        const {stdout} = await runCliOk(['synonyms', 'import', more, '--merge'], configDir)
        // The message reports the number of groups now stored (2 seed groups
        // with one merged in, one appended = 3), not the incoming count.
        expect(stdout).to.contain('Imported 3 synonym groups')

        const exported = await exportGroups(configDir)
        expect(exported).to.have.lengthOf(3)

        const merged = exported.find((group) => group.includes('lookup'))
        expect(merged, 'merged group missing').to.exist
        expect(merged).to.include.members(['find', 'search'])

        expect(exported).to.deep.include(['bug', 'issue'])
        expect(exported).to.deep.include(['pr', 'pull request'])
      } finally {
        await fs.rm(path.dirname(more), {force: true, recursive: true})
      }
    } finally {
      await fs.rm(path.dirname(seed), {force: true, recursive: true})
    }
  })

  it('replaces everything when importing without --merge', async () => {
    const groups: SynonymGroups = [['zip', 'archive']]
    const file = await writeSynonymsFile(groups)

    try {
      await runCliOk(['synonyms', 'import', file], configDir)
      expect(await exportGroups(configDir)).to.deep.equal(groups)
    } finally {
      await fs.rm(path.dirname(file), {force: true, recursive: true})
    }
  })

  it('fails with File not found for a missing source', async () => {
    const missing = path.join(os.tmpdir(), 'search-e2e-nope-does-not-exist.json')
    const {code, stderr} = await runCli(['synonyms', 'import', missing], configDir)
    expect(code).to.equal(2)
    expect(stderr).to.contain('File not found')
  })

  it('fails on malformed JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-e2e-src-'))
    const file = path.join(dir, 'broken.json')
    await fs.writeFile(file, 'not json at all', 'utf8')

    try {
      const {code, stderr} = await runCli(['synonyms', 'import', file], configDir)
      expect(code).to.be.greaterThan(0)
      expect(stderr).to.not.equal('')
    } finally {
      await fs.rm(dir, {force: true, recursive: true})
    }
  })

  it('fails when the file is not an array of string arrays', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-e2e-src-'))
    const file = path.join(dir, 'wrong-shape.json')
    await fs.writeFile(file, JSON.stringify({find: ['search']}), 'utf8')

    try {
      const {code, stderr} = await runCli(['synonyms', 'import', file], configDir)
      expect(code).to.be.greaterThan(0)
      // The message is the plugin's own validation error — deterministic and
      // client-side, unlike a localized server response.
      expect(stderr).to.contain('JSON array')
    } finally {
      await fs.rm(dir, {force: true, recursive: true})
    }
  })
})
