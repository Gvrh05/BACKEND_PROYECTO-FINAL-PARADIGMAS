async function main() {
  const {
    default: dataSource,
  } = require('../dist/shared/database/data-source.js');
  try {
    await dataSource.initialize();
    await dataSource.query('SELECT 1');
    console.log('Conexión PostgreSQL verificada (sin modificar el esquema).');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch(() => {
  console.error(
    'No se pudo verificar PostgreSQL; revisa DATABASE_URL y el servidor.',
  );
  process.exitCode = 1;
});
