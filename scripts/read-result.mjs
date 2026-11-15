const [pin] = process.argv.slice(2);
const token = process.env.PROFELINK_ACCESS_TOKEN;
const api = process.env.PROFELINK_API_URL;

if (!/^\d{6}$/.test(pin ?? '') || !token || !api) {
  console.error('Configura PROFELINK_API_URL y PROFELINK_ACCESS_TOKEN, y pasa el PIN de seis dígitos.');
  process.exit(1);
}

try {
  const url = new URL(`results/${pin}`, `${api.replace(/\/+$/, '')}/`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} al consultar resultados`);
  console.log(JSON.stringify(await response.json(), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
