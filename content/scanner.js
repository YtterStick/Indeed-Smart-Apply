/**
 * Indeed Stealth SmartApply - Search Page Scanner
 * Runs in top frame: scans job cards, applies filters, navigates pages,
 * and initiates the SmartApply flow using CDP trusted clicks.
 */

(function () {
  'use strict';

  // Teardown previous scanner instance if running in this frame
  if (window.__stealthScannerInstance) {
    try {
      window.__stealthScannerInstance.stop();
    } catch (_) {}
  }

  const Stealth = window.StealthDOM;

  let isScanning = false;
  let isPaused = false;
  let isApplyingCurrentJob = false;
  let currentJobIndex = 0;
  let candidateProfile = {};
  let filterConfig = {
    enabled: false,
    blacklist: [],
    mustHave: []
  };
  let userConfig = {
    safeMode: true,
    dailyCap: 25
  };

  window.__stealthScannerInstance = {
    stop() {
      isScanning = false;
      isPaused = false;
      isApplyingCurrentJob = false;
    }
  };

  console.log('[StealthScanner] Content script initialized on top frame');

  // Helper to send messages to background
  function sendBgMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StealthScanner] BG message error:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || {});
        }
      });
    });
  }

  // Forward activity log to popup telemetry
  function logToBg(message, level = 'info') {
    console.log(`[StealthScanner] ${message}`);
    sendBgMessage({ type: 'LOG_ACTIVITY', message, level }).catch(() => {});
  }

  // Find all job cards on current page
  function getJobCards() {
    let cards = Array.from(document.querySelectorAll('.job_seen_beacon'));
    if (cards.length === 0) {
      cards = Array.from(document.querySelectorAll('div.cardOutline, div[data-jk], [data-testid="jobcards"] li'));
    }
    const seen = new Set();
    return cards.filter(card => {
      const jk = card.getAttribute('data-jk') || card.querySelector('[data-jk]')?.getAttribute('data-jk') || card.id || (card.innerText || '').substring(0, 40);
      if (seen.has(jk)) return false;
      seen.add(jk);
      return true;
    });
  }

  // Parse numeric amount handling 'k' suffix and commas
  function parseSalaryNum(str, kSuffix) {
    if (!str) return 0;
    let cleaned = str.replace(/,/g, '').trim();
    let val = parseFloat(cleaned);
    if (isNaN(val)) return 0;
    if (kSuffix && (kSuffix.toLowerCase() === 'k' || str.toLowerCase().endsWith('k'))) {
      val *= 1000;
    }
    return val;
  }

  // Extract salary numbers and pay frequency from text
  function parseSalarySnippet(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // 1. Detect period
    let period = 'any';
    if (lower.includes('month') || lower.includes('/mo') || lower.includes('monthly') || lower.includes('per mo')) {
      period = 'month';
    } else if (lower.includes('year') || lower.includes('annum') || lower.includes('/yr') || lower.includes('annual') || lower.includes('yearly')) {
      period = 'year';
    } else if (lower.includes('hour') || lower.includes('/hr') || lower.includes('hourly')) {
      period = 'hour';
    } else if (lower.includes('day') || lower.includes('/day') || lower.includes('daily')) {
      period = 'day';
    }

    // 2. Range match: e.g. "$20,000 - $30,000 a month", "₱20,000 - ₱30,000", "20k - 30k"
    const rangeRegex = /(?:[\$\£\€\¥\₱]|usd|php|cad|aud)?\s*(\d[\d,.]*)\s*(k)?\s*(?:-|to|–)\s*(?:[\$\£\€\¥\₱]|usd|php|cad|aud)?\s*(\d[\d,.]*)\s*(k)?/i;
    const rangeMatch = text.match(rangeRegex);

    if (rangeMatch) {
      const min = parseSalaryNum(rangeMatch[1], rangeMatch[2]);
      const max = parseSalaryNum(rangeMatch[3], rangeMatch[4]);
      if (min > 0 || max > 0) {
        return {
          min: Math.min(min, max),
          max: Math.max(min, max),
          period,
          raw: rangeMatch[0].trim() + (period !== 'any' ? ` per ${period}` : '')
        };
      }
    }

    // 3. Single amount match: e.g. "$25,000 a month", "From ₱20,000"
    const singleRegex = /(?:from|up to|starting at)?\s*(?:[\$\£\€\¥\₱]|usd|php|cad|aud)\s*(\d[\d,.]*)\s*(k)?/i;
    const singleMatch = text.match(singleRegex);
    if (singleMatch) {
      const val = parseSalaryNum(singleMatch[1], singleMatch[2]);
      if (val > 0) {
        return {
          min: val,
          max: val,
          period,
          raw: singleMatch[0].trim() + (period !== 'any' ? ` per ${period}` : '')
        };
      }
    }

    return null;
  }

  // Convert salary amount between periods for accurate comparison
  function normalizeSalaryToPeriod(amount, fromPeriod, toPeriod) {
    if (!amount || fromPeriod === 'any' || toPeriod === 'any' || fromPeriod === toPeriod) {
      return amount;
    }

    // Convert fromPeriod to monthly base
    let monthly = amount;
    if (fromPeriod === 'year') monthly = amount / 12;
    else if (fromPeriod === 'hour') monthly = amount * 160;
    else if (fromPeriod === 'day') monthly = amount * 21.67;

    // Convert monthly base to toPeriod
    if (toPeriod === 'month') return monthly;
    if (toPeriod === 'year') return monthly * 12;
    if (toPeriod === 'hour') return monthly / 160;
    if (toPeriod === 'day') return monthly / 21.67;

    return amount;
  }

  // Parse job card information
  function parseJobCard(card) {
    // Title
    const titleEl = card.querySelector(
      'h2.jobTitle, a[data-jk], h2 a, [class*="jobTitle"], [data-testid="jobTitle"]'
    );
    const title = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : 'Unknown Position';

    // Company
    const companyEl = card.querySelector(
      'span[data-testid="company-name"], [class*="companyName"], span.companyName'
    );
    const company = companyEl ? (companyEl.innerText || companyEl.textContent || '').trim() : 'Unknown Company';

    // Easily Apply badge check
    const textContent = (card.innerText || '').toLowerCase();
    const hasEasilyApply = (
      textContent.includes('easily apply') ||
      textContent.includes('apply with indeed') ||
      textContent.includes('responsive employer') ||
      card.querySelector('[data-testid="indeedApply"], [aria-label*="Easily apply" i], [aria-label*="Apply" i]') !== null
    );

    // External redirect badge check
    const isExternal = textContent.includes('apply on company site') || textContent.includes('external apply');

    // Salary snippet from card
    const salaryEl = card.querySelector(
      'div.salary-snippet-container, div[data-testid="attribute_snippet_testid"], div.metadata.salary-snippet-container, div[class*="salary" i], span[class*="salary" i], [data-testid="attribute_snippet"]'
    );
    let cardSalaryText = salaryEl ? (salaryEl.innerText || '').trim() : '';

    if (!cardSalaryText) {
      const cardText = card.innerText || '';
      const currencyMatch = cardText.match(/(?:[\$\£\€\¥\₱]|php|usd)\s*\d[\d,.]*(?:\s*k)?(?:\s*(?:-|to|–)\s*(?:[\$\£\€\¥\₱]|php|usd)?\s*\d[\d,.]*(?:\s*k)?)?(?:\s*(?:a|an|per|\/)\s*(?:month|year|hour|day|mo|yr|hr))?/i);
      if (currencyMatch) {
        cardSalaryText = currencyMatch[0];
      }
    }

    return {
      element: card,
      title,
      company,
      hasEasilyApply: hasEasilyApply && !isExternal,
      salaryText: cardSalaryText
    };
  }

  // Check job description against blacklist, must-have, and salary filters
  async function evaluateJobMatch(jobInfo) {
    // If master filter toggle is disabled, accept all jobs
    if (!filterConfig || filterConfig.enabled === false) {
      return { match: true };
    }

    // 1. Title check
    if (Array.isArray(filterConfig.blacklist) && filterConfig.blacklist.length > 0) {
      const titleLower = jobInfo.title.toLowerCase();
      for (const badWord of filterConfig.blacklist) {
        const trimmed = (badWord || '').toLowerCase().trim();
        if (!trimmed) continue;
        const regex = new RegExp(`(^|\\b)${trimmed.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|$)`, 'i');
        if (regex.test(titleLower)) {
          return { match: false, reason: `Blacklisted title keyword: "${badWord}"` };
        }
      }
    }

    // 2. Inspect right-hand detail pane
    let descEl = document.querySelector('#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"], .jobsearch-jobDescriptionText');
    if (!descEl) {
      await Stealth.sleep(600);
      descEl = document.querySelector('#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"], .jobsearch-jobDescriptionText');
    }

    if (descEl) {
      const descText = (descEl.innerText || '').toLowerCase();

      if (Array.isArray(filterConfig.blacklist) && filterConfig.blacklist.length > 0) {
        for (const badWord of filterConfig.blacklist) {
          const trimmed = (badWord || '').toLowerCase().trim();
          if (!trimmed) continue;
          const regex = new RegExp(`(^|\\b)${trimmed.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|$)`, 'i');
          if (regex.test(descText)) {
            return { match: false, reason: `Blacklisted description keyword: "${badWord}"` };
          }
        }
      }

      if (Array.isArray(filterConfig.mustHave) && filterConfig.mustHave.length > 0) {
        const hasAnyMustHave = filterConfig.mustHave.some(word => {
          const trimmed = (word || '').toLowerCase().trim();
          return trimmed && descText.includes(trimmed);
        });
        if (!hasAnyMustHave) {
          return { match: false, reason: `Missing must-have keywords: ${filterConfig.mustHave.join(', ')}` };
        }
      }
    }

    // 3. Salary Range Filter
    const hasSalaryFilter = (
      (filterConfig.salaryMin !== null && filterConfig.salaryMin !== undefined && filterConfig.salaryMin !== '') ||
      (filterConfig.salaryMax !== null && filterConfig.salaryMax !== undefined && filterConfig.salaryMax !== '') ||
      filterConfig.requireSalary
    );

    if (hasSalaryFilter) {
      let combinedSalaryText = jobInfo.salaryText || '';

      if (!combinedSalaryText) {
        const paneSalaryEl = document.querySelector(
          '#salaryInfoAndJobType, [data-testid="jobsearch-JobComponent-description"] [class*="salary" i], div[data-testid*="salary" i], span[class*="salary" i]'
        );
        if (paneSalaryEl) {
          combinedSalaryText = (paneSalaryEl.innerText || '').trim();
        } else if (descEl) {
          const descMatch = (descEl.innerText || '').match(/(?:[\$\£\€\¥\₱]|php|usd)\s*\d[\d,.]*(?:\s*k)?(?:\s*(?:-|to|–)\s*(?:[\$\£\€\¥\₱]|php|usd)?\s*\d[\d,.]*(?:\s*k)?)?(?:\s*(?:a|an|per|\/)\s*(?:month|year|hour|day|mo|yr|hr))?/i);
          if (descMatch) combinedSalaryText = descMatch[0];
        }
      }

      const parsedSalary = parseSalarySnippet(combinedSalaryText);

      if (!parsedSalary) {
        if (filterConfig.requireSalary) {
          return {
            match: false,
            reason: 'No salary listed in job post (salary filter requires explicit salary)'
          };
        }
      } else {
        const targetPeriod = filterConfig.salaryPeriod || 'any';
        const normMin = normalizeSalaryToPeriod(parsedSalary.min, parsedSalary.period, targetPeriod);
        const normMax = normalizeSalaryToPeriod(parsedSalary.max, parsedSalary.period, targetPeriod);

        const userMin = (filterConfig.salaryMin !== null && filterConfig.salaryMin !== undefined && filterConfig.salaryMin !== '') 
          ? Number(filterConfig.salaryMin) 
          : null;
        const userMax = (filterConfig.salaryMax !== null && filterConfig.salaryMax !== undefined && filterConfig.salaryMax !== '') 
          ? Number(filterConfig.salaryMax) 
          : null;

        // Check if job's maximum is below user's minimum
        if (userMin !== null && !isNaN(userMin) && userMin > 0 && normMax < userMin) {
          return {
            match: false,
            reason: `Salary (${parsedSalary.raw}) max of ~${Math.round(normMax).toLocaleString()}/${targetPeriod} is below your minimum target of ${userMin.toLocaleString()}`
          };
        }

        // Check if job's minimum is above user's maximum
        if (userMax !== null && !isNaN(userMax) && userMax > 0 && normMin > userMax) {
          return {
            match: false,
            reason: `Salary (${parsedSalary.raw}) min of ~${Math.round(normMin).toLocaleString()}/${targetPeriod} is above your maximum target of ${userMax.toLocaleString()}`
          };
        }
      }
    }

    return { match: true };
  }

  // Helper to check if an element is inside the left-hand search results list
  function isInsideSearchResultsList(el) {
    if (!el) return false;
    // Elements inside the right-hand details/view pane are NEVER search results
    if (el.closest('#jobsearch-ViewjobPaneWrapper, div[data-testid="jobsearch-ViewJobPane"], div[data-testid="viewJobSSRRoot"], .jobsearch-JobComponent, #vjs-container, .jobsearch-RightPane, div[class*="JobComponent"]')) {
      return false;
    }
    return !!el.closest('.job_seen_beacon, div.cardOutline, ul.jobsearch-ResultsList, .jobsearch-LeftPane');
  }

  // Locate the primary Apply Now button with retry polling for async pane loading
  async function waitForApplyButton(maxWaitMs = 6000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      // 0. High-Priority Direct Scan: Look across document for any visible button or link with exact "Apply now" outside cards
      const allButtons = Array.from(document.querySelectorAll('button, a[role="button"], a[href], [role="button"]'));
      for (const btn of allButtons) {
        if (!Stealth.isElementVisible(btn)) continue;
        if (isInsideSearchResultsList(btn)) continue;

        const text = (btn.innerText || btn.textContent || '').trim();
        const aria = (btn.getAttribute('aria-label') || '').trim();

        if (/^apply now$/i.test(text) || /^apply now$/i.test(aria) || /^apply with indeed$/i.test(text)) {
          return btn;
        }
      }

      // 1. Details pane container
      const pane = document.querySelector(
        '#jobsearch-ViewjobPaneWrapper, div[data-testid="jobsearch-ViewJobPane"], div[data-testid="viewJobSSRRoot"], .jobsearch-JobComponent, #vjs-container, .jobsearch-RightPane, div[class*="JobComponent"]'
      );

      // Search root: prefer pane, fallback to document
      const searchRoots = pane ? [pane, document] : [document];

      for (const root of searchRoots) {
        // High-priority targeted selectors
        const candidateSelectors = [
          '#indeedApplyButton',
          '#indeedApplyButtonContainer button',
          '#indeedApplyButtonContainer a',
          '#indeedApplyButtonContainer [role="button"]',
          'a[href*="/rc/clk"][aria-label*="Apply" i]',
          'a[href*="/rc/clk"][data-testid*="indeedApply" i]',
          'button[data-testid*="indeedApply" i]',
          'button[data-testid*="apply" i]',
          'a[data-testid*="indeedApply" i]',
          'a[data-testid*="apply" i]',
          '.ia-IndeedApplyButton',
          '.jobsearch-IndeedApplyButton-newDesign',
          '.jobsearch-IndeedApplyButton-buttonWrapper button',
          '.jobsearch-IndeedApplyButton-buttonWrapper a',
          'button[id*="indeedApply" i]',
          'button[id*="apply" i]',
          'a[href*="/apply/"]',
          'a[href*="smartapply.indeed.com"]',
          'a[href*="/rc/clk"]'
        ];

        for (const sel of candidateSelectors) {
          const elements = Array.from(root.querySelectorAll(sel));
          for (const rawEl of elements) {
            // Guard: Never pick elements from the left job list cards
            if (isInsideSearchResultsList(rawEl)) continue;
            if (!Stealth.isElementVisible(rawEl)) continue;

            // Resolve to the true clickable anchor or button (never a container div)
            const clickable = rawEl.closest('button, a, [role="button"]') ||
                              rawEl.querySelector('button, a, [role="button"]') ||
                              rawEl;

            // Check text content or aria-label
            const text = (clickable.innerText || clickable.textContent || clickable.getAttribute('aria-label') || '').toLowerCase().trim();

            if (sel === 'a[href*="/rc/clk"]') {
              if (text.includes('apply')) {
                return clickable;
              }
              continue;
            }

            if (text.includes('apply') ||
                clickable.id.toLowerCase().includes('apply') ||
                (clickable.getAttribute('data-testid') || '').toLowerCase().includes('apply')) {
              return clickable;
            }
          }
        }

        // Container inspection: look inside indeedApply containers for buttons or anchors
        const containers = Array.from(root.querySelectorAll(
          '#indeedApplyButtonContainer, [data-testid*="indeedApply" i], [class*="IndeedApply" i], .jobsearch-IndeedApplyButton-buttonWrapper'
        ));
        for (const container of containers) {
          if (isInsideSearchResultsList(container)) continue;
          if (!Stealth.isElementVisible(container)) continue;

          const innerTarget = container.querySelector('button, a, [role="button"]');
          if (innerTarget && Stealth.isElementVisible(innerTarget)) {
            return innerTarget;
          }
        }

        // Resilient text scan across all visible buttons and anchors in the root
        for (const btn of allButtons) {
          if (isInsideSearchResultsList(btn)) continue;
          if (!Stealth.isElementVisible(btn)) continue;

          const text = (btn.innerText || btn.textContent || '').trim();
          const aria = (btn.getAttribute('aria-label') || '').trim();

          if (/^(Apply now|Easily apply|Apply with Indeed|Apply on Indeed|Quick apply|Apply)$/i.test(text) ||
              /^(Apply now|Easily apply|Apply with Indeed)$/i.test(aria) ||
              /\bapply now\b/i.test(text)) {
            return btn;
          }
        }
      }

      await Stealth.sleep(350);
    }
    return null;
  }

  // Find pagination Next button
  function findNextPageButton() {
    const nextBtn = document.querySelector(
      'a[data-testid="pagination-page-next"], [aria-label="Next Page"], [aria-label="Next"], a[data-testid="pagination-next"]'
    );
    if (nextBtn && Stealth.isElementVisible(nextBtn)) {
      return nextBtn;
    }
    return Stealth.Selectors.findButtonByText(document, /^Next/i);
  }

  // Process a single job
  async function processNextJob() {
    if (!isScanning || isPaused || isApplyingCurrentJob) return;

    const cards = getJobCards();
    console.log(`[StealthScanner] Found ${cards.length} cards, processing index ${currentJobIndex}`);

    if (currentJobIndex >= cards.length) {
      logToBg('Finished all cards on this page. Checking for next page...', 'info');
      const nextBtn = findNextPageButton();
      if (nextBtn) {
        await Stealth.smoothScrollIntoView(nextBtn);
        const coords = Stealth.getRandomizedTargetCoordinates(nextBtn);
        if (coords) {
          await sendBgMessage({ type: 'FIRE_TRUSTED_CLICK', coords });
          currentJobIndex = 0;
          await Stealth.sleep(3500);
          processNextJob();
          return;
        }
      }
      logToBg('No more pages found. Search scan finished.', 'info');
      isScanning = false;
      return;
    }

    const card = cards[currentJobIndex];
    currentJobIndex += 1;

    const jobInfo = parseJobCard(card);

    // Only skip card if explicitly marked as external company site
    const cardTextLower = (card.innerText || '').toLowerCase();
    const isExplicitlyExternal = cardTextLower.includes('apply on company site') || cardTextLower.includes('apply on employer site');
    if (isExplicitlyExternal) {
      logToBg(`Skipping "${jobInfo.title}": Requires external company portal application.`, 'info');
      await Stealth.sleep(Stealth.getRandomInt(600, 1200));
      processNextJob();
      return;
    }

    logToBg(`Inspecting job ${currentJobIndex}/${cards.length}: "${jobInfo.title}" at "${jobInfo.company}"...`, 'info');

    // Scroll card into view and click it to open description
    await Stealth.smoothScrollIntoView(card);
    const cardClickTarget = card.querySelector('h2.jobTitle, a[data-jk], h2 a, [data-testid="jobTitle"]') || card;
    const cardCoords = Stealth.getRandomizedTargetCoordinates(cardClickTarget);
    if (cardCoords) {
      await sendBgMessage({ type: 'FIRE_TRUSTED_CLICK', coords: cardCoords });
      try {
        cardClickTarget.click();
      } catch (_) {}
      await Stealth.sleep(Stealth.getRandomInt(1400, 2200));
    }

    // Evaluate match against keywords and salary
    const evalResult = await evaluateJobMatch(jobInfo);
    if (!evalResult.match) {
      logToBg(`[FILTERED] Skipped "${jobInfo.title}": ${evalResult.reason}. (Tip: disable filters in Filters tab to apply to all jobs)`, 'warning');
      await Stealth.sleep(Stealth.getRandomInt(800, 1500));
      processNextJob();
      return;
    }

    // Locate "Apply now" button with retry polling
    const applyButton = await waitForApplyButton(6000);
    if (!applyButton) {
      logToBg(`Could not locate "Apply now" button for "${jobInfo.title}" (may be external site or slow network). Advancing...`, 'warning');
      await Stealth.sleep(Stealth.getRandomInt(800, 1500));
      processNextJob();
      return;
    }

    // Check if the located button redirects externally
    const btnText = (applyButton.innerText || '').toLowerCase();
    if (btnText.includes('company site') || btnText.includes('employer site') || btnText.includes('external')) {
      logToBg(`Skipping "${jobInfo.title}": Apply button redirects to external company portal.`, 'info');
      processNextJob();
      return;
    }

    isApplyingCurrentJob = true;
    logToBg(`[APPLY] Initiating SmartApply for: "${jobInfo.title}" at "${jobInfo.company}"`, 'info');
    await Stealth.smoothScrollIntoView(applyButton);
    await Stealth.sleep(Stealth.getRandomInt(350, 700));

    // 1. Single physical click dispatch: Prevents multi-click bursts that spawn multiple tabs
    const applyCoords = Stealth.getRandomizedTargetCoordinates(applyButton);
    if (applyCoords) {
      await sendBgMessage({
        type: 'FIRE_TRUSTED_CLICK',
        coords: applyCoords
      });
    } else {
      // Fallback: Trigger native click only if physical coordinates were not resolved
      try {
        applyButton.click();
      } catch (_) {}
    }

    // 2. Register active job metadata with background
    sendBgMessage({
      type: 'APPLY_ATTEMPTED',
      jobTitle: jobInfo.title,
      company: jobInfo.company
    }).catch(() => {});

    // 3. Monitor application progression watchdog (checks for modal in current tab OR application tab in background)
    logToBg(`[DISPATCH] Clicked "Apply now" for "${jobInfo.title}". Monitoring application wizard...`, 'info');

    let applicationActive = false;
    for (let w = 0; w < 16; w++) {
      await Stealth.sleep(500);
      if (!isScanning || isPaused) {
        isApplyingCurrentJob = false;
        return;
      }

      // A. Check for modal/iframe in current tab
      const modal = document.querySelector(
        'iframe[src*="smartapply"], iframe[id*="indeed-apply"], iframe[id*="indeedapply"], iframe[title*="apply" i], div[role="dialog"], [data-testid="smartapply-modal"], .ia-BasePage, #indeed-apply-modal'
      );
      if (modal && Stealth.isElementVisible(modal)) {
        applicationActive = true;
        logToBg(`[MODAL] Application modal active for "${jobInfo.title}". Processing wizard steps...`, 'info');
        break;
      }

      // B. Check if background registered an application tab
      const tabCheck = await sendBgMessage({ type: 'CHECK_APPLICATION_TAB' });
      if (tabCheck && tabCheck.hasApplicationTab) {
        applicationActive = true;
        logToBg(`[TAB] SmartApply tab opened. Processing wizard steps...`, 'info');
        break;
      }
    }

    if (applicationActive) {
      // Lock remains active while user or solver completes this job application
      return;
    }

    logToBg(`[WATCHDOG] Apply form did not open for "${jobInfo.title}" (may already be applied or external). Advancing...`, 'warning');
    isApplyingCurrentJob = false;
    await Stealth.sleep(1200);
    processNextJob();
  }

  // Message router from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PING': {
        sendResponse({ pong: true });
        break;
      }

      case 'START_SCAN': {
        isScanning = true;
        isPaused = false;
        isApplyingCurrentJob = false;
        currentJobIndex = 0;
        if (message.profile) candidateProfile = message.profile;
        if (message.filters) filterConfig = message.filters;
        if (message.config) userConfig = message.config;

        console.log('[StealthScanner] Started scanning with config:', { filterConfig, userConfig });
        processNextJob();
        sendResponse({ success: true });
        break;
      }

      case 'NEXT_JOB': {
        console.log('[StealthScanner] Received signal to advance to next job.');
        isApplyingCurrentJob = false;
        if (isScanning && !isPaused) {
          processNextJob();
        }
        sendResponse({ success: true });
        break;
      }

      case 'PAUSE': {
        isPaused = true;
        console.log('[StealthScanner] Scanning paused.');
        sendResponse({ success: true });
        break;
      }

      case 'RESUME': {
        isScanning = true;
        isPaused = false;
        console.log('[StealthScanner] Scanning resumed.');
        processNextJob();
        sendResponse({ success: true });
        break;
      }

      case 'STOP': {
        isScanning = false;
        isPaused = false;
        console.log('[StealthScanner] Scanning stopped.');
        sendResponse({ success: true });
        break;
      }

      case 'GET_IFRAME_OFFSET': {
        // Find active SmartApply iframe on the page
        const iframe = document.querySelector(
          'iframe[src*="smartapply.indeed.com"], iframe[id*="indeed-apply-iframe"], iframe[data-testid*="indeed-apply"], iframe[name*="indeed-apply"]'
        );
        if (iframe) {
          const rect = iframe.getBoundingClientRect();
          sendResponse({ offset: { x: rect.left, y: rect.top } });
        } else {
          sendResponse({ offset: { x: 0, y: 0 } });
        }
        break;
      }

      default:
        sendResponse({ unhandled: true });
    }
  });

})();
