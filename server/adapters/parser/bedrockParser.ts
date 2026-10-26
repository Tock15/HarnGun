import { ConverseCommand, type BedrockRuntimeClient, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import type { ParsedReceipt } from '@harngun/shared';
import type { ReceiptParser } from '../../ports';
import { RECEIPT_RULES, ReceiptParseError, receiptJsonSchema, receiptSchema } from './receiptSchema';

const TOOL_NAME = 'record_receipt';

const PROMPT = `Read this Thai restaurant receipt and record it with the ${TOOL_NAME} tool.
${RECEIPT_RULES}`;

/** Only `send` is used, so tests can pass a fake client. */
type ConverseClient = Pick<BedrockRuntimeClient, 'send'>;

export class BedrockParser implements ReceiptParser {
  constructor(
    private readonly client: ConverseClient,
    private readonly modelId: string,
  ) {}

  async parse(image: Uint8Array): Promise<ParsedReceipt> {
    const response = (await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [{ role: 'user', content: [{ image: { format: 'jpeg', source: { bytes: image } } }, { text: PROMPT }] }],
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: TOOL_NAME,
                description: 'Records the items and totals printed on a receipt.',
                inputSchema: { json: receiptJsonSchema as never },
              },
            },
          ],
          // Forces a tool call, so the reply is structured JSON rather than prose.
          toolChoice: { tool: { name: TOOL_NAME } },
        },
        inferenceConfig: { maxTokens: 4096, temperature: 0 },
      }),
    )) as ConverseCommandOutput;

    const toolUse = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse;
    if (!toolUse) throw new ReceiptParseError(`Model did not return a receipt (stopReason: ${response.stopReason})`);

    const result = receiptSchema.safeParse(toolUse.input);
    if (!result.success) throw new ReceiptParseError(`Model returned an invalid receipt: ${result.error.message}`);
    return result.data;
  }
}
