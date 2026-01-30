# Multi-Currency Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform BrowseAbroad from a hardcoded USD↔INR converter to a multi-currency tool where users pick a home currency and all detected foreign prices (USD, EUR, GBP, INR) convert on hover.

**Architecture:** New `src/config/currencies.config.js` centralizes currency definitions. Detector, converter, content script, and popup all read from this config instead of hardcoded values. The API already returns 150+ rates — we just stop discarding them.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3, Vitest for testing.

**Design Document:** `docs/plans/2026-01-30-multi-currency-support-design.md`

---

### Task 1: Create currency configuration file

**Files:**
- Create: `chrome-extension/src/config/currencies.config.js`
- Test: `chrome-extension/tests/unit/currencies.config.test.js`

**Step 1: Write the failing test**

Create `chrome-extension/tests/unit/currencies.config.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { loadWindowModule } from '../helpers/load-module.js';

describe('CurrenciesConfig', () => {
  let SUPPORTED_CURRENCIES, LOCALE_CURRENCY_MAP, getDefaultHomeCurrency;

  beforeEach(() => {
    const window = loadWindowModule('src/config/currencies.config.js');
    SUPPORTED_CURRENCIES = window.SUPPORTED_CURRENCIES;
    LOCALE_CURRENCY_MAP = window.LOCALE_CURRENCY_MAP;
    getDefaultHomeCurrency = window.getDefaultHomeCurrency;
  });

  describe('SUPPORTED_CURRENCIES', () => {
    it('should define USD, INR, EUR, GBP', () => {
      expect(SUPPORTED_CURRENCIES).toBeDefined();
      expect(Object.keys(SUPPORTED_CURRENCIES)).toEqual(
        expect.arrayContaining(['USD', 'INR', 'EUR', 'GBP'])
      );
      expect(Object.keys(SUPPORTED_CURRENCIES).length).toBe(4);
    });

    it('should have required fields for each currency', () => {
      Object.values(SUPPORTED_CURRENCIES).forEach(currency => {
        expect(currency.symbol).toBeDefined();
        expect(currency.code).toBeDefined();
        expect(currency.name).toBeDefined();
        expect(currency.locale).toBeDefined();
        expect(currency.detectPatterns).toBeDefined();
        expect(Array.isArray(currency.detectPatterns)).toBe(true);
        expect(currency.detectPatterns.length).toBeGreaterThan(0);
      });
    });

    it('should have correct symbols', () => {
      expect(SUPPORTED_CURRENCIES.USD.symbol).toBe('$');
      expect(SUPPORTED_CURRENCIES.INR.symbol).toBe('₹');
      expect(SUPPORTED_CURRENCIES.EUR.symbol).toBe('€');
      expect(SUPPORTED_CURRENCIES.GBP.symbol).toBe('£');
    });
  });

  describe('LOCALE_CURRENCY_MAP', () => {
    it('should map US to USD', () => {
      expect(LOCALE_CURRENCY_MAP['US']).toBe('USD');
    });

    it('should map GB to GBP', () => {
      expect(LOCALE_CURRENCY_MAP['GB']).toBe('GBP');
    });

    it('should map IN to INR', () => {
      expect(LOCALE_CURRENCY_MAP['IN']).toBe('INR');
    });

    it('should map eurozone countries to EUR', () => {
      ['DE', 'FR', 'ES', 'IT', 'NL', 'AT', 'BE', 'PT', 'IE', 'FI'].forEach(code => {
        expect(LOCALE_CURRENCY_MAP[code]).toBe('EUR');
      });
    });
  });

  describe('getDefaultHomeCurrency', () => {
    it('should return USD for en-US locale', () => {
      expect(getDefaultHomeCurrency('en-US')).toBe('USD');
    });

    it('should return GBP for en-GB locale', () => {
      expect(getDefaultHomeCurrency('en-GB')).toBe('GBP');
    });

    it('should return INR for hi-IN locale', () => {
      expect(getDefaultHomeCurrency('hi-IN')).toBe('INR');
    });

    it('should return EUR for de-DE locale', () => {
      expect(getDefaultHomeCurrency('de-DE')).toBe('EUR');
    });

    it('should return USD as fallback for unknown locale', () => {
      expect(getDefaultHomeCurrency('xx-YY')).toBe('USD');
    });

    it('should return USD for locale without country code', () => {
      expect(getDefaultHomeCurrency('en')).toBe('USD');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd chrome-extension && npm test -- tests/unit/currencies.config.test.js
```

Expected: FAIL — file `src/config/currencies.config.js` does not exist.

**Step 3: Write the implementation**

Create `chrome-extension/src/config/currencies.config.js`:

```javascript
/**
 * Currency configuration
 * Central source of truth for all supported currencies
 */

const SUPPORTED_CURRENCIES = {
  USD: {
    symbol: '$',
    code: 'USD',
    name: 'US Dollar',
    locale: 'en-US',
    detectPatterns: [
      /(?<![A-Z])\$\s*([\d,]+(?:\.\d{1,2})?)/g,
      /USD\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /US\$\s*([\d,]+(?:\.\d{1,2})?)/gi
    ]
  },
  INR: {
    symbol: '₹',
    code: 'INR',
    name: 'Indian Rupee',
    locale: 'en-IN',
    detectPatterns: [
      /₹\s*([\d,]+(?:\.\d{1,2})?)/g,
      /\bRs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /INR\s*([\d,]+(?:\.\d{1,2})?)/gi
    ]
  },
  EUR: {
    symbol: '€',
    code: 'EUR',
    name: 'Euro',
    locale: 'de-DE',
    detectPatterns: [
      /€\s*([\d,]+(?:\.\d{1,2})?)/g,
      /EUR\s*([\d,]+(?:\.\d{1,2})?)/gi
    ]
  },
  GBP: {
    symbol: '£',
    code: 'GBP',
    name: 'British Pound',
    locale: 'en-GB',
    detectPatterns: [
      /£\s*([\d,]+(?:\.\d{1,2})?)/g,
      /GBP\s*([\d,]+(?:\.\d{1,2})?)/gi
    ]
  }
};

const LOCALE_CURRENCY_MAP = {
  'US': 'USD',
  'GB': 'GBP',
  'IN': 'INR',
  'DE': 'EUR',
  'FR': 'EUR',
  'ES': 'EUR',
  'IT': 'EUR',
  'NL': 'EUR',
  'AT': 'EUR',
  'BE': 'EUR',
  'PT': 'EUR',
  'IE': 'EUR',
  'FI': 'EUR'
};

/**
 * Get the default home currency based on browser locale
 * @param {string} locale - Browser locale string (e.g., 'en-US')
 * @returns {string} Currency code (e.g., 'USD')
 */
function getDefaultHomeCurrency(locale) {
  if (!locale || !locale.includes('-')) return 'USD';
  const countryCode = locale.split('-').pop().toUpperCase();
  return LOCALE_CURRENCY_MAP[countryCode] || 'USD';
}

// Make available globally
if (typeof window !== 'undefined') {
  window.SUPPORTED_CURRENCIES = SUPPORTED_CURRENCIES;
  window.LOCALE_CURRENCY_MAP = LOCALE_CURRENCY_MAP;
  window.getDefaultHomeCurrency = getDefaultHomeCurrency;
}
```

**Step 4: Run test to verify it passes**

```bash
cd chrome-extension && npm test -- tests/unit/currencies.config.test.js
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add chrome-extension/src/config/currencies.config.js chrome-extension/tests/unit/currencies.config.test.js
git commit -m "feat: add centralized currency configuration with locale detection"
```

---

### Task 2: Update converter to use Intl.NumberFormat and support all currencies

**Files:**
- Modify: `chrome-extension/src/utils/converters.js` (lines 28-42, the `formatCurrency` function)
- Modify: `chrome-extension/tests/unit/converters.test.js` (update `formatCurrency` tests, add EUR/GBP tests)

**Step 1: Update the failing tests**

In `chrome-extension/tests/unit/converters.test.js`, update the `formatCurrency` describe block. The key changes:
- Existing tests for USD and INR formatting need to be updated to match `Intl.NumberFormat` output (which uses `style: 'currency'`)
- Add tests for EUR and GBP formatting
- Remove the "unknown currency with prefix" test (all currencies now go through `Intl.NumberFormat`)

Replace the entire `formatCurrency` describe block with:

```javascript
  describe('formatCurrency', () => {
    it('should format USD with $ symbol', () => {
      expect(Converters.formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('should format INR with ₹ symbol and Indian locale', () => {
      expect(Converters.formatCurrency(1234567.89, 'INR')).toBe('₹12,34,567.89');
    });

    it('should format INR small amounts correctly', () => {
      expect(Converters.formatCurrency(999, 'INR')).toBe('₹999.00');
    });

    it('should format USD small amounts correctly', () => {
      expect(Converters.formatCurrency(50, 'USD')).toBe('$50.00');
    });

    it('should format EUR with € symbol', () => {
      const result = Converters.formatCurrency(1234.56, 'EUR');
      expect(result).toContain('€');
      expect(result).toContain('1.234,56');
    });

    it('should format GBP with £ symbol', () => {
      const result = Converters.formatCurrency(1234.56, 'GBP');
      expect(result).toContain('£');
      expect(result).toContain('1,234.56');
    });

    it('should always show 2 decimal places', () => {
      expect(Converters.formatCurrency(100, 'USD')).toBe('$100.00');
      expect(Converters.formatCurrency(100.1, 'USD')).toBe('$100.10');
    });

    it('should handle zero', () => {
      expect(Converters.formatCurrency(0, 'USD')).toBe('$0.00');
      expect(Converters.formatCurrency(0, 'INR')).toBe('₹0.00');
    });

    it('should format large INR amounts with proper lakhs separator', () => {
      expect(Converters.formatCurrency(100000, 'INR')).toBe('₹1,00,000.00');
    });

    it('should handle unknown currency codes gracefully', () => {
      const result = Converters.formatCurrency(100, 'JPY');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
```

Also add EUR and GBP cross-pair tests to the `convertCurrency` block (these already pass since the rates object in the test already includes EUR and GBP — just verify explicitly):

Add after the existing `convertCurrency` tests:

```javascript
    it('should convert USD to EUR correctly', () => {
      const result = Converters.convertCurrency(100, 'USD', 'EUR', rates);
      expect(result).toBe(92);
    });

    it('should convert GBP to INR correctly', () => {
      const result = Converters.convertCurrency(1, 'GBP', 'INR', rates);
      expect(result).toBeCloseTo(83.5 / 0.79, 1);
    });

    it('should convert EUR to GBP correctly', () => {
      const result = Converters.convertCurrency(100, 'EUR', 'GBP', rates);
      expect(result).toBeCloseTo((100 / 0.92) * 0.79, 2);
    });
```

**Step 2: Run tests to verify new tests fail**

```bash
cd chrome-extension && npm test -- tests/unit/converters.test.js
```

Expected: EUR/GBP format tests FAIL (formatCurrency doesn't know about EUR/GBP yet). Cross-pair conversion tests should already PASS.

**Step 3: Update the implementation**

In `chrome-extension/src/utils/converters.js`, replace the `formatCurrency` method (lines 28-42) with:

```javascript
  formatCurrency(amount, currency) {
    const currencyLocales = {
      'USD': 'en-US',
      'INR': 'en-IN',
      'EUR': 'de-DE',
      'GBP': 'en-GB'
    };

    const locale = currencyLocales[currency] || 'en-US';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      // Fallback for unknown currency codes
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount) + ' ' + currency;
    }
  },
```

**Step 4: Run tests to verify they pass**

```bash
cd chrome-extension && npm test -- tests/unit/converters.test.js
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add chrome-extension/src/utils/converters.js chrome-extension/tests/unit/converters.test.js
git commit -m "feat: update formatCurrency to support EUR/GBP via Intl.NumberFormat"
```

---

### Task 3: Update detector to support EUR and GBP patterns

**Files:**
- Modify: `chrome-extension/src/content/detector.js` (patterns object, init(), parsePrice())
- Modify: `chrome-extension/tests/unit/detector.test.js` (add EUR/GBP tests, update "unrecognized currency" test)

**Step 1: Write the failing tests**

In `chrome-extension/tests/unit/detector.test.js`, add the following test blocks.

Inside `describe('parsePrice - Pure Function Tests')`, add two new describe blocks after the `USD formats` block:

```javascript
    describe('EUR formats', () => {
      it('should parse € symbol format', () => {
        const result = PriceDetector.parsePrice('€1,234.56');
        expect(result).toEqual({
          amount: 1234.56,
          currency: 'EUR',
          original: '€1,234.56'
        });
      });

      it('should parse € with space', () => {
        const result = PriceDetector.parsePrice('€ 999');
        expect(result).toEqual({
          amount: 999,
          currency: 'EUR',
          original: '€ 999'
        });
      });

      it('should parse € without decimal', () => {
        const result = PriceDetector.parsePrice('€1000');
        expect(result).toEqual({
          amount: 1000,
          currency: 'EUR',
          original: '€1000'
        });
      });

      it('should parse EUR prefix', () => {
        const result = PriceDetector.parsePrice('EUR 2,500.00');
        expect(result).toEqual({
          amount: 2500,
          currency: 'EUR',
          original: 'EUR 2,500.00'
        });
      });

      it('should parse EUR without space', () => {
        const result = PriceDetector.parsePrice('EUR100');
        expect(result).toEqual({
          amount: 100,
          currency: 'EUR',
          original: 'EUR100'
        });
      });
    });

    describe('GBP formats', () => {
      it('should parse £ symbol format', () => {
        const result = PriceDetector.parsePrice('£1,234.56');
        expect(result).toEqual({
          amount: 1234.56,
          currency: 'GBP',
          original: '£1,234.56'
        });
      });

      it('should parse £ with space', () => {
        const result = PriceDetector.parsePrice('£ 999');
        expect(result).toEqual({
          amount: 999,
          currency: 'GBP',
          original: '£ 999'
        });
      });

      it('should parse £ without decimal', () => {
        const result = PriceDetector.parsePrice('£1000');
        expect(result).toEqual({
          amount: 1000,
          currency: 'GBP',
          original: '£1000'
        });
      });

      it('should parse GBP prefix', () => {
        const result = PriceDetector.parsePrice('GBP 2,500.00');
        expect(result).toEqual({
          amount: 2500,
          currency: 'GBP',
          original: 'GBP 2,500.00'
        });
      });

      it('should parse GBP without space', () => {
        const result = PriceDetector.parsePrice('GBP100');
        expect(result).toEqual({
          amount: 100,
          currency: 'GBP',
          original: 'GBP100'
        });
      });
    });
```

Update the edge case test that currently expects `€100` and `£50` to return null — these should now return valid results. Change:

```javascript
      it('should return null for unrecognized currency', () => {
        expect(PriceDetector.parsePrice('€100')).toBeNull();
        expect(PriceDetector.parsePrice('£50')).toBeNull();
      });
```

To:

```javascript
      it('should return null for unrecognized currency', () => {
        expect(PriceDetector.parsePrice('¥1000')).toBeNull();
        expect(PriceDetector.parsePrice('₩50000')).toBeNull();
      });
```

Update the `combinedPattern` test. Change:

```javascript
      it('should not match unrelated currency symbols', () => {
        const nonMatches = ['€100', '£50', '¥1000'];

        nonMatches.forEach(text => {
          PriceDetector.combinedPattern.lastIndex = 0;
          expect(PriceDetector.combinedPattern.test(text)).toBe(false);
        });
      });
```

To:

```javascript
      it('should match EUR and GBP patterns', () => {
        const eurGbpMatches = ['€100', '€ 100', '€1,000', 'EUR 100', 'EUR100', '£100', '£ 100', '£1,000', 'GBP 100', 'GBP100'];

        eurGbpMatches.forEach(price => {
          PriceDetector.combinedPattern.lastIndex = 0;
          expect(PriceDetector.combinedPattern.test(price)).toBe(true);
        });
      });

      it('should not match unrelated currency symbols', () => {
        const nonMatches = ['¥1000', '₩50000'];

        nonMatches.forEach(text => {
          PriceDetector.combinedPattern.lastIndex = 0;
          expect(PriceDetector.combinedPattern.test(text)).toBe(false);
        });
      });
```

Add a DOM scan test for EUR/GBP inside the `scanDOM` describe block:

```javascript
    it('should detect EUR prices', () => {
      const container = document.createElement('div');
      container.innerHTML = '<p>Price: €50.00</p>';
      document.body.appendChild(container);

      PriceDetector.scanDOM(container);
      const priceSpan = container.querySelector('.currency-converter-price');

      expect(priceSpan).not.toBeNull();
      expect(priceSpan.getAttribute('data-currency')).toBe('EUR');
      expect(priceSpan.getAttribute('data-amount')).toBe('50');

      container.remove();
    });

    it('should detect GBP prices', () => {
      const container = document.createElement('div');
      container.innerHTML = '<p>Price: £99.99</p>';
      document.body.appendChild(container);

      PriceDetector.scanDOM(container);
      const priceSpan = container.querySelector('.currency-converter-price');

      expect(priceSpan).not.toBeNull();
      expect(priceSpan.getAttribute('data-currency')).toBe('GBP');
      expect(priceSpan.getAttribute('data-amount')).toBe('99.99');

      container.remove();
    });

    it('should detect mixed currencies in one page', () => {
      const container = document.createElement('div');
      container.innerHTML = '<p>$100</p><p>€200</p><p>£300</p><p>₹400</p>';
      document.body.appendChild(container);

      PriceDetector.scanDOM(container);
      const prices = container.querySelectorAll('.currency-converter-price');

      expect(prices.length).toBe(4);
      const currencies = Array.from(prices).map(p => p.getAttribute('data-currency'));
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('INR');

      container.remove();
    });
```

**Step 2: Run tests to verify new tests fail**

```bash
cd chrome-extension && npm test -- tests/unit/detector.test.js
```

Expected: FAIL — EUR/GBP parsing returns null, combinedPattern doesn't match `€` or `£`.

**Step 3: Update the implementation**

In `chrome-extension/src/content/detector.js`:

**3a.** Add EUR and GBP to the `patterns` object (after the USD entry, around line 18):

```javascript
    EUR: [
      // €1,234.56 or € 1,234.56
      /€\s*([\d,]+(?:\.\d{1,2})?)/g,
      // EUR 1,234.56
      /EUR\s*([\d,]+(?:\.\d{1,2})?)/gi
    ],
    GBP: [
      // £1,234.56 or £ 1,234.56
      /£\s*([\d,]+(?:\.\d{1,2})?)/g,
      // GBP 1,234.56
      /GBP\s*([\d,]+(?:\.\d{1,2})?)/gi
    ]
```

**3b.** Update the `init()` method to include EUR and GBP patterns in the combined regex. Replace the entire `init()` method body (lines 30-46) with:

```javascript
  init() {
    const inrPatterns = [
      '₹\\s*[\\d,]+(?:\\.\\d{1,2})?',
      '\\bRs\\.?\\s*[\\d,]+(?:\\.\\d{1,2})?',
      'INR\\s*[\\d,]+(?:\\.\\d{1,2})?'
    ];
    const usdPatterns = [
      '(?<![A-Z])\\$\\s*[\\d,]+(?:\\.\\d{1,2})?',
      'USD\\s*[\\d,]+(?:\\.\\d{1,2})?',
      'US\\$\\s*[\\d,]+(?:\\.\\d{1,2})?'
    ];
    const eurPatterns = [
      '€\\s*[\\d,]+(?:\\.\\d{1,2})?',
      'EUR\\s*[\\d,]+(?:\\.\\d{1,2})?'
    ];
    const gbpPatterns = [
      '£\\s*[\\d,]+(?:\\.\\d{1,2})?',
      'GBP\\s*[\\d,]+(?:\\.\\d{1,2})?'
    ];

    const allPatterns = [...inrPatterns, ...usdPatterns, ...eurPatterns, ...gbpPatterns].join('|');
    this.combinedPattern = new RegExp(`(${allPatterns})`, 'gi');
  },
```

**3c.** Update `parsePrice()` to recognize EUR and GBP. Add these checks after the USD check block (after line ~68) and before the `if (!currency || !amountStr) return null;` line:

```javascript
    if (!currency) {
      if (/^€/.test(str) || /^EUR/i.test(str)) {
        currency = 'EUR';
        amountStr = str.replace(/^(€|EUR)\s*/i, '');
      }
    }

    if (!currency) {
      if (/^£/.test(str) || /^GBP/i.test(str)) {
        currency = 'GBP';
        amountStr = str.replace(/^(£|GBP)\s*/i, '');
      }
    }
```

**3d.** Update `processStructuredPriceElement()` to check EUR and GBP. Add these blocks after the USD check (around line 166) and before the `if (!currency || !amount ...` guard:

```javascript
    // Check for EUR patterns
    if (!currency) {
      const eurMatch = text.match(/€\s*([\d,]+(?:\.\d{1,2})?)/);
      if (eurMatch) {
        currency = 'EUR';
        amount = parseFloat(eurMatch[1].replace(/,/g, ''));
      }
    }

    if (!currency) {
      const eurTextMatch = text.match(/\bEUR\s*([\d,]+(?:\.\d{1,2})?)/i);
      if (eurTextMatch) {
        currency = 'EUR';
        amount = parseFloat(eurTextMatch[1].replace(/,/g, ''));
      }
    }

    // Check for GBP patterns
    if (!currency) {
      const gbpMatch = text.match(/£\s*([\d,]+(?:\.\d{1,2})?)/);
      if (gbpMatch) {
        currency = 'GBP';
        amount = parseFloat(gbpMatch[1].replace(/,/g, ''));
      }
    }

    if (!currency) {
      const gbpTextMatch = text.match(/\bGBP\s*([\d,]+(?:\.\d{1,2})?)/i);
      if (gbpTextMatch) {
        currency = 'GBP';
        amount = parseFloat(gbpTextMatch[1].replace(/,/g, ''));
      }
    }
```

**Step 4: Run tests to verify they pass**

```bash
cd chrome-extension && npm test -- tests/unit/detector.test.js
```

Expected: All tests PASS, including existing INR/USD tests (regression check).

**Step 5: Commit**

```bash
git add chrome-extension/src/content/detector.js chrome-extension/tests/unit/detector.test.js
git commit -m "feat: add EUR and GBP detection patterns to price detector"
```

---

### Task 4: Update content script for multi-currency conversion

**Files:**
- Modify: `chrome-extension/src/content/content.js` (settings shape, showTooltip conversion logic, storage listener)

This file is an IIFE content script that's hard to unit test in isolation (it self-executes and touches Chrome APIs + DOM). Changes are focused and testable via manual verification + the existing integration behavior.

**Step 1: Update settings initialization**

Replace the `settings` object (line 10-14):

```javascript
  let settings = {
    enabled: true,
    homeCurrency: 'USD'
  };
```

**Step 2: Update `loadSettings()` function**

Replace the `loadSettings` function body (lines 28-36):

```javascript
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['enabled', 'homeCurrency']);
      settings = {
        enabled: result.enabled !== false,
        homeCurrency: result.homeCurrency || 'USD'
      };
    } catch (e) {
      console.warn('Currency Converter: Could not load settings', e);
    }
  }
```

**Step 3: Update `showTooltip()` function**

Replace the entire `showTooltip` function (lines 63-107):

```javascript
  function showTooltip(priceElement) {
    if (!tooltip || !settings.enabled) return;

    const amount = parseFloat(priceElement.getAttribute('data-amount'));
    const currency = priceElement.getAttribute('data-currency');

    if (isNaN(amount) || !currency) return;

    // Don't convert if already in home currency
    if (currency === settings.homeCurrency) return;

    const targetCurrency = settings.homeCurrency;

    if (!exchangeRates) {
      updateTooltipContent({
        loading: true,
        message: 'Loading rates...'
      });
      positionTooltip(priceElement);
      tooltip.classList.add('visible');
      return;
    }

    // Calculate conversion using full rates object
    const convertedAmount = Converters.convertCurrency(amount, currency, targetCurrency, exchangeRates);
    const formattedConverted = Converters.formatCurrency(convertedAmount, targetCurrency);
    const formattedOriginal = Converters.formatCurrency(amount, currency);

    // Calculate the display rate (1 source = X home)
    const oneUnitConverted = Converters.convertCurrency(1, currency, targetCurrency, exchangeRates);

    updateTooltipContent({
      value: formattedConverted,
      original: `${formattedOriginal} ${currency}`,
      rate: `1 ${currency} = ${oneUnitConverted.toFixed(2)} ${targetCurrency}`
    });

    positionTooltip(priceElement);
    tooltip.classList.add('visible');
  }
```

**Step 4: Update the storage change listener**

In `setupEventListeners()`, replace the `chrome.storage.onChanged` listener (lines 155-165):

```javascript
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        if (changes.enabled !== undefined) {
          settings.enabled = changes.enabled.newValue;
        }
        if (changes.homeCurrency !== undefined) {
          settings.homeCurrency = changes.homeCurrency.newValue;
        }
      }
    });
```

**Step 5: Update `fetchExchangeRates()` to store the full rates object**

Replace `fetchExchangeRates` function body (lines 42-52):

```javascript
  async function fetchExchangeRates() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getExchangeRates' });
      if (response && response.rates) {
        exchangeRates = response.rates;
      }
    } catch (e) {
      console.warn('Currency Converter: Could not fetch exchange rates', e);
    }
  }
```

Note: This function's shape hasn't actually changed — `exchangeRates` was already set to `response.rates`. The difference is that the rates object now contains all currencies instead of just `{ INR: 83 }`. No code change needed here, but verify the service worker is returning the full object (Task 6).

**Step 6: Run full test suite**

```bash
cd chrome-extension && npm test
```

Expected: All tests PASS. Content script changes don't break any existing tests since it's not directly unit tested.

**Step 7: Commit**

```bash
git add chrome-extension/src/content/content.js
git commit -m "feat: update content script for multi-currency home currency conversion"
```

---

### Task 5: Update popup HTML and CSS

**Files:**
- Modify: `chrome-extension/src/popup/popup.html` (replace rate display and settings sections)
- Modify: `chrome-extension/src/popup/popup.css` (add styles for currency selector and rate rows, remove manual rate styles)

**Step 1: Update popup.html**

Replace the `<section class="rate-section">` and `<section class="settings-section">` blocks with:

```html
            <section class="currency-section">
                <label class="setting-label" for="homeCurrencySelect">
                    Home Currency
                </label>
                <select id="homeCurrencySelect" class="currency-select">
                    <option value="">Loading...</option>
                </select>
            </section>

            <section class="rate-section">
                <div class="rate-header">
                    <span class="rate-label">Exchange Rates</span>
                    <button
                        class="refresh-btn"
                        id="refreshBtn"
                        title="Refresh rates"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M23 4v6h-6M1 20v-6h6"></path>
                            <path
                                d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
                            ></path>
                        </svg>
                    </button>
                </div>
                <div class="rate-rows" id="rateRows">
                    <div class="rate-row-placeholder">Loading rates...</div>
                </div>
                <span class="rate-source" id="rateSource">Loading...</span>
            </section>
```

Remove the entire `<section class="settings-section">` block (manual rate toggle and input).

**Step 2: Update popup.css**

Add these new styles and remove the manual-rate-related styles:

Remove these CSS blocks:
- `.settings-section` and children
- `.setting-row`, `.setting-label`
- `.manual-rate-input` and children
- `.toggle-switch.small` and its pseudo-element rules

Add these new styles:

```css
/* Currency Selector */
.currency-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.currency-select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s;
}

.currency-select:focus {
  outline: none;
  border-color: #4ade80;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.1);
}

/* Rate Section Updates */
.rate-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rate-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.rate-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #1a1a2e;
}

.rate-row-from {
  color: #64748b;
}

.rate-row-value {
  font-weight: 600;
  color: #059669;
}

.rate-row-placeholder {
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
  padding: 8px 0;
}
```

Update the `.rate-section` style to remove the flex row layout (it's now a vertical section):

```css
.rate-section {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
```

Also update `.popup-container.disabled` to include `.currency-section`:

```css
.popup-container.disabled .currency-section,
.popup-container.disabled .rate-section {
  opacity: 0.5;
  pointer-events: none;
}
```

**Step 3: Commit**

```bash
git add chrome-extension/src/popup/popup.html chrome-extension/src/popup/popup.css
git commit -m "feat: update popup layout with home currency selector and rate table"
```

---

### Task 6: Update popup JavaScript

**Files:**
- Modify: `chrome-extension/src/popup/popup.js` (complete rewrite of settings loading, rate display, event listeners)

**Step 1: Rewrite popup.js**

Replace the entire contents of `chrome-extension/src/popup/popup.js`:

```javascript
/**
 * Popup UI Logic
 * Manages home currency selection and displays exchange rates
 */

document.addEventListener("DOMContentLoaded", init);

// Detected currencies (must match detector.js patterns)
const DETECTED_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'];

// Locale-to-currency mapping for default home currency
const LOCALE_CURRENCY_MAP = {
  'US': 'USD', 'GB': 'GBP', 'IN': 'INR',
  'DE': 'EUR', 'FR': 'EUR', 'ES': 'EUR',
  'IT': 'EUR', 'NL': 'EUR', 'AT': 'EUR',
  'BE': 'EUR', 'PT': 'EUR', 'IE': 'EUR',
  'FI': 'EUR'
};

// Currency display names for the dropdown
const CURRENCY_NAMES = {
  'USD': 'US Dollar', 'EUR': 'Euro', 'GBP': 'British Pound',
  'INR': 'Indian Rupee', 'JPY': 'Japanese Yen', 'CAD': 'Canadian Dollar',
  'AUD': 'Australian Dollar', 'CHF': 'Swiss Franc', 'CNY': 'Chinese Yuan',
  'KRW': 'South Korean Won', 'SEK': 'Swedish Krona', 'NOK': 'Norwegian Krone',
  'DKK': 'Danish Krone', 'NZD': 'New Zealand Dollar', 'SGD': 'Singapore Dollar',
  'HKD': 'Hong Kong Dollar', 'MXN': 'Mexican Peso', 'BRL': 'Brazilian Real',
  'PLN': 'Polish Zloty', 'THB': 'Thai Baht', 'ZAR': 'South African Rand',
  'AED': 'UAE Dirham', 'SAR': 'Saudi Riyal', 'TWD': 'New Taiwan Dollar',
  'MYR': 'Malaysian Ringgit', 'PHP': 'Philippine Peso', 'IDR': 'Indonesian Rupiah',
  'TRY': 'Turkish Lira', 'RUB': 'Russian Ruble', 'CZK': 'Czech Koruna',
  'HUF': 'Hungarian Forint', 'ILS': 'Israeli Shekel', 'CLP': 'Chilean Peso',
  'ARS': 'Argentine Peso', 'COP': 'Colombian Peso', 'PEN': 'Peruvian Sol',
  'EGP': 'Egyptian Pound', 'NGN': 'Nigerian Naira', 'KES': 'Kenyan Shilling',
  'PKR': 'Pakistani Rupee', 'BDT': 'Bangladeshi Taka', 'VND': 'Vietnamese Dong',
  'RON': 'Romanian Leu', 'BGN': 'Bulgarian Lev', 'HRK': 'Croatian Kuna',
  'UAH': 'Ukrainian Hryvnia', 'QAR': 'Qatari Riyal', 'KWD': 'Kuwaiti Dinar',
  'BHD': 'Bahraini Dinar', 'OMR': 'Omani Rial', 'JOD': 'Jordanian Dinar',
  'LKR': 'Sri Lankan Rupee', 'MMK': 'Myanmar Kyat', 'NPR': 'Nepalese Rupee'
};

// DOM Elements
let enabledToggle;
let homeCurrencySelect;
let rateRowsEl;
let rateSourceEl;
let lastUpdatedEl;
let refreshBtn;
let popupContainer;

// State
let allRates = null;
let rateTimestamp = null;
let homeCurrency = 'USD';

function getDefaultHomeCurrency() {
  const locale = navigator.language || 'en-US';
  if (!locale.includes('-')) return 'USD';
  const countryCode = locale.split('-').pop().toUpperCase();
  return LOCALE_CURRENCY_MAP[countryCode] || 'USD';
}

function init() {
  enabledToggle = document.getElementById("enabledToggle");
  homeCurrencySelect = document.getElementById("homeCurrencySelect");
  rateRowsEl = document.getElementById("rateRows");
  rateSourceEl = document.getElementById("rateSource");
  lastUpdatedEl = document.getElementById("lastUpdated");
  refreshBtn = document.getElementById("refreshBtn");
  popupContainer = document.querySelector(".popup-container");

  loadExchangeRates();
  loadSettings();
  setupEventListeners();
}

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(["enabled", "homeCurrency"]);

    enabledToggle.checked = result.enabled !== false;
    homeCurrency = result.homeCurrency || getDefaultHomeCurrency();

    // If no homeCurrency was stored yet, save the default
    if (!result.homeCurrency) {
      await chrome.storage.sync.set({ homeCurrency });
    }

    updateUIState();
  } catch (e) {
    console.error("Error loading settings:", e);
  }
}

async function loadExchangeRates() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getExchangeRates",
    });

    if (response && response.rates) {
      allRates = response.rates;
      rateTimestamp = response.timestamp;
      populateCurrencySelect();
      updateRateDisplay();
    } else if (response && response.error) {
      showRateError(response.error);
    }
  } catch (e) {
    console.error("Error loading rates:", e);
    showRateError("Could not load rates");
  }
}

function populateCurrencySelect() {
  if (!allRates) return;

  // Get all currency codes from API, sorted alphabetically
  const currencies = Object.keys(allRates).sort();

  homeCurrencySelect.innerHTML = '';

  currencies.forEach(code => {
    const option = document.createElement('option');
    option.value = code;
    const name = CURRENCY_NAMES[code] || code;
    option.textContent = `${code} - ${name}`;
    if (code === homeCurrency) {
      option.selected = true;
    }
    homeCurrencySelect.appendChild(option);
  });
}

function updateRateDisplay() {
  if (!allRates) {
    rateRowsEl.innerHTML = '<div class="rate-row-placeholder">Loading rates...</div>';
    rateSourceEl.textContent = "Loading...";
    rateSourceEl.className = "rate-source";
    return;
  }

  // Show rates for each detected currency except the home currency
  const foreignCurrencies = DETECTED_CURRENCIES.filter(c => c !== homeCurrency);

  if (foreignCurrencies.length === 0) {
    rateRowsEl.innerHTML = '<div class="rate-row-placeholder">Home currency matches all detected currencies</div>';
  } else {
    rateRowsEl.innerHTML = foreignCurrencies.map(code => {
      // Calculate: 1 [foreign] = X [home]
      const rateInUSD = 1 / allRates[code]; // 1 foreign in USD
      const rateInHome = rateInUSD * (allRates[homeCurrency] || 1); // USD to home
      const displayRate = homeCurrency === 'USD' ? rateInUSD : rateInHome;

      return `
        <div class="rate-row">
          <span class="rate-row-from">1 ${code}</span>
          <span class="rate-row-value">${displayRate.toFixed(4)} ${homeCurrency}</span>
        </div>
      `;
    }).join('');
  }

  rateSourceEl.textContent = "Live rate";
  rateSourceEl.className = "rate-source";

  if (rateTimestamp) {
    const date = new Date(rateTimestamp);
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    lastUpdatedEl.textContent = `Exchange Rate Updated on: ${dateStr} at ${timeStr}`;
  }
}

function showRateError(message) {
  rateRowsEl.innerHTML = `<div class="rate-row-placeholder">${message}</div>`;
  rateSourceEl.textContent = message;
  rateSourceEl.className = "rate-source error";
}

function updateUIState() {
  const isEnabled = enabledToggle.checked;

  if (isEnabled) {
    popupContainer.classList.remove("disabled");
  } else {
    popupContainer.classList.add("disabled");
  }

  // Update the currency select to reflect current homeCurrency
  if (homeCurrencySelect.value !== homeCurrency) {
    homeCurrencySelect.value = homeCurrency;
  }

  updateRateDisplay();
}

function setupEventListeners() {
  enabledToggle.addEventListener("change", async () => {
    const enabled = enabledToggle.checked;
    await chrome.storage.sync.set({ enabled });
    updateUIState();
  });

  homeCurrencySelect.addEventListener("change", async () => {
    homeCurrency = homeCurrencySelect.value;
    await chrome.storage.sync.set({ homeCurrency });
    updateRateDisplay();
  });

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.classList.add("loading");

    try {
      const response = await chrome.runtime.sendMessage({
        action: "refreshRates",
      });

      if (response && response.success && response.rates) {
        allRates = response.rates;
        rateTimestamp = Date.now();
        populateCurrencySelect();
        updateRateDisplay();
      } else {
        showRateError("Failed to refresh");
      }
    } catch (e) {
      showRateError("Failed to refresh");
    } finally {
      refreshBtn.classList.remove("loading");
    }
  });
}
```

**Step 2: Run full test suite**

```bash
cd chrome-extension && npm test
```

Expected: All tests PASS. Popup JS is not unit tested currently, so no test failures. Verify manually by loading the extension.

**Step 3: Commit**

```bash
git add chrome-extension/src/popup/popup.js
git commit -m "feat: rewrite popup for multi-currency home currency selection"
```

---

### Task 7: Update manifest to include currencies config

**Files:**
- Modify: `chrome-extension/manifest.json` (add `src/config/currencies.config.js` to content_scripts)

**Step 1: Update manifest.json**

In the `content_scripts[0].js` array, add the config file before the other scripts:

```json
      "js": [
        "src/config/currencies.config.js",
        "src/utils/converters.js",
        "src/content/detector.js",
        "src/content/content.js"
      ],
```

**Step 2: Run full test suite**

```bash
cd chrome-extension && npm test
```

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add chrome-extension/manifest.json
git commit -m "feat: add currencies config to manifest content scripts"
```

---

### Task 8: Run full test suite and verify everything works

**Step 1: Run tests**

```bash
cd chrome-extension && npm test
```

Expected: All tests PASS with no regressions.

**Step 2: Run coverage**

```bash
cd chrome-extension && npm run test:coverage
```

Verify new code is covered.

**Step 3: Manual verification checklist**

Load the unpacked extension in `chrome://extensions` and verify:

- [ ] Popup opens and shows home currency dropdown
- [ ] Dropdown is populated with currencies from API, sorted alphabetically
- [ ] Default home currency matches browser locale
- [ ] Changing home currency updates rate rows immediately
- [ ] Rate rows show all detected currencies except home
- [ ] Refresh button fetches new rates and updates display
- [ ] Enable/disable toggle works
- [ ] On a page with $ prices: tooltip shows conversion to home currency
- [ ] On a page with € prices: tooltip shows conversion to home currency
- [ ] On a page with £ prices: tooltip shows conversion to home currency
- [ ] On a page with ₹ prices: tooltip shows conversion to home currency
- [ ] Prices in the home currency are NOT underlined/detected
- [ ] Changing home currency in popup immediately affects tooltips on open pages
- [ ] "Last updated" timestamp displays correctly

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address any issues found during manual testing"
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/config/currencies.config.js` | Create | Central currency definitions, locale map, default currency helper |
| `src/utils/converters.js` | Modify | Replace `formatCurrency` with `Intl.NumberFormat` supporting all currencies |
| `src/content/detector.js` | Modify | Add EUR/GBP patterns to `patterns`, `init()`, `parsePrice()`, `processStructuredPriceElement()` |
| `src/content/content.js` | Modify | Replace USD↔INR logic with `homeCurrency` setting, update tooltip display |
| `src/popup/popup.html` | Modify | Replace rate display and settings with currency dropdown + rate table |
| `src/popup/popup.css` | Modify | Add currency select and rate row styles, remove manual rate styles |
| `src/popup/popup.js` | Modify | Full rewrite for home currency selection, rate table, locale detection |
| `manifest.json` | Modify | Add `currencies.config.js` to content scripts |
| `tests/unit/currencies.config.test.js` | Create | Tests for currency config, locale map, default currency function |
| `tests/unit/converters.test.js` | Modify | Add EUR/GBP format tests, cross-pair conversion tests |
| `tests/unit/detector.test.js` | Modify | Add EUR/GBP parse/detect tests, update "unrecognized" tests, mixed currency DOM test |
