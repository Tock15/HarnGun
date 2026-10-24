import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DevAuth } from './adapters/auth/devAuth';
import { DynamoBillRepository } from './adapters/dynamo/dynamoBillRepository';
import { BedrockParser } from './adapters/parser/bedrockParser';
import { MockParser } from './adapters/parser/mockParser';
import { S3ImageStorage } from './adapters/s3/s3ImageStorage';

// The only place that reads environment variables (02-ARCHITECTURE.md §3.1).

export interface Config {
  /** Unset = real AWS. */
  databaseEndpoint?: string;
  tableName: string;
  s3Endpoint?: string;
  /** Host the browser uploads to; presigned POSTs are signed for it. Defaults to s3Endpoint. */
  s3PublicEndpoint?: string;
  bucket: string;
  s3ForcePathStyle: boolean;
  /** Explicit credentials for local storage (RustFS). Unset = standard AWS credential chain. */
  localCredentials?: { accessKeyId: string; secretAccessKey: string };
  region: string;
  devAuthSecret: string;
  mockAi: boolean;
  /** Fixture MockParser returns; unset = its default. */
  mockFixture?: string;
  bedrockRegion: string;
  bedrockModelId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = [];
  const required = (name: string) => {
    const value = env[name];
    if (!value) missing.push(name);
    return value ?? '';
  };

  const mockAi = env.MOCK_AI !== 'false';
  const config: Config = {
    databaseEndpoint: env.DATABASE_ENDPOINT || undefined,
    tableName: required('TABLE_NAME'),
    s3Endpoint: env.S3_ENDPOINT || undefined,
    s3PublicEndpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT || undefined,
    bucket: required('S3_BUCKET'),
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    localCredentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
    region: env.AWS_REGION || 'ap-southeast-1',
    devAuthSecret: required('DEV_AUTH_SECRET'),
    mockAi,
    mockFixture: env.MOCK_FIXTURE || undefined,
    bedrockRegion: mockAi ? env.BEDROCK_REGION ?? '' : required('BEDROCK_REGION'),
    bedrockModelId: mockAi ? env.BEDROCK_MODEL_ID ?? '' : required('BEDROCK_MODEL_ID'),
  };

  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  return config;
}

export function createDynamoClient(config: Config) {
  return new DynamoDBClient({
    region: config.region,
    endpoint: config.databaseEndpoint,
    // DynamoDB Local needs letters/digits-only keys and its own pair (not the storage keys); AWS uses the default chain.
    credentials: config.databaseEndpoint ? { accessKeyId: 'local', secretAccessKey: 'local' } : undefined,
  });
}

/** Builds every adapter from config: the hand-written equivalent of Spring's @Configuration. */
export function createAdapters(config: Config) {
  const dynamo = createDynamoClient(config);
  const s3 = createS3Client(config);
  return {
    dynamo,
    s3,
    bills: new DynamoBillRepository(dynamo, config.tableName),
    images: new S3ImageStorage(s3, createS3Client(config, config.s3PublicEndpoint), config.bucket),
    parser: config.mockAi
      ? new MockParser(config.mockFixture)
      : // Bedrock uses the standard AWS credential chain (e.g. `aws login`), never the local keys.
        new BedrockParser(new BedrockRuntimeClient({ region: config.bedrockRegion }), config.bedrockModelId),
    auth: new DevAuth(config.devAuthSecret),
  };
}

export function createS3Client(config: Config, endpoint = config.s3Endpoint) {
  return new S3Client({
    region: config.region,
    endpoint,
    forcePathStyle: config.s3ForcePathStyle,
    credentials: config.s3Endpoint ? config.localCredentials : undefined,
  });
}
