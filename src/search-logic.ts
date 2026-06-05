import {createRequire} from 'node:module'

export type SearchableCommand = {
  description?: string
  id: string
  pluginName?: string
  summary?: string
}

export type ScoredCommand<T extends SearchableCommand = SearchableCommand> = {
  cmd: T
  score: number
}

type FlexSearchIndex = {
  add(id: number, content: string): FlexSearchIndex
  search(query: string, options: {limit: number; suggest: boolean}): Array<number | string>
}

const require = createRequire(import.meta.url)
const {Index} = require('flexsearch') as {
  Index: new (options: {encoder: string; resolution: number; tokenize: string}) => FlexSearchIndex
}

export async function searchCommands<T extends SearchableCommand>(
  query: string,
  commands: T[],
): Promise<Array<ScoredCommand<T>>> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length === 0 || commands.length === 0) return []

  const haystack = commands.map((command) => commandSearchText(command))
  return searchCommandsLexically(normalizedQuery, commands, haystack)
}

export function searchCommandsLexically<T extends SearchableCommand>(
  query: string,
  commands: T[],
  haystack = commands.map((command) => commandSearchText(command)),
): Array<ScoredCommand<T>> {
  const index = createCommandSearchIndex(haystack)

  const idxs = index.search(query, {limit: commands.length, suggest: true})
  if (idxs.length > 0) {
    return idxs.map((idx, rank) => ({cmd: commands[Number(idx)], score: rank}))
  }

  // Multi-token fallback: score each command by how many individual query
  // tokens it matches. Handles queries containing unknown alias words (e.g.
  // "atlassian") that don't appear literally in any command field.
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return []

  const hitCount = new Map<number, number>()
  for (const token of tokens) {
    const tIdxs = index.search(token, {limit: commands.length, suggest: true})
    for (const idx of tIdxs) {
      const commandIndex = Number(idx)
      hitCount.set(commandIndex, (hitCount.get(commandIndex) ?? 0) + 1)
    }
  }

  return [...hitCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([idx, hits]) => ({cmd: commands[idx], score: tokens.length - hits}))
}

function createCommandSearchIndex(haystack: string[]): FlexSearchIndex {
  const index = new Index({encoder: 'LatinAdvanced', resolution: 9, tokenize: 'forward'})
  for (const [idx, text] of haystack.entries()) {
    index.add(idx, text)
  }

  return index
}

function commandSearchText(command: SearchableCommand): string {
  return [command.id, command.summary ?? command.description ?? '', command.pluginName ?? '']
    .filter(Boolean)
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}
