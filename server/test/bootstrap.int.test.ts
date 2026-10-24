import { DescribeTableCommand, DescribeTimeToLiveCommand } from '@aws-sdk/client-dynamodb';
import { GetBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { bootstrap } from '../bootstrap';
import { integrationSetup } from './helpers/integration';

describe('bootstrap', () => {
  it('creates the table with TTL and the bucket with a 7-day rule, and can run again', async () => {
    const { config, dynamo, s3 } = await integrationSetup();
    // Second run must be a no-op, as on every container restart.
    await bootstrap({ dynamo, s3, tableName: config.tableName, bucket: config.bucket }, { attempts: 1 });

    const table = await dynamo.send(new DescribeTableCommand({ TableName: config.tableName }));
    expect(table.Table?.KeySchema?.map((k) => k.AttributeName)).toEqual(['PK', 'SK']);
    expect(table.Table?.GlobalSecondaryIndexes?.[0]?.IndexName).toBe('GSI1');

    const ttl = await dynamo.send(new DescribeTimeToLiveCommand({ TableName: config.tableName }));
    expect(ttl.TimeToLiveDescription?.AttributeName).toBe('expiresAt');

    const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: config.bucket }));
    expect(lifecycle.Rules?.[0]?.Expiration?.Days).toBe(7);
  });
});
