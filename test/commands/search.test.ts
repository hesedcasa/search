import {expect} from 'chai'

import Search from '../../src/commands/search.js'
import {searchCommands} from '../../src/search-logic.js'
import {buildSynonymMap} from '../../src/synonyms.js'
import {fixtureCommand, HOST_COMMANDS} from '../fixtures.js'

function makeSearch(argv: string[]): {cmd: Search; output: () => string} {
  const lines: string[] = []
  const config = {
    bin: 'sdkck',
    commands: HOST_COMMANDS,
    runHook: async () => ({failures: [], successes: []}),
    topicSeparator: ' ',
  } as never
  const cmd = new Search(argv, config)
  cmd.log = (message = '') => {
    lines.push(String(message))
  }

  return {cmd, output: () => lines.join('\n')}
}

function makeSearchJson(argv: string[]): {cmd: Search; output: () => string} {
  const {cmd, output} = makeSearch([...argv, '--json'])
  // jsonEnabled() checks for the flag in parsed args, but oclif sets it via a
  // property that the base Command exposes — override it for unit tests.
  ;(cmd as unknown as {jsonEnabled: () => boolean}).jsonEnabled = () => true
  return {cmd, output}
}

describe('search', () => {
  describe('fuzzy matching', () => {
    it('finds commands matching a query', async () => {
      const {cmd, output} = makeSearch(['help'])
      await cmd.run()
      expect(output()).to.contain('help')
      expect(output()).to.match(/Found \d+ commands?:/)
    })

    it('ranks exact matches above fuzzy matches', async () => {
      const {cmd, output} = makeSearch(['help'])
      await cmd.run()
      const lines = output()
        .split('\n')
        .filter((l) => l.trim().length > 0)
      // lines[0] is the "Found N commands..." header, lines[1] should be the best match
      expect(lines[1]).to.contain('help')
    })

    it('matches fuzzy abbreviations', async () => {
      // 'updt' appears in no command id or description; only fuzzy matching
      // bridges it to the real `bb pr update` command.
      const {cmd, output} = makeSearch(['updt'])
      await cmd.run()
      expect(output()).to.contain('update')
    })

    it('reports no matches for unknown query', async () => {
      const {cmd, output} = makeSearch(['zzzznonexistent'])
      await cmd.run()
      expect(output()).to.equal('')
    })

    it('matches by plugin name', async () => {
      // Neither 'api import' nor its description mentions 'api2cli'; only the
      // plugin name '@hesed/api2cli' does.
      const {cmd, output} = makeSearch(['api2cli'])
      await cmd.run()
      expect(output()).to.contain('api import')
    })

    it('excludes @oclif/plugin-plugins commands', async () => {
      const {cmd, output} = makeSearch(['plugins install'])
      await cmd.run()
      // Results are filtered but the query appears in the "No commands found" message,
      // so check that no command ID line lists 'plugins install' as a match
      expect(output().split('\n')).to.not.include('plugins install')
    })

    it('finds commands by a description keyword', async () => {
      // 'authenticate' only appears (stemmed) in 'Add Jira authentication'.
      const {cmd, output} = makeSearch(['authenticate'])
      await cmd.run()
      expect(output()).to.contain('jira auth add')
    })

    it('matches a deep multi-word command by its full id', async () => {
      const {cmd, output} = makeSearch(['jira issue create'])
      await cmd.run()
      expect(output()).to.contain('jira issue create')
    })

    it('matches the `jira issue` command by its Get-details description', async () => {
      // `jira issue <issueId>` is the issue-detail command on the real
      // surface — there is no `jira issue get` — so the legacy wording must
      // still land on it.
      const {cmd, output} = makeSearch(['jira issue get'])
      await cmd.run()
      expect(output()).to.contain('jira issue')
    })
  })

  describe('--json output', () => {
    it('returns a results array with command, description, plugin fields', async () => {
      const {cmd} = makeSearchJson(['help'])
      const result = await cmd.run()
      expect(result).to.be.an('array')
      expect(result.length).to.be.greaterThan(0)
      const first = result[0]
      expect(first).to.include.keys(['command', 'description'])
    })

    it('exposes argument and flag metadata for the matched command', async () => {
      const {cmd} = makeSearchJson(['search'])
      const result = await cmd.run()
      const self = result.find((entry) => entry.commandId === 'search')
      expect(self, 'the search command should match its own query').to.exist
      expect(self!.args).to.deep.equal([
        {query: {description: 'Search term to filter commands by', required: true, type: 'string'}},
      ])
      expect(self!.flags).to.deep.include({
        json: {description: 'Format output as json.', required: false, type: 'boolean'},
      })
      // oclif option flags are reported under the type of value they accept.
      expect(self!.flags).to.deep.include({
        limit: {description: 'Maximum number of results to return', required: false, type: 'string'},
      })
    })

    it('exposes required-argument metadata for jira issue', async () => {
      const {cmd} = makeSearchJson(['jira issue get'])
      const result = await cmd.run()
      const issue = result.find((entry) => entry.commandId === 'jira issue')
      expect(issue, 'jira issue should match').to.exist
      expect(issue!.args).to.deep.equal([
        {issueId: {description: 'Issue ID or issue key', required: true, type: 'string'}},
      ])
    })

    it('returns empty results array when no commands match', async () => {
      const {cmd} = makeSearchJson(['zzzznonexistent'])
      const result = await cmd.run()
      expect(result).to.deep.equal([])
    })

    it('does not log human-readable output when --json is active', async () => {
      const {cmd, output} = makeSearchJson(['help'])
      await cmd.run()
      expect(output()).to.equal('')
    })

    it('includes the correct command in results', async () => {
      const {cmd} = makeSearchJson(['pull request'])
      const result = await cmd.run()
      const commands = result.map((r) => r.command)
      expect(commands.some((c) => c.startsWith('bb pr create'))).to.be.true
    })
  })

  describe('--limit flag', () => {
    it('caps results to the given limit', async () => {
      const {cmd} = makeSearch(['help', '--limit', '1'])
      const result = await cmd.run()
      expect(result.length).to.be.at.most(1)
    })

    it('defaults to 5 results', async () => {
      const {cmd} = makeSearch(['e'])
      const result = await cmd.run()
      expect(result.length).to.be.at.most(5)
    })
  })

  describe('human-readable output', () => {
    it('renders the <%= config.bin %> template in descriptions', async () => {
      // The catalog keeps oclif templates unrendered, like a real Loadable
      // command; the printed description must interpolate the bin name.
      const {cmd, output} = makeSearch(['help'])
      await cmd.run()
      expect(output()).to.contain('Display help for sdkck.')
    })
  })

  describe('search logic', () => {
    it('returns no results for intent-only queries without lexical matches', async () => {
      const commands = [
        {id: 'deploy', summary: 'Ship the app to production'},
        {id: 'login', summary: 'Authenticate the current user'},
      ]

      const results = await searchCommands('sign in', commands)

      expect(results).to.deep.equal([])
    })
  })

  describe('synonyms', () => {
    // Real surface entries, not bespoke mocks: the bridge under test has to
    // work against the same summaries production serves.
    const commands = [fixtureCommand('jira issue create'), fixtureCommand('jira issue search'), fixtureCommand('help')]

    it('matches "get ticket" to issue commands when ticket↔issue synonym is loaded', async () => {
      const synonyms = buildSynonymMap([['ticket', 'issue']])
      const results = await searchCommands('get ticket', commands, synonyms)
      const ids = results.map((r) => r.cmd.id)
      expect(ids.some((id) => id.startsWith('jira issue'))).to.be.true
    })

    it('returns no synonym matches when no synonyms are configured', async () => {
      // "find bug" has no lexical overlap with any command — neither token appears
      // in any id, summary, or pluginName — so without synonyms it returns nothing
      const results = await searchCommands('find bug', commands)
      expect(results).to.deep.equal([])
    })

    it('matches "find bug" to issue commands when bug↔issue synonym is loaded', async () => {
      const synonyms = buildSynonymMap([['bug', 'issue']])
      const results = await searchCommands('find bug', commands, synonyms)
      const ids = results.map((r) => r.cmd.id)
      expect(ids.some((id) => id.startsWith('jira issue'))).to.be.true
    })

    it('matches multi-word synonym phrases', async () => {
      const synonyms = buildSynonymMap([['pr', 'pull request', 'merge request']])
      const results = await searchCommands('create merge request', [fixtureCommand('bb pr create')], synonyms)
      const ids = results.map((r) => r.cmd.id)
      expect(ids).to.include('bb pr create')
    })
  })
})
