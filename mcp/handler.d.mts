import type { IncomingMessage, ServerResponse } from 'node:http'

export const TOKEN: string
export function middleware(req: IncomingMessage, res: ServerResponse, next?: () => void): void
