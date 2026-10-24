// The local search index over one project's footage: transcript segments, shot descriptions, tags and
// moment names. Pure, so ranking and matching are tested without the renderer or the disk.
// Terms are kept in a sorted list, so a prefix lookup is a binary search rather than a scan of every
// document. Each document belongs to a group (its media item), so a re-analyzed item replaces only its
// own documents.

export const SEARCH_KINDS = ['segment', 'shot', 'tag', 'moment'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

// How much a match of each kind counts. A moment name is the most deliberate label the user gives.
const KIND_WEIGHT: Record<SearchKind, number> = { moment: 3, tag: 2.5, shot: 2, segment: 1 }

// A bonus for a query word that is spelled out in full in the document, not only as a prefix.
const EXACT_BONUS = 0.5
const DEFAULT_LIMIT = 50

export interface SearchDoc {
  /** Unique across the index. Built from the media id, the kind and a counter. */
  id: string
  mediaId: string
  kind: SearchKind
  text: string
  /** Where the match sits in the source, in milliseconds. Tags use the whole clip. */
  startMs: number
  endMs: number
}

export interface SearchHit extends SearchDoc {
  score: number
}

export interface SnippetPart {
  text: string
  match: boolean
}

export interface Token {
  term: string
  start: number
  end: number
}

const WORD = /[\p{L}\p{N}]+/gu

/** Words of a text, lower-cased, with their offsets in the original text. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(WORD)) {
    const start = match.index ?? 0
    tokens.push({ term: match[0].toLowerCase(), start, end: start + match[0].length })
  }
  return tokens
}

/** The distinct words of a query, in the order typed. */
export function queryTermsOf(query: string): string[] {
  return [...new Set(tokenize(query).map((token) => token.term))]
}

export class SearchIndex {
  private readonly entries = new Map<string, { doc: SearchDoc; tf: Map<string, number> }>()
  private readonly postings = new Map<string, Set<string>>()
  private readonly groups = new Map<string, Set<string>>()
  private sortedTerms: string[] | undefined

  get size(): number {
    return this.entries.size
  }

  /** Replaces every document of one group with the given documents. */
  replaceGroup(group: string, docs: readonly SearchDoc[]): void {
    this.removeGroup(group)
    if (docs.length === 0) return
    const ids = new Set<string>()
    for (const doc of docs) {
      if (this.entries.has(doc.id)) this.removeDoc(doc.id)
      const tf = new Map<string, number>()
      for (const token of tokenize(doc.text)) {
        tf.set(token.term, (tf.get(token.term) ?? 0) + 1)
      }
      this.entries.set(doc.id, { doc, tf })
      for (const term of tf.keys()) {
        let termIds = this.postings.get(term)
        if (!termIds) {
          termIds = new Set()
          this.postings.set(term, termIds)
        }
        termIds.add(doc.id)
      }
      ids.add(doc.id)
    }
    this.groups.set(group, ids)
    this.sortedTerms = undefined
  }

  removeGroup(group: string): void {
    const ids = this.groups.get(group)
    if (!ids) return
    for (const id of ids) this.removeDoc(id)
    this.groups.delete(group)
  }

  clear(): void {
    this.entries.clear()
    this.postings.clear()
    this.groups.clear()
    this.sortedTerms = undefined
  }

  /**
   * The documents that contain every query word as a prefix of one of their words, best first. A
   * query word that is only a prefix still matches, so typing "stad" finds "stadium".
   */
  search(query: string, limit = DEFAULT_LIMIT): SearchHit[] {
    const terms = queryTermsOf(query)
    if (terms.length === 0) return []

    let scores: Map<string, number> | undefined
    for (const queryTerm of terms) {
      const matched = this.matchesFor(queryTerm)
      if (matched.size === 0) return []
      if (!scores) {
        scores = matched
        continue
      }
      const next = new Map<string, number>()
      for (const [id, score] of scores) {
        const extra = matched.get(id)
        if (extra !== undefined) next.set(id, score + extra)
      }
      if (next.size === 0) return []
      scores = next
    }

    const hits: SearchHit[] = []
    for (const [id, score] of scores ?? []) {
      const doc = this.entries.get(id)?.doc
      if (!doc) continue
      hits.push({ ...doc, score: score * KIND_WEIGHT[doc.kind] })
    }
    hits.sort(
      (a, b) =>
        b.score - a.score || a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    return hits.slice(0, Math.max(0, limit))
  }

  // Best weight per document for one query word: a term with more hits in a document weighs more.
  private matchesFor(queryTerm: string): Map<string, number> {
    const matched = new Map<string, number>()
    for (const term of this.termsWithPrefix(queryTerm)) {
      const exact = term === queryTerm ? EXACT_BONUS : 0
      for (const id of this.postings.get(term) ?? []) {
        const tf = this.entries.get(id)?.tf.get(term) ?? 0
        const weight = 1 + Math.log(Math.max(tf, 1)) + exact
        if (weight > (matched.get(id) ?? 0)) matched.set(id, weight)
      }
    }
    return matched
  }

  private termsWithPrefix(prefix: string): string[] {
    const terms = this.sorted()
    let low = 0
    let high = terms.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (terms[middle] < prefix) low = middle + 1
      else high = middle
    }
    const found: string[] = []
    for (let index = low; index < terms.length && terms[index].startsWith(prefix); index += 1) {
      found.push(terms[index])
    }
    return found
  }

  private sorted(): string[] {
    if (!this.sortedTerms) this.sortedTerms = [...this.postings.keys()].sort()
    return this.sortedTerms
  }

  private removeDoc(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    for (const term of entry.tf.keys()) {
      const ids = this.postings.get(term)
      if (!ids) continue
      ids.delete(id)
      if (ids.size === 0) this.postings.delete(term)
    }
    this.entries.delete(id)
    this.sortedTerms = undefined
  }
}

/**
 * A short piece of the document text around its first match, split into parts so the matching words
 * can be highlighted. Ellipses mark a cut at either end.
 */
export function snippetFor(
  text: string,
  queryTerms: readonly string[],
  maxChars = 90
): SnippetPart[] {
  const tokens = tokenize(text)
  const isMatch = (token: Token) => queryTerms.some((term) => token.term.startsWith(term))
  const first = tokens.find(isMatch)

  let start = 0
  if (first && text.length > maxChars) {
    start = Math.max(0, first.start - Math.floor(maxChars / 4))
    const space = text.indexOf(' ', start)
    if (space !== -1 && space < first.start) start = space + 1
  }
  const end = Math.min(text.length, start + maxChars)

  const parts: SnippetPart[] = []
  let position = start
  const push = (part: string, match: boolean) => {
    if (part === '') return
    const last = parts[parts.length - 1]
    if (last && last.match === match) last.text += part
    else parts.push({ text: part, match })
  }
  for (const token of tokens) {
    if (token.start < start || token.end > end || !isMatch(token)) continue
    push(text.slice(position, token.start), false)
    push(text.slice(token.start, token.end), true)
    position = token.end
  }
  push(text.slice(position, end), false)

  if (start > 0) parts.unshift({ text: '…', match: false })
  if (end < text.length) parts.push({ text: '…', match: false })
  return parts
}
