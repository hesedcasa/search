import {Args, Command, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'

import {synonymsPath, writeSynonymGroups} from '../../synonym-store.js'
import {loadSynonymGroupsFromFile, type SynonymGroup} from '../../synonyms.js'

export default class SynonymsImport extends Command {
  static args = {
    file: Args.string({description: 'Path to a JSON synonyms file to import', required: true}),
  }
  static description = 'Import synonyms from a JSON file'
  static examples = [
    '<%= config.bin %> synonyms import ./synonyms.json',
    '<%= config.bin %> synonyms import ./synonyms.json --merge',
  ]
  static flags = {
    merge: Flags.boolean({
      default: false,
      description: 'Merge with existing synonyms instead of replacing them',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SynonymsImport)

    if (!existsSync(args.file)) {
      this.error(`File not found: ${args.file}`)
    }

    const incoming = loadSynonymGroupsFromFile(args.file)

    let groups: SynonymGroup[]
    if (flags.merge) {
      const {readSynonymGroups} = await import('../../synonym-store.js')
      const existing = readSynonymGroups(this.config.configDir)
      groups = mergeSynonymGroups(existing, incoming)
    } else {
      groups = incoming
    }

    writeSynonymGroups(this.config.configDir, groups)

    const dest = synonymsPath(this.config.configDir)
    this.log(`Imported ${groups.length} synonym group${groups.length === 1 ? '' : 's'} → ${dest}`)
  }
}

/**
 * Merge two synonym group lists.
 *
 * Groups are merged when they share at least one term in common; otherwise
 * they are appended as separate groups.
 */
function mergeSynonymGroups(existing: SynonymGroup[], incoming: SynonymGroup[]): SynonymGroup[] {
  const result: SynonymGroup[] = existing.map((g) => [...g])

  for (const group of incoming) {
    const normalizedGroup = group.map((t) => t.toLowerCase().trim()).filter(Boolean)

    // Find any existing group that overlaps
    const matchIndex = result.findIndex((r) => r.some((t) => normalizedGroup.includes(t.toLowerCase().trim())))

    if (matchIndex === -1) {
      result.push(normalizedGroup)
    } else {
      const merged = [...new Set([...normalizedGroup, ...result[matchIndex].map((t) => t.toLowerCase().trim())])]
      result[matchIndex] = merged
    }
  }

  return result
}
