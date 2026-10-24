import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { receiptFixtures } from '@harngun/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { BedrockParser, ReceiptParseError } from '../../../adapters/parser/bedrockParser';
import { receiptSchema } from '../../../adapters/parser/receiptSchema';

const receipt = receiptFixtures['restaurant-sc-vat-discount']!;
const image = new Uint8Array([0xff, 0xd8, 0xff]);

/** Stands in for BedrockRuntimeClient: records the request and replies with `content`. */
function fakeClient(content: unknown[], stopReason = 'tool_use') {
  const sent: ConverseCommand[] = [];
  return {
    sent,
    client: { send: async (command: ConverseCommand) => (sent.push(command), { output: { message: { content } }, stopReason }) },
  };
}

const parserFor = (client: { send: unknown }) => new BedrockParser(client as never, 'test-model');

describe('BedrockParser', () => {
  it('sends the image with a forced receipt tool and returns the tool input', async () => {
    const { client, sent } = fakeClient([{ toolUse: { toolUseId: 't1', name: 'record_receipt', input: receipt } }]);

    expect(await parserFor(client).parse(image)).toEqual(receipt);

    const input = sent[0]!.input;
    expect(input.modelId).toBe('test-model');
    expect(input.messages?.[0]?.content?.[0]).toEqual({ image: { format: 'jpeg', source: { bytes: image } } });
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: 'record_receipt' } });
    expect(input.toolConfig?.tools?.[0]?.toolSpec?.inputSchema?.json).toMatchObject({ type: 'object' });
  });

  it('fails clearly when the model answers in prose instead of the tool', async () => {
    const { client } = fakeClient([{ text: 'I cannot read this receipt.' }], 'end_turn');

    await expect(parserFor(client).parse(image)).rejects.toThrow(ReceiptParseError);
  });

  it('rejects a tool reply that does not match the schema', async () => {
    const broken = { ...receipt, items: [{ ...receipt.items[0], unitPrice: 'two hundred' }] };
    const { client } = fakeClient([{ toolUse: { toolUseId: 't1', name: 'record_receipt', input: broken } }]);

    await expect(parserFor(client).parse(image)).rejects.toThrow(/invalid receipt/);
  });

  it('accepts every fixture, so mock and live output share one shape', () => {
    for (const fixture of Object.values(receiptFixtures)) expect(receiptSchema.safeParse(fixture).success).toBe(true);
  });
});
