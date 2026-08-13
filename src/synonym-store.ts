import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'

import {buildSynonymMap, parseSynonymGroups, type SynonymGroup, type SynonymMap} from './synonyms.js'

const SYNONYMS_FILENAME = 'synonyms.json'

export function synonymsPath(configDir: string): string {
  return path.join(configDir, SYNONYMS_FILENAME)
}

export function readSynonymGroups(configDir: string | undefined): SynonymGroup[] {
  if (!configDir) return []
  const filePath = synonymsPath(configDir)
  if (!existsSync(filePath)) return []
  return parseSynonymGroups(readFileSync(filePath, 'utf8'))
}

export function writeSynonymGroups(configDir: string, groups: SynonymGroup[]): void {
  writeFileSync(synonymsPath(configDir), JSON.stringify(groups, null, 2) + '\n', 'utf8')
}

export function loadStoredSynonymMap(configDir: string | undefined): SynonymMap {
  return buildSynonymMap(readSynonymGroups(configDir))
}
