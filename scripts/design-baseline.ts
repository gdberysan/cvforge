// scripts/design-baseline.ts
import { writeFileSync } from 'node:fs'
import { scanRepo } from '../tests/design/scan'

writeFileSync('tests/design/baseline.json', `${JSON.stringify(scanRepo(process.cwd()), null, 2)}\n`)
console.log('design baseline written')
