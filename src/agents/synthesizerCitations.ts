import type { LiteratureClue } from '@/types/research'

const S2_CITATION_PATTERN = /\[S2:([^\]]+)\]/g
const SECTION_FOUR_PATTERN = /(^|\n)##\s*4\.?\s*研究假设/

export function extractS2PaperIds(report: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of report.matchAll(S2_CITATION_PATTERN)) {
    const id = match[1]?.trim()
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function citationIssues(
  report: string,
  literature: LiteratureClue[],
): string[] {
  const known = new Set(literature.map((item) => item.id))
  return extractS2PaperIds(report)
    .filter((id) => !known.has(id))
    .map(
      (id) =>
        `最终报告引用了 Researcher 真实文献集合中不存在的 paperId「${id}」，不得编造 S2 引用`,
    )
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\[\]`*_])/g, '\\$1')
}

export function buildProgrammaticReferences(
  literature: LiteratureClue[],
): string {
  const real = literature.filter((item) => item.sourceType === 'real')
  const lines = [
    '### 参考文献（由程序根据 Semantic Scholar 数据生成）',
    '',
  ]

  if (real.length === 0) {
    lines.push('本次未检索到可引用的真实论文。')
    return lines.join('\n')
  }

  real.forEach((item, index) => {
    const authors =
      item.authors.length > 0
        ? item.authors.map(escapeMarkdownText).join(', ')
        : '暂无数据'
    const year = item.year !== null ? String(item.year) : '暂无数据'
    const venue = item.venue ? escapeMarkdownText(item.venue) : '暂无数据'
    const doi = item.doi ? `DOI：${item.doi}` : 'DOI：暂无数据'
    const links: string[] = []
    if (item.url) {
      links.push(`[Semantic Scholar](${item.url})`)
    }
    if (item.openAccessPdf) {
      links.push(`[Open PDF](${item.openAccessPdf})`)
    }
    if (links.length === 0) {
      links.push('来源链接：暂无数据')
    }

    lines.push(
      `${index + 1}. **${escapeMarkdownText(
        item.title,
      )}** — ${authors}. ${year}. ${venue}. ${doi} · ${links.join(' · ')}`,
    )
  })

  return lines.join('\n')
}

export function appendProgrammaticReferences(
  report: string,
  literature: LiteratureClue[],
): string {
  const block = buildProgrammaticReferences(literature)
  const match = SECTION_FOUR_PATTERN.exec(report)
  if (!match) {
    return `${report.trimEnd()}\n\n${block}\n`
  }

  const insertionPoint = match.index + match[1].length
  const before = report.slice(0, insertionPoint).trimEnd()
  const after = report.slice(insertionPoint).trimStart()
  return `${before}\n\n${block}\n\n${after}`
}
