/**
 * Currency and unit conversion utilities
 * Extensible structure for adding more conversion types
 */

const Converters = {
  /**
   * Convert currency amount from one currency to another
   * @param {number} amount - The amount to convert
   * @param {string} from - Source currency code (e.g., 'INR', 'USD')
   * @param {string} to - Target currency code
   * @param {object} rates - Exchange rates object with USD as base
   * @returns {number} Converted amount
   */
  convertCurrency(amount, from, to, rates) {
    if (from === to) return amount;

    // Convert to USD first (base currency), then to target
    const amountInUSD = from === 'USD' ? amount : amount / rates[from];
    const convertedAmount = to === 'USD' ? amountInUSD : amountInUSD * rates[to];

    return convertedAmount;
  },

  /**
   * Format currency for display
   * @param {number} amount - The amount to format
   * @param {string} currency - Currency code
   * @returns {string} Formatted currency string
   */
  formatCurrency(amount, currency) {
    const symbols = {
      'USD': '$',
      'INR': '₹'
    };

    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);

    return `${symbols[currency] || currency + ' '}${formatted}`;
  },

  /**
   * Convert units (for future cm/inches support)
   * @param {number} value - The value to convert
   * @param {string} from - Source unit
   * @param {string} to - Target unit
   * @returns {number} Converted value
   */
  convertUnits(value, from, to) {
    const conversions = {
      'cm_to_inches': 0.393701,
      'inches_to_cm': 2.54,
      'm_to_feet': 3.28084,
      'feet_to_m': 0.3048,
      'kg_to_lbs': 2.20462,
      'lbs_to_kg': 0.453592
    };

    const key = `${from}_to_${to}`;
    if (conversions[key]) {
      return value * conversions[key];
    }

    return value;
  },

  /**
   * Format unit value for display
   * @param {number} value - The value to format
   * @param {string} unit - Unit type
   * @returns {string} Formatted unit string
   */
  formatUnit(value, unit) {
    const unitLabels = {
      'cm': 'cm',
      'inches': 'in',
      'm': 'm',
      'feet': 'ft',
      'kg': 'kg',
      'lbs': 'lbs'
    };

    return `${value.toFixed(2)} ${unitLabels[unit] || unit}`;
  }
};

// Make available globally for content scripts
if (typeof window !== 'undefined') {
  window.Converters = Converters;
}
