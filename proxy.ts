import { NextResponse } from 'next/server'
import { isDemo } from '@/lib/demo/mode'
import { guardRequest } from '@/lib/http/guard'

export function proxy(request: Request) {
  return guardRequest(request, isDemo()) ?? NextResponse.next()
}
