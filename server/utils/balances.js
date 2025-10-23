import BigNumber from "~/lib/bignumber.config";

// CORE CONVERSION UTILITIES

/**
 * Validate that a value is a valid number
 * @param {*} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {Error} If value is invalid
 */
function validateNumber(value, paramName = 'number') {
  if (value === null || value === undefined) {
    throw new Error(`${paramName} cannot be null or undefined`);
  }

  const bn = new BigNumber(value);

  if (bn.isNaN()) {
    throw new Error(`${paramName} is not a valid number: ${value}`);
  }

  if (!bn.isFinite()) {
    throw new Error(`${paramName} must be finite: ${value}`);
  }

  return bn;
}


/**
 * Validate decimals parameter
 * @param {number} decimals - Token decimals
 * @throws {Error} If decimals is invalid
 */
function validateDecimals(decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new Error(`Decimals must be an integer between 0 and 30, got: ${decimals}`);
  }
}


/**
 * Convert human-readable amount to smallest unit (wei/satoshi)
 * @param {string|number} amount - Human readable amount (e.g., "10.25")
 * @param {number} decimals - Token decimals (18 for ETH, 8 for BTC)
 * @returns {string} Amount in smallest unit
 */
export function toSmallestUnit(amount, decimals) {
  validateDecimals(decimals);
  const bn = validateNumber(amount, 'amount');

  if (bn.isNegative()) {
    throw new Error(`Amount cannot be negative: ${amount}`);
  }

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
  validateDecimals(decimals);
  const bn = validateNumber(smallestUnit, 'smallestUnit');

  const divisor = new BigNumber(10).pow(decimals);
  return bn.dividedBy(divisor).toFixed();
}

/**
 * Add two amounts in smallest units
 */
export function add(amount1, amount2) {
  const bn1 = validateNumber(amount1, 'amount1');
  const bn2 = validateNumber(amount2, 'amount2');
  return bn1.plus(bn2).toFixed(0);
}

/**
 * Subtract two amounts in smallest units
 */
export function subtract(amount1, amount2) {
  const bn1 = validateNumber(amount1, 'amount1');
  const bn2 = validateNumber(amount2, 'amount2');
  return bn1.minus(bn2).toFixed(0);
}

/**
 * Multiply amount in smallest units by a multiplier
 * IMPORTANT: Multiplier can be decimal (e.g., for percentages like 0.01 for 1%)
 * Result is rounded down to maintain integer smallest units
 * @param {string} amount - Amount in smallest units
 * @param {string|number} multiplier - Multiplier (can be decimal)
 * @returns {string} Result in smallest units (rounded down)
 */
export function multiply(amount, multiplier) {
  const bn = validateNumber(amount, 'amount');
  const mult = validateNumber(multiplier, 'multiplier');

  // Multiply and round down to maintain integer smallest units
  return bn.multipliedBy(mult).integerValue(BigNumber.ROUND_DOWN).toFixed(0);
}

/**
 * Divide amount in smallest units by a divisor
 * IMPORTANT: Result is rounded down to maintain integer smallest units
 * This may result in precision loss for non-exact divisions
 * @param {string} amount - Amount in smallest units
 * @param {string|number} divisor - Divisor
 * @returns {string} Result in smallest units (rounded down)
 */
export function divide(amount, divisor) {
  if (isZero(divisor)) {
    throw new Error('Cannot divide by zero');
  }

  const bn = validateNumber(amount, 'amount');
  const div = validateNumber(divisor, 'divisor');

  // Divide and round down to maintain integer smallest units
  return bn.dividedBy(div).integerValue(BigNumber.ROUND_DOWN).toFixed(0);
}


/**
 * Calculate percentage of an amount
 * @param {string} amount - Amount in smallest units
 * @param {string|number} percentage - Percentage (e.g., 1.5 for 1.5%)
 * @returns {string} Percentage amount in smallest units (rounded down)
 */
export function percentage(amount, percentage) {
  const percentDecimal = new BigNumber(percentage).dividedBy(100);
  return multiply(amount, percentDecimal.toFixed());
}

/**
 * Compare two amounts in smallest units
 * @returns {number} -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 */
export function compare(amount1, amount2) {
  const bn1 = validateNumber(amount1, 'amount1');
  const bn2 = validateNumber(amount2, 'amount2');
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
 * Check if amount is zero
 */
export function isZero(amount) {
  const bn = validateNumber(amount, 'amount');
  return bn.isZero();
}


/**
 * Check if amount is positive
 */
export function isPositive(amount) {
  const bn = validateNumber(amount, 'amount');
  return bn.isPositive();
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
