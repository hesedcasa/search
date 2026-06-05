import {Args, Command, CommandHelp, Flags, toConfiguredId, ux} from '@oclif/core'

import {isMiniLMModelCached, MiniLMCommandEmbedder, type ModelLoadProgress} from '../embedders/minilm.js'
import {type CommandEmbedder, type ScoredCommand, searchCommands, type SearchCommandsOptions} from '../search-logic.js'

let miniLMEmbedder: MiniLMCommandEmbedder | undefined

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
    const loader = createModelLoader(this.jsonEnabled() || isMiniLMModelCached())
    let scored: Array<ScoredCommand<Command.Loadable>>
    try {
      scored = (await searchCommands(args.query, allCommands, getSearchOptions(this.config, loader.onProgress))).slice(
        0,
        flags.limit,
      )
    } finally {
      loader.stop()
    }

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

function getSearchOptions(
  config: Search['config'],
  onLoadProgress: (progress: ModelLoadProgress) => void,
): SearchCommandsOptions<Command.Loadable> {
  const testConfig = config as Search['config'] & {searchEmbedder?: CommandEmbedder}
  if (!testConfig.searchEmbedder) {
    miniLMEmbedder ??= new MiniLMCommandEmbedder()
    miniLMEmbedder.setLoadProgressHandler(onLoadProgress)
    return {embedder: miniLMEmbedder}
  }

  return {embedder: testConfig.searchEmbedder}
}

function createModelLoader(silent: boolean): {onProgress: (progress: ModelLoadProgress) => void; stop: () => void} {
  let started = false
  let stopped = false

  const start = (status?: string) => {
    if (silent || stopped) return

    if (started) {
      ux.action.status = status
      return
    }

    ux.action.start('Loading semantic search model', status)
    started = true
  }

  const stop = () => {
    if (silent || stopped) return

    stopped = true
    if (started) ux.action.stop()
  }

  return {
    onProgress(progress) {
      if (progress.status === 'ready') {
        stop()
        return
      }

      if (progress.status === 'progress_total' && typeof progress.progress === 'number') {
        start(`${Math.round(progress.progress)}% ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`)
        return
      }

      if (progress.status === 'download') {
        start(formatProgressFile(progress.file))
      }
    },
    stop,
  }
}

function formatProgressFile(file: string | undefined): string | undefined {
  return file?.split('/').at(-1)
}

function formatBytes(value: number | undefined): string {
  if (!value || value <= 0) return '?'

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
