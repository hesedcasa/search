import {readFileSync} from 'node:fs'

// Each group is a list of interchangeable terms, e.g. ["ticket", "issue", "bug"]
export type SynonymGroup = string[]

// Maps each lowercased term → all other terms in its group
export type SynonymMap = Map<string, string[]>

/**
 * Parse and validate a synonyms file.
 *
 * File format — a JSON array of synonym groups:
 *
 *   [
 *     ["ticket", "issue", "bug"],
 *     ["pr", "pull request", "merge request"],
 *     ["repo", "repository"]
 *   ]
 *
 * Every term in a group is treated as equivalent to every other term. Terms
 * are matched case-insensitively. Multi-word terms (e.g. "pull request") are
 * matched as whole phrases.
 */
export function parseSynonymGroups(raw: string): SynonymGroup[] {
  const parsed = JSON.parse(raw)
  if (
    !Array.isArray(parsed) ||
    parsed.some((g) => !Array.isArray(g) || g.some((term) => typeof term !== 'string'))
  ) {
    throw new TypeError('Synonyms file must be a JSON array of string arrays')
  }

  return parsed as SynonymGroup[]
}

export function loadSynonymGroupsFromFile(filePath: string): SynonymGroup[] {
  return parseSynonymGroups(readFileSync(filePath, 'utf8'))
}

export function buildSynonymMap(groups: SynonymGroup[]): SynonymMap {
  const map = new Map<string, string[]>()
  for (const group of groups) {
    const normalized = group.map((t) => t.toLowerCase().trim()).filter(Boolean)
    for (const term of normalized) {
      const others = normalized.filter((t) => t !== term)
      const existing = map.get(term) ?? []
      map.set(term, [...new Set([...existing, ...others])])
    }
  }

  return map
}

/**
 * Return `text` with synonym expansions appended.
 *
 * For every term in `synonyms` that appears in `text`, all sibling terms from
 * the same group are appended so the search index / query matches any
 * equivalent spelling.
 */
export function expandWithSynonyms(text: string, synonyms: SynonymMap): string {
  if (synonyms.size === 0) return text
  const extras: string[] = []
  for (const [term, syns] of synonyms) {
    if (containsTerm(text, term)) {
      extras.push(...syns)
    }
  }

  return extras.length > 0 ? `${text} ${extras.join(' ')}` : text
}

function escapeRegex(s: string): string {
  // eslint-disable-next-line unicorn/prefer-string-raw
  return s.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&').replaceAll(/\s+/g, String.raw`\s+`)
}

function containsTerm(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![\\w])${escapeRegex(term)}(?![\\w])`, 'i')
  return pattern.test(text)
}
