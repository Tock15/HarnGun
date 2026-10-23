// Mock AI output for MOCK_AI=true and tests. Replace or extend with real Bedrock POC output.
import type { ParsedReceipt } from '../src/types';
import cafeVatInclusive from './cafe-vat-inclusive.json';
import restaurantScVatDiscount from './restaurant-sc-vat-discount.json';
import thermalSlipModifiers from './thermal-slip-modifiers.json';

export const receiptFixtures: Record<string, ParsedReceipt> = {
  'cafe-vat-inclusive': cafeVatInclusive as ParsedReceipt,
  'restaurant-sc-vat-discount': restaurantScVatDiscount as ParsedReceipt,
  'thermal-slip-modifiers': thermalSlipModifiers as ParsedReceipt,
};
