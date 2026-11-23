import { dictionary } from '@/lib/i18n/dictionary'

const q = process.argv.slice(2)
for (const [lang, d] of Object.entries(dictionary))
  for (const [k, v] of Object.entries(d as Record<string, string>))
    if (q.some((x) => k === x)) console.log(`${lang} ${k}: ${v}`)
