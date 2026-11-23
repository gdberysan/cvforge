// next/server inside the Worker: a route handler's NextResponse is a Response.
export class NextResponse extends Response {
  static override json(data: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return new NextResponse(JSON.stringify(data), { ...init, headers })
  }
}
export type NextRequest = Request
