import UFuzzy from '@leeoniya/ufuzzy'

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

export function searchCommands<T extends SearchableCommand>(query: string, commands: T[]): Array<ScoredCommand<T>> {
  const uf = new UFuzzy({intraIns: Infinity})
  const haystack = commands.map((c) =>
    [c.id, c.summary ?? c.description ?? '', c.pluginName ?? ''].filter(Boolean).join(' '),
  )

  const [idxs, , order] = uf.search(haystack, query, 0, Infinity)
  if (idxs && idxs.length > 0) {
    const ranked = order ?? idxs.map((_, i) => i)
    return ranked.map((oi, rank) => ({cmd: commands[idxs[oi]], score: rank}))
  }

  // Multi-token fallback: score each command by how many individual query
  // tokens it matches. Handles queries containing unknown alias words (e.g.
  // "atlassian") that don't appear literally in any command field.
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return []

  const hitCount = new Map<number, number>()
  for (const token of tokens) {
    const [tIdxs] = uf.search(haystack, token, 0, Infinity)
    if (tIdxs) {
      for (const idx of tIdxs) hitCount.set(idx, (hitCount.get(idx) ?? 0) + 1)
    }
  }

  return [...hitCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([idx, hits]) => ({cmd: commands[idx], score: tokens.length - hits}))
}
