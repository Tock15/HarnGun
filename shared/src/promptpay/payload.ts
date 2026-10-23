import type { PromptPayIdType, Satang } from '../types';
import { satangToBahtString } from '../math/money';

const PROMPTPAY_AID = 'A000000677010111';
const CURRENCY_THB = '764';

/** One EMVCo field: 2-digit id, 2-digit length, value. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 uppercase hex digits. Payloads are ASCII only. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normalizes a PromptPay ID to the 13-digit form used in the QR:
 * phone 081-234-5678 / +66812345678 → 0066812345678; national ID → its 13 digits.
 */
export function normalizePromptPayId(id: string, type: PromptPayIdType): string {
  const digits = id.replace(/[\s-]/g, '');
  if (type === 'PHONE') {
    const local = digits.replace(/^\+?66/, '0');
    if (!/^0\d{9}$/.test(local)) throw new RangeError(`Invalid Thai mobile number: ${id}`);
    return `0066${local.slice(1)}`;
  }
  if (!/^\d{13}$/.test(digits)) throw new RangeError(`Invalid national ID (needs 13 digits): ${id}`);
  return digits;
}

export interface PromptPayRequest {
  id: string;
  type: PromptPayIdType;
  /** Amount to transfer, in satang. Must be greater than 0. */
  amount: Satang;
}

/**
 * Builds the Thai QR (EMVCo) payload that banking apps read as a PromptPay transfer with a
 * fixed amount. Render the returned string as a QR code; this function does not draw it.
 */
export function generatePromptPayPayload({ id, type, amount }: PromptPayRequest): string {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`Amount must be a positive whole number of satang, got ${amount}`);
  }
  const account = field('00', PROMPTPAY_AID) + field(type === 'PHONE' ? '01' : '02', normalizePromptPayId(id, type));
  const body =
    field('00', '01') + // payload format
    field('01', '12') + // one-time QR with an amount
    field('29', account) +
    field('58', 'TH') +
    field('53', CURRENCY_THB) +
    field('54', satangToBahtString(amount)) +
    '6304'; // CRC field header; the checksum covers it
  return body + crc16(body);
}
