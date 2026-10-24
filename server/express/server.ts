import { bootstrap } from '../bootstrap';
import { createAdapters, loadConfig } from '../config';
import { createApp } from './app';

const config = loadConfig();
const adapters = createAdapters(config);
await bootstrap({ dynamo: adapters.dynamo, s3: adapters.s3, tableName: config.tableName, bucket: config.bucket });

const port = Number(process.env.PORT ?? 3000);
createApp(adapters).listen(port, () => {
  console.log(`HarnGun API listening on :${port} (${config.mockAi ? 'mock AI' : `Bedrock ${config.bedrockModelId}`})`);
});
