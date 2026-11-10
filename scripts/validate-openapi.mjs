import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

try {
  await SwaggerParser.validate(
    fileURLToPath(new URL('../docs/openapi.json', import.meta.url)),
  );
  console.log('OpenAPI válido; referencias y esquemas verificados.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
