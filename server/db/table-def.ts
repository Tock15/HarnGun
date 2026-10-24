import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

// Single source of truth for HarnGun_Main (02-ARCHITECTURE.md §6). template.yaml must mirror it.

/** Epoch-seconds attribute DynamoDB TTL deletes on (abandoned DRAFT bills). Enabled by bootstrap. */
export const TTL_ATTRIBUTE = 'expiresAt';

export function tableDefinition(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        // Host history (Phase 2): GSI1PK = HOST#<hostId>, GSI1SK = createdAt.
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}
