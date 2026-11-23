import { readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

const [profileDir, out] = process.argv.slice(2)
const root = path.resolve('web/out')
const RAW = `<!doctype html><script type="module">const w=new Worker('/worker/cvforge-worker.js',{type:'module'});let s=0;window.rpc=(m,a)=>new Promise((res,rej)=>{const id=++s;const l=(e)=>{const r=e.data;if(r.id!==id||r.kind==='progress')return;w.removeEventListener('message',l);r.kind==='result'?res(r.value):rej(new Error(JSON.stringify(r.error)))};w.addEventListener('message',l);w.postMessage({id,method:m,args:a,progressAt:null})});window.ready=true</script>`
const server = createServer(async (req, res) => {
  if (req.url === '/raw.html') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(RAW)
    return
  }
  let f = path.join(root, req.url.split('?')[0])
  try {
    if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html')
  } catch {}
  try {
    res.writeHead(200, {
      'content-type': f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    })
    res.end(await readFile(f))
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(3997, '127.0.0.1')
const ctx = await chromium.launchPersistentContext(profileDir)
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:3997/raw.html')
await p.waitForFunction(() => window.ready)
await p.evaluate(() => window.rpc('open', []))
await writeFile(
  out,
  Buffer.from(await p.evaluate(async () => Array.from(await window.rpc('exportDatabase', [])))),
)
await ctx.close()
server.close()
