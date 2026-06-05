import {Args, Command, CommandHelp, Flags, toConfiguredId} from '@oclif/core'

import {type ScoredCommand, searchCommands} from '../search-logic.js'
import {loadStoredSynonymMap} from '../synonym-store.js'

export default class Search extends Command {
  static args = {
    query: Args.string({description: 'Search term to filter commands by', required: true}),
  }
  static description = 'Search for available commands'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> search "create pr"',
    '<%= config.bin %> search jira -d',
    '<%= config.bin %> search "update jira" --details',
  ]
  static flags = {
    details: Flags.boolean({char: 'd', description: 'Show full help for each matched command', required: false}),
    limit: Flags.integer({char: 'n', default: 5, description: 'Maximum number of results to return', required: false}),
  }

  async run(): Promise<
    Array<{
      args: Array<Record<string, {description: string; required: boolean; type: string}>>
      command: string
      commandId: string
      description: string
      flags: Array<Record<string, {description: string; required: boolean; type: string}>>
    }>
  > {
    const {args, flags} = await this.parse(Search)
    const allCommands = this.config.commands.filter((c) => !c.hidden && c.pluginName !== '@oclif/plugin-plugins')
    const synonyms = loadStoredSynonymMap(this.config.configDir)
    const scored = (await searchCommands(args.query, allCommands, synonyms)).slice(0, flags.limit)

    const results = scored.map((entry) => {
      const {cmd} = entry
      const configuredId = toConfiguredId(cmd.id, this.config)
      const usageOverride = cmd.usage
      const visibleArgs = Object.values(cmd.args ?? {}).filter((a) => !a.hidden)
      const argList = visibleArgs.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(' ')
      const usage = usageOverride
        ? Array.isArray(usageOverride)
          ? usageOverride.join('\n')
          : usageOverride
        : [configuredId, argList].filter(Boolean).join(' ')
      const args = visibleArgs.map((a) => ({
        [a.name]: {description: a.description ?? '', required: a.required ?? false, type: 'string'},
      }))
      const flags = Object.values(cmd.flags ?? {})
        .filter((f) => !f.hidden)
        .map((f) => ({
          [f.name]: {
            description: f.summary ?? f.description ?? '',
            required: f.required ?? false,
            type: f.type === 'boolean' ? 'boolean' : 'string',
          },
        }))
      return {
        args,
        command: usage,
        commandId: configuredId,
        description: cmd.summary ?? cmd.description ?? '',
        flags,
      }
    })

    if (!this.jsonEnabled()) {
      this._printResults(scored, results, flags)
    }

    return results
  }

  private _printResults(
    scored: Array<ScoredCommand<Command.Loadable>>,
    results: Array<{[key: string]: unknown; command: string; description: string}>,
    flags: {details: boolean},
  ): void {
    if (results.length === 0) return

    this.log(`Found ${results.length} command${results.length === 1 ? '' : 's'}:\n`)

    for (const {cmd, result} of scored.map((s, i) => ({cmd: s.cmd, result: results[i]}))) {
      this.log(result.command)

      if (flags.details) {
        const help = new CommandHelp(cmd, this.config, {maxWidth: process.stdout.columns ?? 80})
        this.log(help.generate())
      } else {
        const raw = cmd.summary ?? cmd.description ?? ''
        // eslint-disable-next-line unicorn/prefer-string-replace-all
        const description = raw.replace(/<%=\s*config\.bin\s*%>/g, this.config.bin).split('\n')[0]
        if (description) {
          this.log(description)
        }
      }

      this.log('')
    }
  }
}
