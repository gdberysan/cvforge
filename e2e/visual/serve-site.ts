// Serves web/site for a visual review: npx tsx e2e/visual/serve-site.ts
import path from 'node:path'
import { serveSite } from '../serve'

const site = await serveSite(path.resolve('web/site'))
console.log(site.origin)
