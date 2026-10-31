/**
 * Indeed Stealth SmartApply - DOM Stealth Utilities
 * High-fidelity human simulation, React 18+ controlled input bypass,
 * resilient DOM queries, and coordinate calculation for CDP trusted clicks.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StealthDOM = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Generates a random integer between min and max (inclusive).
   */
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Sleep helper with jitter.
   */
  function sleep(ms, jitter = 0) {
    const finalMs = jitter > 0 ? ms + getRandomInt(-jitter, jitter) : ms;
    return new Promise(resolve => setTimeout(resolve, Math.max(0, finalMs)));
  }

  /**
   * React 18+ Virtual DOM Input Setter Bypass.
   * Directly invokes the native prototype descriptor setter to bypass
   * React's internal synthetic event interception and value tracker.
   */
  function setNativeValue(element, value) {
    if (!element) return false;

    let prototype;
    if (element instanceof HTMLInputElement) {
      prototype = window.HTMLInputElement.prototype;
    } else if (element instanceof HTMLTextAreaElement) {
      prototype = window.HTMLTextAreaElement.prototype;
    } else if (element instanceof HTMLSelectElement) {
      prototype = window.HTMLSelectElement.prototype;
    } else {
      prototype = Object.getPrototypeOf(element);
    }

    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    // Reset React's internal value tracker to ensure change detection triggers
    if (element._valueTracker) {
      element._valueTracker.setValue('' + (element.value || ''));
    }

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    return true;
  }

  /**
   * Humanized character-by-character typing into React controlled inputs.
   * Simulates keydown, keypress, native value update, input event, and keyup.
   */
  async function humanType(element, text, options = {}) {
    if (!element) return false;

    const {
      clearExisting = true,
      minDelay = 35,
      maxDelay = 95,
      focusBefore = true,
      blurAfter = true
    } = options;

    if (focusBefore) {
      element.focus();
      await sleep(getRandomInt(60, 140));
    }

    if (clearExisting) {
      setNativeValue(element, '');
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await sleep(getRandomInt(40, 80));
    }

    const str = String(text);
    let currentVal = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      currentVal += char;

      // Dispatch KeyDown
      const keydownEvent = new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        composed: true
      });
      element.dispatchEvent(keydownEvent);

      // Apply native setter for current accumulator
      setNativeValue(element, currentVal);

      // Dispatch Input event (bubbles up to React fiber)
      const inputEvent = new InputEvent('input', {
        data: char,
        inputType: 'insertText',
        bubbles: true,
        composed: true
      });
      element.dispatchEvent(inputEvent);

      // Dispatch KeyUp
      const keyupEvent = new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        composed: true
      });
      element.dispatchEvent(keyupEvent);

      // Realistic typing jitter between keystrokes
      const delay = getRandomInt(minDelay, maxDelay);
      await sleep(delay);
    }

    // Dispatch Change event
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    if (blurAfter) {
      await sleep(getRandomInt(80, 180));
      element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
      element.blur();
    }

    return true;
  }

  /**
   * Sets the selection of a <select> element in a React-friendly manner.
   */
  async function humanSelect(selectElement, valueOrText) {
    if (!selectElement) return false;

    selectElement.focus();
    await sleep(getRandomInt(80, 150));

    let matchedOption = null;
    const target = String(valueOrText).toLowerCase().trim();

    for (let i = 0; i < selectElement.options.length; i++) {
      const opt = selectElement.options[i];
      const optVal = (opt.value || '').toLowerCase().trim();
      const optText = (opt.textContent || '').toLowerCase().trim();

      if (optVal === target || optText === target || optText.includes(target) || target.includes(optText)) {
        matchedOption = opt;
        break;
      }
    }

    if (matchedOption) {
      matchedOption.selected = true;
      setNativeValue(selectElement, matchedOption.value);
      selectElement.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      selectElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }

    await sleep(getRandomInt(60, 120));
    selectElement.blur();
    return !!matchedOption;
  }

  /**
   * Smooth scroll to element with a natural micro-overshoot and deceleration.
   */
  async function smoothScrollIntoView(element, options = {}) {
    if (!element) return false;

    const {
      offsetY = 0,
      behavior = 'smooth'
    } = options;

    const rect = element.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    if (isVisible) {
      return true;
    }

    element.scrollIntoView({
      behavior: behavior,
      block: 'center',
      inline: 'center'
    });

    // Wait for the smooth scroll animation to settle
    await sleep(getRandomInt(450, 750));
    return true;
  }

  /**
   * Computes randomized target coordinates within the central 60% of an element.
   * Central 60% ensures the click lands well inside borders, avoiding edge misses.
   */
  function getRandomizedTargetCoordinates(element) {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    // Randomize within 20% to 80% of width and height
    const xMin = rect.left + (rect.width * 0.20);
    const xMax = rect.left + (rect.width * 0.80);
    const yMin = rect.top + (rect.height * 0.20);
    const yMax = rect.top + (rect.height * 0.80);

    const targetX = Math.round(xMin + Math.random() * (xMax - xMin));
    const targetY = Math.round(yMin + Math.random() * (yMax - yMin));

    return {
      x: targetX,
      y: targetY,
      width: rect.width,
      height: rect.height,
      rawRect: {
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      }
    };
  }

  /**
   * Resilient element visibility check.
   * Handles position: fixed, sticky, and display: contents where offsetParent is null.
   */
  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    } catch (_) {}
    return true;
  }

  /**
   * Resilient DOM Selector Engine:
   * Finds elements using data attributes, ARIA attributes, semantic roles,
   * labels, and visible text instead of brittle obfuscated classes.
   */
  const Selectors = {
    /**
     * Finds button by text content or aria-label (case-insensitive substring match).
     */
    findButtonByText(rootElement, textRegexOrStr) {
      const root = rootElement || document;
      const buttons = Array.from(root.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"], [role="button"], a[href]'));
      const isRegex = textRegexOrStr instanceof RegExp;

      return buttons.find(btn => {
        if (!btn || !isElementVisible(btn)) return false; // must be truly visible on screen
        const text = (btn.innerText || btn.textContent || '').trim();
        const aria = (btn.getAttribute('aria-label') || '').trim();
        const testId = (btn.getAttribute('data-testid') || '').trim();

        if (isRegex) {
          return textRegexOrStr.test(text) || textRegexOrStr.test(aria) || textRegexOrStr.test(testId);
        }
        const search = String(textRegexOrStr).toLowerCase();
        return text.toLowerCase().includes(search) || aria.toLowerCase().includes(search);
      }) || null;
    },

    /**
     * Finds input element associated with a label query.
     */
    findInputByLabel(rootElement, labelQuery) {
      const root = rootElement || document;
      const lower = labelQuery.toLowerCase().trim();

      // 1. Direct label element search
      const labels = Array.from(root.querySelectorAll('label'));
      for (const label of labels) {
        const text = (label.innerText || label.textContent || '').toLowerCase();
        if (text.includes(lower)) {
          // Label has 'for' attribute
          const forId = label.getAttribute('for');
          if (forId) {
            const el = root.querySelector(`#${CSS.escape(forId)}`);
            if (el) return el;
          }
          // Input nested inside label
          const nestedInput = label.querySelector('input, textarea, select');
          if (nestedInput) return nestedInput;
          // Input directly adjacent
          const nextEl = label.nextElementSibling;
          if (nextEl) {
            const adjacentInput = nextEl.matches('input, textarea, select') ? nextEl : nextEl.querySelector('input, textarea, select');
            if (adjacentInput) return adjacentInput;
          }
        }
      }

      // 2. Search by aria-label or placeholder
      const directMatch = root.querySelector(
        `input[aria-label*="${CSS.escape(lower)}" i], ` +
        `textarea[aria-label*="${CSS.escape(lower)}" i], ` +
        `input[placeholder*="${CSS.escape(lower)}" i], ` +
        `textarea[placeholder*="${CSS.escape(lower)}" i], ` +
        `input[name*="${CSS.escape(lower)}" i]`
      );
      if (directMatch) return directMatch;

      // 3. Search fieldsets or legend containers
      const legends = Array.from(root.querySelectorAll('legend, span, div, h3, h4'));
      for (const header of legends) {
        const text = (header.innerText || header.textContent || '').toLowerCase().trim();
        if (text.includes(lower) && header.offsetParent !== null) {
          const container = header.closest('fieldset') || header.closest('[data-testid]') || header.parentElement;
          if (container) {
            const input = container.querySelector('input, textarea, select');
            if (input) return input;
          }
        }
      }

      return null;
    },

    /**
     * Finds all form fields on a screening question step.
     */
    findFormQuestions(rootElement) {
      const root = rootElement || document;
      const questionContainers = Array.from(root.querySelectorAll(
        '[data-testid*="question"], fieldset, .ia-Questions-item, [class*="question-container"], [class*="form-group"]'
      ));

      if (questionContainers.length > 0) {
        return questionContainers;
      }

      // Fallback: gather all visible interactive fields
      const inputs = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select'));
      return inputs.map(input => input.closest('div') || input.parentElement);
    }
  };

  /**
   * Synthesize a gentle Web Audio notification chime (two-tone D5 -> A5).
   * Runs directly in content script only when user activation permits it,
   * fully adhering to Chrome's Autoplay policy.
   */
  function playNotificationChime() {
    try {
      if (typeof window === 'undefined') return;

      // Comply with Chrome Autoplay policy: do not start AudioContext without prior user gesture
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        try { ctx.close(); } catch (_) {}
        return;
      }

      const now = ctx.currentTime;

      // Master gain node
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.12, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      masterGain.connect(ctx.destination);

      // Tone 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2: A5 (880 Hz)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.22);
      osc2.connect(masterGain);
      osc2.start(now + 0.22);
      osc2.stop(now + 0.85);

      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 1000);
    } catch (_) {
      // Gracefully silent if audio subsystem is restricted
    }
  }

  /**
   * Injects pulsating neon-orange sentinel alert border onto an element.
   */
  function highlightSentinelElement(element, message = 'Action Required') {
    if (!element) return () => {};

    // Ensure CSS animation is injected in current document
    const styleId = 'stealth-sentinel-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes stealthPulseGlow {
          0% { box-shadow: 0 0 0 2px #f97316, 0 0 10px rgba(249, 115, 22, 0.4); }
          50% { box-shadow: 0 0 0 5px #ea580c, 0 0 22px rgba(234, 88, 12, 0.8); }
          100% { box-shadow: 0 0 0 2px #f97316, 0 0 10px rgba(249, 115, 22, 0.4); }
        }
        .stealth-sentinel-active {
          animation: stealthPulseGlow 1.4s infinite !important;
          border-radius: 8px !important;
          outline: none !important;
        }
        .stealth-sentinel-tooltip {
          position: absolute;
          z-index: 2147483647;
          background: #0f172a;
          color: #f97316;
          border: 1px solid #f97316;
          padding: 6px 12px;
          border-radius: 6px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5);
          pointer-events: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    element.classList.add('stealth-sentinel-active');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Optional floating tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'stealth-sentinel-tooltip';
    tooltip.innerHTML = `⚠️ <span>${message}</span>`;
    document.body.appendChild(tooltip);

    const updateTooltipPos = () => {
      const r = element.getBoundingClientRect();
      tooltip.style.top = `${window.scrollY + Math.max(0, r.top - 34)}px`;
      tooltip.style.left = `${window.scrollX + r.left}px`;
    };
    updateTooltipPos();
    window.addEventListener('resize', updateTooltipPos);
    window.addEventListener('scroll', updateTooltipPos);

    // Return cleanup function
    return function removeHighlight() {
      element.classList.remove('stealth-sentinel-active');
      window.removeEventListener('resize', updateTooltipPos);
      window.removeEventListener('scroll', updateTooltipPos);
      if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    };
  }

  return {
    sleep,
    getRandomInt,
    isElementVisible,
    setNativeValue,
    humanType,
    humanSelect,
    smoothScrollIntoView,
    getRandomizedTargetCoordinates,
    Selectors,
    playNotificationChime,
    highlightSentinelElement
  };
});
