import { z } from 'zod'
import { AiError } from '@/lib/ai/errors'
import { type CvInput, parseCv, validateReferentialIntegrity } from '@/lib/ai/stages/parse-cv'
import { isDemo } from '@/lib/demo/mode'
import { UndatedRoleError } from '@/lib/import/dates'

const MAX_PDF_BYTES = 10 * 1024 * 1024
/** Base64 inflates by 4/3; anything past this decodes to more than 10MB. */
const MAX_PDF_BASE64 = Math.ceil(MAX_PDF_BYTES / 3) * 4

const TextBody = z.object({ text: z.string().min(50).max(50_000) })
const PdfBody = z.object({ pdf: z.string().min(100) })

/** Every PDF starts with "%PDF", which is "JVBERi" in base64. */
const PDF_MAGIC = 'JVBERi'

const encoder = new TextEncoder()

function readInput(payload: unknown): { input: CvInput } | { error: string; code: string } {
  if (payload && typeof payload === 'object' && 'pdf' in payload) {
    const body = PdfBody.safeParse(payload)
    if (!body.success) {
      return { error: 'That file could not be read as a PDF.', code: 'not-a-pdf' }
    }
    if (body.data.pdf.length > MAX_PDF_BASE64) {
      return {
        error: 'PDF over 10MB. Export a lighter copy and try again.',
        code: 'pdf-too-large',
      }
    }
    if (!body.data.pdf.startsWith(PDF_MAGIC)) {
      return { error: 'That file is not a PDF.', code: 'not-a-pdf' }
    }
    return { input: { pdf: body.data.pdf } }
  }

  const body = TextBody.safeParse(payload)
  if (!body.success) {
    return { error: 'Paste at least 50 characters of CV text.', code: 'cv-too-short' }
  }
  return { input: { text: body.data.text } }
}

/**
 * Streams progress as Server-Sent Events. Parsing is two real model calls
 * (profile skeleton, then evidence), 20-40 seconds together — the stages
 * emitted here are those calls, not a decorative timeline. Validation
 * failures answer as plain JSON before the stream starts.
 */
export async function POST(request: Request) {
  // Demo: importing a CV is a write; refused with the friendly code.
  if (isDemo()) {
    return new Response(JSON.stringify({ error: 'Demo is read-only.', code: 'demo-read-only' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })
  }

  const read = readInput(await request.json().catch(() => undefined))
  if ('error' in read) {
    return new Response(JSON.stringify({ error: read.error, code: read.code }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  let open = true
  const stream = new ReadableStream({
    cancel() {
      open = false
    },
    async start(controller) {
      const send = (event: unknown) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          open = false
        }
      }

      try {
        const { parsed, problems } = await parseCv(read.input, (stage) => send({ stage }))
        send({
          done: true,
          parsed,
          problems: [...problems, ...validateReferentialIntegrity(parsed)],
        })
      } catch (error) {
        // Errors travel as events: the response already committed a 200 with
        // the stream, so a status code is no longer available to carry them.
        send(
          error instanceof AiError
            ? { error: error.userMessage, code: error.kind }
            : error instanceof UndatedRoleError
              ? { error: error.message, code: error.code }
              : { error: 'Unexpected error parsing the CV.', code: 'unexpected' },
        )
      } finally {
        if (open) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
