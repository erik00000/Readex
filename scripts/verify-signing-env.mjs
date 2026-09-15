const certificate = process.env.CSC_LINK || process.env.WIN_CSC_LINK
const password = process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_KEY_PASSWORD

if (!certificate || !password) {
  console.error(
    [
      'Code signing configuration is missing.',
      'Set CSC_LINK (or WIN_CSC_LINK) and CSC_KEY_PASSWORD (or WIN_CSC_KEY_PASSWORD).',
      'The signed release build was stopped before creating an unsigned artifact.'
    ].join('\n')
  )
  process.exit(1)
}

console.log('Code signing environment is configured.')
