import {Args, Command} from '@oclif/core'
import {writeFileSync} from 'node:fs'

import {readSynonymGroups} from '../../synonym-store.js'

export default class SynonymsExport extends Command {
  static args = {
    file: Args.string({description: 'Output file path (prints to stdout if omitted)', required: false}),
  }
  static description = 'Export the stored synonyms to a JSON file or stdout'
  static examples = ['<%= config.bin %> synonyms export', '<%= config.bin %> synonyms export ./my-synonyms.json']

  async run(): Promise<void> {
    const {args} = await this.parse(SynonymsExport)

    const groups = readSynonymGroups(this.config.configDir)
    const json = JSON.stringify(groups, null, 2) + '\n'

    if (args.file) {
      writeFileSync(args.file, json, 'utf8')
      this.log(`Exported ${groups.length} synonym group${groups.length === 1 ? '' : 's'} → ${args.file}`)
    } else {
      process.stdout.write(json)
    }
  }
}
