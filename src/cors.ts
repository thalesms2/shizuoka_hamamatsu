import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

type OriginCallback = (error: Error | null, allow?: boolean) => void;

const allowedOrigins = (): string[] =>
  (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const corsOptions = (): CorsOptions & {
  origin: (origin: string | undefined, callback: OriginCallback) => void;
} => ({
  origin(origin: string | undefined, callback: OriginCallback) {
    if (!origin || allowedOrigins().includes(origin)) {
      callback(null, true);

      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
