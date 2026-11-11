export async function authenticateDemoAccount(): Promise<{
  id: string;
  username: string;
  role: string;
}> {
  const base = (process.env.AUTH_SERVICE_URL || 'http://localhost:3001')
    .replace(/\/$/, '')
    .replace(/\/auth$/, '');
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error('DEMO_USER_PASSWORD es obligatorio');
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.DEMO_USER_USERNAME || 'profesor_test',
      password,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      `Provisiona la cuenta demo en Auth antes del seed (HTTP ${response.status})`,
    );
  const result = (await response.json()) as {
    user: { id: string; username: string; role: string; isSystem: boolean };
  };
  if (!result.user || result.user.role !== 'MASTER' || !result.user.isSystem)
    throw new Error('La cuenta demo debe ser MASTER de sistema');
  return result.user;
}
