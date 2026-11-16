/** Exact allowlist shared by REST and Socket.IO. Never reflect arbitrary origins. */
export function corsOrigins(value = process.env.CORS_ORIGIN): string[] {
  return (value || 'http://localhost:5173').split(',').map((entry) => {
    const origin = entry.trim();
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(
        'CORS_ORIGIN debe contener orígenes HTTP(S) exactos separados por coma, sin ruta ni barra final',
      );
    }
    return origin;
  });
}
