// AEGIS Server Configuration — single source, validated at startup

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: process.env.DATA_DIR ?? join(process.cwd(), 'data'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  logger: process.env.NODE_ENV !== 'production',
} as const;

function join(...parts: string[]): string {
  return parts.join('/');
}