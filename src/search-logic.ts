import UFuzzy from '@leeoniya/ufuzzy'

import {MiniLMCommandEmbedder} from './embedders/minilm.js'

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

export type CommandEmbedder = {
  embed(texts: string[]): Promise<number[][]>
}

export type CommandReranker<T extends SearchableCommand = SearchableCommand> = {
  rerank(query: string, commands: Array<ScoredCommand<T>>): Promise<Array<ScoredCommand<T>>>
}

export type SearchCommandsOptions<T extends SearchableCommand = SearchableCommand> = {
  embedder?: CommandEmbedder
  lexicalWeight?: number
  minSemanticScore?: number
  reranker?: CommandReranker<T>
  semantic?: boolean
  semanticWeight?: number
}

const DEFAULT_MIN_SEMANTIC_SCORE = 0.22
const DEFAULT_SEMANTIC_WEIGHT = 0.75
const DEFAULT_LEXICAL_WEIGHT = 0.25

let defaultEmbedderPromise: Promise<CommandEmbedder> | undefined
const embeddingCache = new WeakMap<CommandEmbedder, Map<string, number[]>>()

export async function searchCommands<T extends SearchableCommand>(
  query: string,
  commands: T[],
  options: SearchCommandsOptions<T> = {},
): Promise<Array<ScoredCommand<T>>> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length === 0 || commands.length === 0) return []

  const haystack = commands.map((command) => commandSearchText(command))
  const lexical = searchCommandsLexically(normalizedQuery, commands, haystack)

  if (options.semantic === false) return lexical

  let semantic: Array<ScoredCommand<T>>
  try {
    semantic = await searchCommandsSemantically(normalizedQuery, commands, haystack, options)
  } catch {
    return lexical
  }

  if (semantic.length === 0) return lexical

  const merged = mergeScores(semantic, lexical, {
    lexicalWeight: options.lexicalWeight ?? DEFAULT_LEXICAL_WEIGHT,
    minSemanticScore: options.minSemanticScore ?? DEFAULT_MIN_SEMANTIC_SCORE,
    semanticWeight: options.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT,
  })

  return options.reranker ? options.reranker.rerank(normalizedQuery, merged) : merged
}

export function searchCommandsLexically<T extends SearchableCommand>(
  query: string,
  commands: T[],
  haystack = commands.map((command) => commandSearchText(command)),
): Array<ScoredCommand<T>> {
  const uf = new UFuzzy({intraIns: Infinity})

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

function commandSearchText(command: SearchableCommand): string {
  return [command.id, command.summary ?? command.description ?? '', command.pluginName ?? '']
    .filter(Boolean)
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

async function searchCommandsSemantically<T extends SearchableCommand>(
  query: string,
  commands: T[],
  haystack: string[],
  options: SearchCommandsOptions<T>,
): Promise<Array<ScoredCommand<T>>> {
  const embedder = options.embedder ?? (await getDefaultEmbedder())
  const {commandEmbeddings, queryEmbedding} = await getSemanticEmbeddings(embedder, query, haystack)

  return commandEmbeddings
    .map((embedding, idx) => ({
      cmd: commands[idx],
      score: cosineSimilarity(queryEmbedding, embedding),
    }))
    .filter(({score}) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)
}

async function getSemanticEmbeddings(
  embedder: CommandEmbedder,
  query: string,
  commandTexts: string[],
): Promise<{commandEmbeddings: number[][]; queryEmbedding: number[]}> {
  let cache = embeddingCache.get(embedder)
  if (!cache) {
    cache = new Map()
    embeddingCache.set(embedder, cache)
  }

  const missingCommandTexts = [...new Set(commandTexts.filter((text) => !cache.has(text)))]
  const [queryEmbedding, ...missingCommandEmbeddings] = await embedder.embed([query, ...missingCommandTexts])

  for (const [idx, text] of missingCommandTexts.entries()) {
    const embedding = missingCommandEmbeddings[idx]
    if (embedding) cache.set(text, embedding)
  }

  return {
    commandEmbeddings: commandTexts.map((text) => cache.get(text) ?? []),
    queryEmbedding,
  }
}

async function getDefaultEmbedder(): Promise<CommandEmbedder> {
  defaultEmbedderPromise ??= Promise.resolve(new MiniLMCommandEmbedder())
  return defaultEmbedderPromise
}

function mergeScores<T extends SearchableCommand>(
  semantic: Array<ScoredCommand<T>>,
  lexical: Array<ScoredCommand<T>>,
  options: {lexicalWeight: number; minSemanticScore: number; semanticWeight: number},
): Array<ScoredCommand<T>> {
  const lexicalById = new Map(lexical.map((entry, idx) => [entry.cmd.id, lexicalScore(idx, lexical.length)]))
  const lexicalIds = new Set(lexical.map((entry) => entry.cmd.id))

  return semantic
    .filter((entry) => entry.score >= options.minSemanticScore || lexicalIds.has(entry.cmd.id))
    .map((entry) => {
      const finalScore =
        entry.score * options.semanticWeight + (lexicalById.get(entry.cmd.id) ?? 0) * options.lexicalWeight
      return {cmd: entry.cmd, score: 1 - finalScore}
    })
    .sort((a, b) => a.score - b.score)
}

function lexicalScore(index: number, length: number): number {
  if (length <= 1) return 1
  return 1 - index / (length - 1)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let aMagnitude = 0
  let bMagnitude = 0

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    aMagnitude += a[i] * a[i]
    bMagnitude += b[i] * b[i]
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude))
}
