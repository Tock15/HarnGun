import { fileURLToPath } from 'node:url';
import { bootstrap } from '../../bootstrap';
import { createDynamoClient, createS3Client, loadConfig } from '../../config';

/** Config and clients for the containers in docker-compose.dev.yml, with the table and bucket created. */
export async function integrationSetup() {
  process.loadEnvFile(fileURLToPath(new URL('../../dev.env', import.meta.url)));
  const config = loadConfig();
  const dynamo = createDynamoClient(config);
  const s3 = createS3Client(config);
  await bootstrap({ dynamo, s3, tableName: config.tableName, bucket: config.bucket }, { attempts: 3 });
  return { config, dynamo, s3 };
}
