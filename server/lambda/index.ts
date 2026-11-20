import { SSMClient } from '@aws-sdk/client-ssm';
import { createAdapters, loadConfig } from '../config';
import { handle, loadSecrets, type HttpEvent } from './handler';

/**
 * The one Lambda entry point. All three functions (Bills, UploadUrl, ParseReceipt) run this same
 * bundle; template.yaml decides which routes reach which function and what each may access.
 */

// Top-level await runs in Lambda's init phase, outside the function timeout. Warm requests reuse
// the adapters and decrypted secrets; if setup throws, Lambda runs init again on the next request.
const deps = createAdapters(loadConfig({ ...process.env, ...(await loadSecrets(process.env, new SSMClient({}))) }));

export const handler = (event: HttpEvent) => handle(deps, event);
