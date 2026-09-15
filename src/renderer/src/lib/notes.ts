import type { Annotation, BookRecord } from '@shared/types'

export function annotationsToMarkdown(book: BookRecord, annotations: Annotation[]): string {
  const lines = [
    `# ${book.title} - 阅读笔记`,
    '',
    `- 作者：${book.author || '未知作者'}`,
    `- 格式：${book.format.toUpperCase()}`,
    `- 标注数量：${annotations.length}`,
    `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
    ''
  ]

  for (const annotation of [...annotations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    lines.push(
      `## ${annotation.type === 'bookmark' ? '书签' : annotation.note ? '笔记' : '高亮'}`
    )
    lines.push('')
    lines.push(`> ${annotation.text.replace(/\n/g, '\n> ')}`)
    lines.push('')
    if (annotation.note) {
      lines.push(annotation.note)
      lines.push('')
    }
    lines.push(`<small>${new Date(annotation.createdAt).toLocaleString('zh-CN')}</small>`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}
