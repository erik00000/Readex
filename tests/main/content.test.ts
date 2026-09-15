import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import iconv from 'iconv-lite'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTxtContent } from '../../src/main/content'

const temporaryFiles: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFiles.splice(0).map((file) => fs.rm(file, { force: true })))
})

describe('TXT parsing', () => {
  it('splits large text into searchable chapters with stable offsets', async () => {
    const filePath = path.join(os.tmpdir(), `readex-${Date.now()}.txt`)
    temporaryFiles.push(filePath)
    await fs.writeFile(filePath, `${'段落一。\n'.repeat(100)}\n${'段落二。\n'.repeat(100)}`, 'utf8')

    const content = await parseTxtContent(filePath)

    expect(content.format).toBe('txt')
    expect(content.chapters?.length).toBeGreaterThan(0)
    expect(content.toc[0].label).toBe('第 1 节')
    expect(content.chapters?.[0].text).toContain('段落一')
  })

  it('decodes GB18030 Chinese text', async () => {
    const filePath = path.join(os.tmpdir(), `readex-gb-${Date.now()}.txt`)
    temporaryFiles.push(filePath)
    await fs.writeFile(filePath, iconv.encode('中文电子书\n第二章', 'gb18030'))

    const content = await parseTxtContent(filePath)

    expect(content.chapters?.[0].text).toContain('中文电子书')
    expect(content.chapters?.[0].text).toContain('第二章')
  })
})
