import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand, type S3Client } from '@aws-sdk/client-s3';
import { tableDefinition, TTL_ATTRIBUTE } from './db/table-def';

// Creates the table and bucket if missing (08-OS_COURSE_REQUIREMENTS.md §3). Safe to run on every start.

export interface BootstrapTargets {
  dynamo: DynamoDBClient;
  s3: S3Client;
  tableName: string;
  bucket: string;
}

const RECEIPT_RETENTION_DAYS = 7;

export async function bootstrap(targets: BootstrapTargets, { attempts = 10, firstDelayMs = 500 } = {}) {
  await retry(() => ensureTable(targets), attempts, firstDelayMs);
  await retry(() => ensureBucket(targets), attempts, firstDelayMs);
}

async function ensureTable({ dynamo, tableName }: BootstrapTargets) {
  try {
    await dynamo.send(new CreateTableCommand(tableDefinition(tableName)));
  } catch (error) {
    if (!(error instanceof ResourceInUseException)) throw error;
  }
  await waitUntilTableExists({ client: dynamo, maxWaitTime: 30 }, { TableName: tableName });

  const ttl = await dynamo.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
  const status = ttl.TimeToLiveDescription?.TimeToLiveStatus;
  if (status !== 'ENABLED' && status !== 'ENABLING') {
    await dynamo.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: { AttributeName: TTL_ATTRIBUTE, Enabled: true },
      }),
    );
  }
}

async function ensureBucket({ s3, bucket }: BootstrapTargets) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  // Putting the same rule again is a no-op, so this runs every time.
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          { ID: 'expire-receipts', Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: RECEIPT_RETENTION_DAYS } },
        ],
      },
    }),
  );
}

/** Retries with doubling delays while the containers start up. */
async function retry(fn: () => Promise<void>, attempts: number, firstDelayMs: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = firstDelayMs * 2 ** (attempt - 1);
      console.warn(`bootstrap: attempt ${attempt} failed (${(error as Error).name}), retrying in ${delay} ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
