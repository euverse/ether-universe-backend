import BigNumber from "~/lib/bignumber.config";


// ============================================
// CORE CONVERSION UTILITIES
// ============================================

/**
 * Convert human-readable amount to smallest unit (wei/satoshi)
 * @param {string|number} amount - Human readable amount (e.g., "10.25")
 * @param {number} decimals - Token decimals (18 for ETH, 8 for BTC)
 * @returns {string} Amount in smallest unit
 */
export function toSmallestUnit(amount, decimals) {
  const bn = new BigNumber(amount);
  const multiplier = new BigNumber(10).pow(decimals);
  return bn.multipliedBy(multiplier).toFixed(0);
}

/**
 * Convert smallest unit to human-readable amount
 * @param {string} smallestUnit - Amount in smallest unit (wei/satoshi)
 * @param {number} decimals - Token decimals
 * @returns {string} Human readable amount
 */
export function toReadableUnit(smallestUnit, decimals) {
  const bn = new BigNumber(smallestUnit);
  const divisor = new BigNumber(10).pow(decimals);
  return bn.dividedBy(divisor).toFixed();
}

/**
 * Add two amounts in smallest units
 */
export function add(amount1, amount2) {
  const bn1 = new BigNumber(amount1 || '0');
  const bn2 = new BigNumber(amount2 || '0');
  return bn1.plus(bn2).toFixed(0);
}

/**
 * Subtract two amounts in smallest units
 */
export function subtract(amount1, amount2) {
  const bn1 = new BigNumber(amount1 || '0');
  const bn2 = new BigNumber(amount2 || '0');
  return bn1.minus(bn2).toFixed(0);
}

/**
 * Multiply amount in smallest units
 */
export function multiply(amount, multiplier) {
  const bn = new BigNumber(amount || '0');
  const mult = new BigNumber(multiplier);
  return bn.multipliedBy(mult).toFixed(0);
}

/**
 * Divide amount in smallest units
 */
export function divide(amount, divisor) {
  const bn = new BigNumber(amount || '0');
  const div = new BigNumber(divisor);
  return bn.dividedBy(div).toFixed(0);
}

/**
 * Compare two amounts in smallest units
 * @returns {number} -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 */
export function compare(amount1, amount2) {
  const bn1 = new BigNumber(amount1 || '0');
  const bn2 = new BigNumber(amount2 || '0');
  return bn1.comparedTo(bn2);
}

/**
 * Check if amount1 >= amount2
 */
export function isGreaterOrEqual(amount1, amount2) {
  return compare(amount1, amount2) >= 0;
}

/**
 * Check if amount1 > amount2
 */
export function isGreater(amount1, amount2) {
  return compare(amount1, amount2) > 0;
}

/**
 * Get minimum of two amounts
 */
export function min(amount1, amount2) {
  return compare(amount1, amount2) <= 0 ? amount1 : amount2;
}

/**
 * Get maximum of two amounts
 */
export function max(amount1, amount2) {
  return compare(amount1, amount2) >= 0 ? amount1 : amount2;
}

