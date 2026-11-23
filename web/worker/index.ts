import '@/web/lib/zod-jitless'
import { expose, type Port } from '@/web/lib/rpc'
import { api } from './api'

expose(api, self as unknown as Port)
