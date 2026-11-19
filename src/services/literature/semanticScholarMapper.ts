import type { LiteratureClue, Relevance } from '@/types/research'
import type { SemanticScholarPaper } from '@/services/literature/semanticScholarTypes'

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function validYear(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= 2100
    ? value
    : null
}

function validCount(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null
}

function httpUrl(value: unknown): string | null {
  const text = cleanText(value)
  if (!text) {
    return null
  }
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? text
      : null
  } catch {
    return null
  }
}

function doiFromExternalIds(value: unknown): string | null {
  const text = cleanText(value)
  if (!text) {
    return null
  }
  const normalized = text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  return normalized.startsWith('10.') ? normalized : null
}

function relevanceFor(paper: SemanticScholarPaper, keywords: string[]): Relevance {
  const haystack = [
    cleanText(paper.title),
    cleanText(paper.abstract),
    cleanText(paper.venue),
    ...(Array.isArray(paper.fieldsOfStudy) ? paper.fieldsOfStudy : []),
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ')
    .toLowerCase()

  const matched = new Set(
    keywords
      .map((keyword) => keyword.trim().toLowerCase())
      .filter((keyword) => keyword.length > 1 && haystack.includes(keyword)),
  )

  if (matched.size >= 3) {
    return 'high'
  }
  if (matched.size >= 1) {
    return 'medium'
  }
  return 'low'
}

export function mapSemanticScholarPaper(
  paper: SemanticScholarPaper,
  keywords: string[],
): LiteratureClue | null {
  const id = cleanText(paper.paperId)
  const title = cleanText(paper.title)
  if (!id || !title) {
    return null
  }

  const authors = Array.isArray(paper.authors)
    ? paper.authors
        .map((author) => cleanText(author.name))
        .filter((name): name is string => Boolean(name))
    : []

  return {
    id,
    title,
    authors,
    year: validYear(paper.year),
    venue: cleanText(paper.venue),
    abstract: cleanText(paper.abstract),
    relevance: relevanceFor(paper, keywords),
    sourceType: 'real',
    doi: doiFromExternalIds(paper.externalIds?.DOI),
    url: httpUrl(paper.url),
    openAccessPdf: httpUrl(paper.openAccessPdf?.url),
    citationCount: validCount(paper.citationCount),
    referenceCount: validCount(paper.referenceCount),
    relatedQuestionIds: [],
  }
}
