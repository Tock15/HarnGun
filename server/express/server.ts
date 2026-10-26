import { bootstrap } from '../bootstrap';
import { createAdapters, loadConfig } from '../config';
import { createApp } from './app';

const config = loadConfig();
const adapters = createAdapters(config);
await bootstrap({ dynamo: adapters.dynamo, s3: adapters.s3, tableName: config.tableName, bucket: config.bucket });

const port = Number(process.env.PORT ?? 3000);
const parser = config.mockAi ? 'mock AI' : config.geminiApiKey ? `Gemini ${config.geminiModel}` : `Bedrock ${config.bedrockModelId}`;
createApp(adapters).listen(port, () => {
  console.log(`HarnGun API listening on :${port} (${parser})`);
});
