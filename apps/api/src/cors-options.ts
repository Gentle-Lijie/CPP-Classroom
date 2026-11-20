import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js'

export function corsOptions(webOrigin: string): CorsOptions {
  return {
    origin: webOrigin || true,
    credentials: true,
    allowedHeaders: ['Accept', 'Content-Type'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }
}
