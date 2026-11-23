import { NextResponse } from 'next/server'
import { isDemo } from '@/lib/demo/mode'
import { tailnetConfig } from '@/lib/http/doors'
import { guardRequest } from '@/lib/http/guard'

export function proxy(request: Request) {
  return guardRequest(request, isDemo(), tailnetConfig()) ?? NextResponse.next()
}
