/**
 * Main content script
 * Coordinates price detection, tooltip display, and exchange rate management
 */

(function () {
  "use strict";

  // State
  let settings = {
    enabled: true,
    homeCurrency: "USD",
  };

  let exchangeRates = null;
  let tooltip = null;
  let isInitialized = false;

  /**
   * Initialize the extension
   */
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    // Load settings
    await loadSettings();

    if (!settings.enabled) return;

    // Create tooltip element
    createTooltip();

    // Fetch exchange rates
    await fetchExchangeRates();

    // Initial DOM scan
    if (document.body) {
      PriceDetector.scanDOM(document.body);
    }

    // Set up event listeners
    setupEventListeners();

    // Set up MutationObserver for dynamic content
    setupMutationObserver();
  }

  /**
   * Load settings from chrome.storage
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["enabled", "homeCurrency"]);
      settings = {
        enabled: result.enabled !== false, // Default to true
        homeCurrency: result.homeCurrency || "USD",
      };
    } catch (e) {
      console.warn("Currency Converter: Could not load settings", e);
    }
  }

  /**
   * Fetch exchange rates from the background service worker
   */
  async function fetchExchangeRates() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getExchangeRates",
      });
      if (response && response.rates) {
        exchangeRates = response.rates;
      }
    } catch (e) {
      console.warn("Currency Converter: Could not fetch exchange rates", e);
    }
  }

  /**
   * Create the tooltip element
   */
  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.className = "currency-converter-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.innerHTML =
      '<div class="currency-converter-tooltip-content"></div>';
    document.body.appendChild(tooltip);
  }

  /**
   * Show tooltip with converted price
   * @param {Element} priceElement - The price element being hovered
   */
  function showTooltip(priceElement) {
    if (!tooltip || !settings.enabled) return;

    const amount = parseFloat(priceElement.getAttribute("data-amount"));
    const currency = priceElement.getAttribute("data-currency");

    if (isNaN(amount) || !currency) return;

    // Don't convert if already in home currency
    if (currency === settings.homeCurrency) return;

    const targetCurrency = settings.homeCurrency;

    if (!exchangeRates) {
      // Show loading/error state
      updateTooltipContent({
        loading: true,
        message: "Loading rates...",
      });
      positionTooltip(priceElement);
      tooltip.classList.add("visible");
      return;
    }

    // Calculate conversion using full rates object
    const convertedAmount = Converters.convertCurrency(
      amount,
      currency,
      targetCurrency,
      exchangeRates,
    );
    const formattedConverted = Converters.formatCurrency(
      convertedAmount,
      targetCurrency,
    );
    const formattedOriginal = Converters.formatCurrency(amount, currency);

    // Calculate the display rate (1 source = X home)
    const oneUnitConverted = Converters.convertCurrency(
      1,
      currency,
      targetCurrency,
      exchangeRates,
    );

    // Update tooltip content
    updateTooltipContent({
      value: formattedConverted,
      original: `${formattedOriginal} ${currency}`,
      rate: `1 ${currency} = ${oneUnitConverted.toFixed(2)} ${targetCurrency}`,
    });

    // Position and show
    positionTooltip(priceElement);
    tooltip.classList.add("visible");
  }

  /**
   * Update tooltip content
   * @param {object} content - Content to display
   */
  function updateTooltipContent(content) {
    const container = tooltip.querySelector(
      ".currency-converter-tooltip-content",
    );
    if (!container) return;

    if (content.loading) {
      container.innerHTML = `
        <div class="currency-converter-tooltip-loading">${content.message}</div>
      `;
    } else if (content.error) {
      container.innerHTML = `
        <div class="currency-converter-tooltip-error">${content.error}</div>
      `;
    } else {
      container.innerHTML = `
        <div class="currency-converter-tooltip-value">${content.value}</div>
        <div class="currency-converter-tooltip-original">${content.original}</div>
        <div class="currency-converter-tooltip-rate">${content.rate}</div>
      `;
    }
  }

  /**
   * Position tooltip near the price element
   * @param {Element} priceElement - The price element
   */
  function positionTooltip(priceElement) {
    const rect = priceElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Calculate position (prefer below the element)
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    // Check if tooltip would go off bottom of screen
    tooltip.classList.remove("position-top", "position-bottom");
    if (top + tooltipRect.height > viewportHeight - 10) {
      // Position above instead
      top = rect.top - tooltipRect.height - 8;
      tooltip.classList.add("position-top");
    } else {
      tooltip.classList.add("position-bottom");
    }

    // Keep within horizontal bounds
    if (left < 10) {
      left = 10;
    } else if (left + tooltipRect.width > viewportWidth - 10) {
      left = viewportWidth - tooltipRect.width - 10;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  /**
   * Hide the tooltip
   */
  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove("visible");
    }
  }

  /**
   * Set up event listeners for price hover
   */
  function setupEventListeners() {
    // Track currently hovered price element to avoid re-triggering
    let currentPriceEl = null;

    // Use mouseover/mouseout for proper event delegation (they bubble)
    document.body.addEventListener("mouseover", (e) => {
      const priceEl = e.target.closest(".currency-converter-price");
      if (priceEl && priceEl !== currentPriceEl) {
        currentPriceEl = priceEl;
        showTooltip(priceEl);
      }
    });

    document.body.addEventListener("mouseout", (e) => {
      const priceEl = e.target.closest(".currency-converter-price");
      if (priceEl) {
        // Check if we're moving to another element inside the same price container
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !priceEl.contains(relatedTarget)) {
          currentPriceEl = null;
          hideTooltip();
        }
      }
    });

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync") {
        if (changes.enabled !== undefined) {
          settings.enabled = changes.enabled.newValue;
        }
        if (changes.homeCurrency !== undefined) {
          settings.homeCurrency = changes.homeCurrency.newValue;
        }
      }
    });

    // Listen for rate updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "ratesUpdated" && message.rates) {
        exchangeRates = message.rates;
      }
    });
  }

  /**
   * Set up MutationObserver for dynamic content
   */
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;

      mutations.forEach((mutation) => {
        // Process added nodes
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Scan the new element for prices
            PriceDetector.scanDOM(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
