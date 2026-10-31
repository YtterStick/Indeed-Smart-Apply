/**
 * Indeed Stealth SmartApply - Form Solver
 * Operates inside SmartApply iframe/modal.
 * Orchestrates step detection, React input bypass, screening question resolution,
 * Cloudflare/CAPTCHA sentinel alerts, and trusted hardware progression.
 */

(function () {
  'use strict';

  // Teardown previous solver instance in this frame if any
  if (window.__stealthSolverInstance) {
    try {
      window.__stealthSolverInstance.stop();
    } catch (_) {}
  }

  const Stealth = window.StealthDOM;
  const isIframe = window.self !== window.top;

  let candidateProfile = null;
  let userConfig = { safeMode: true };
  let isSolving = false;
  let currentStepSignature = null;
  let activeSentinelCleanup = null;
  let observer = null;

  window.__stealthSolverInstance = {
    stop() {
      isSolving = false;
      if (observer) {
        try { observer.disconnect(); } catch (_) {}
      }
    }
  };

  console.log(`[StealthSolver] Content script active. Frame: ${isIframe ? 'iframe' : 'top'}`);

  // Retrieve stored settings
  async function loadConfig() {
    const data = await chrome.storage.local.get(['stealthProfile', 'stealthConfig']);
    candidateProfile = data.stealthProfile || getFallbackProfile();
    userConfig = data.stealthConfig || { safeMode: true };
  }

  function getFallbackProfile() {
    return {
      fullName: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: '',
      defaultYearsExperience: 2,
      yearsOfExperienceBySkill: {},
      salaryExpectation: { amount: null, currency: 'USD', period: 'Annual' },
      noticePeriod: 'Immediately',
      workAuthorization: true,
      sponsorshipRequired: false,
      relocationWillingness: false,
      nightShiftWillingness: false,
      driverLicense: true,
      backgroundCheckConsent: true,
      educationLevel: "Bachelor's Degree",
      customAnswers: {}
    };
  }

  // Communicate with background service worker
  function sendBgMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StealthSolver] Message error:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || {});
        }
      });
    });
  }

  let lastSentinelAlertTime = 0;

  // Auto-bypass visible Cloudflare Turnstile / reCAPTCHA checkboxes using trusted CDP hardware click
  async function attemptCaptchaBypass() {
    // 1. Cloudflare Turnstile interactive checkbox
    const turnstileBox = document.querySelector(
      'iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], #challenge-stage'
    );
    if (turnstileBox && Stealth.isElementVisible(turnstileBox)) {
      const rect = turnstileBox.getBoundingClientRect();
      if (rect.width >= 100 && rect.height >= 40) {
        console.log('[StealthSolver] Visible Cloudflare Turnstile checkbox detected. Dispatching trusted bypass click...');
        const coords = Stealth.getRandomizedTargetCoordinates(turnstileBox);
        if (coords) {
          await sendBgMessage({
            type: 'FIRE_TRUSTED_CLICK',
            coords: coords,
            isIframe: isIframe
          });
          await Stealth.sleep(1800);
          return true;
        }
      }
    }

    // 2. Visible reCAPTCHA / hCaptcha checkbox
    const recaptchaAnchor = document.querySelector(
      'iframe[src*="recaptcha/api2/anchor"]:not(.grecaptcha-badge iframe), iframe[src*="hcaptcha.com/captcha"]'
    );
    if (recaptchaAnchor && Stealth.isElementVisible(recaptchaAnchor)) {
      const rect = recaptchaAnchor.getBoundingClientRect();
      if (rect.width >= 120 && rect.height >= 45 && rect.top >= 0) {
        console.log('[StealthSolver] Visible reCAPTCHA checkbox detected. Dispatching trusted bypass click...');
        const coords = Stealth.getRandomizedTargetCoordinates(recaptchaAnchor);
        if (coords) {
          await sendBgMessage({
            type: 'FIRE_TRUSTED_CLICK',
            coords: coords,
            isIframe: isIframe
          });
          await Stealth.sleep(1800);
          return true;
        }
      }
    }

    return false;
  }

  // Sentinel Check: Only trigger on actual unresolved form validation errors
  function checkSentinelTriggers() {
    // 1. Explicit invalid inputs
    const invalidInput = document.querySelector('input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]');
    if (invalidInput && Stealth.isElementVisible(invalidInput)) {
      return { triggered: true, element: invalidInput, reason: 'Required field is empty or format is invalid' };
    }

    // 2. Visible field error messages within the form
    const errorMsg = document.querySelector(
      '.ia-BasePage-error, [data-testid*="error" i], span[class*="error" i], div[class*="error-message" i]'
    );
    if (errorMsg && Stealth.isElementVisible(errorMsg)) {
      const text = (errorMsg.innerText || '').trim();
      if (text.length > 5 && (text.toLowerCase().includes('required') || text.toLowerCase().includes('please enter') || text.toLowerCase().includes('invalid'))) {
        return { triggered: true, element: errorMsg, reason: `Form validation error: "${text.substring(0, 80)}"` };
      }
    }

    return { triggered: false };
  }

  // Step Identification
  function detectCurrentStep() {
    const bodyText = (document.body.innerText || '').toLowerCase();

    // 0. Transition / Loading screen (e.g. "Preparing review")
    if (
      bodyText.includes('preparing review') ||
      bodyText.includes('preparing your review') ||
      document.querySelector('[data-testid*="loading" i], [aria-busy="true"], .ia-BasePage--loading')
    ) {
      return 'LOADING';
    }

    // 1. Confirmation / Finished
    if (
      bodyText.includes('your application has been submitted') ||
      bodyText.includes('application submitted') ||
      bodyText.includes('your application was submitted') ||
      bodyText.includes('application has been sent') ||
      bodyText.includes('thank you for applying') ||
      bodyText.includes('application received') ||
      document.querySelector('[data-testid="application-submitted"]')
    ) {
      return 'SUBMITTED';
    }

    // 2. Review step
    const reviewBtn = Stealth.Selectors.findButtonByText(document, /Submit your application|Submit application/i);
    if (reviewBtn || bodyText.includes('review your application') || document.querySelector('[data-testid="review-page"]')) {
      return 'REVIEW';
    }

    // 3. Resume Selection
    const resumeCards = document.querySelectorAll(
      'input[type="radio"][name*="resume" i], [data-testid*="resume" i], [class*="resume-card" i]'
    );
    if (resumeCards.length > 0 || bodyText.includes('select a resume') || bodyText.includes('add a resume')) {
      return 'RESUME';
    }

    // 4. Contact Information
    const phoneInput = document.querySelector('input[type="tel"], input[id*="phone" i], input[name*="phone" i]');
    const nameInput = document.querySelector('input[id*="name" i], input[name*="name" i]');
    if (phoneInput || (nameInput && bodyText.includes('contact information'))) {
      return 'CONTACT';
    }

    // 5. Screening Questions
    const questions = Stealth.Selectors.findFormQuestions(document);
    if (questions.length > 0 || bodyText.includes('questions from the employer') || bodyText.includes('qualifications')) {
      return 'QUESTIONS';
    }

    return 'UNKNOWN';
  }

  // Solve Contact Information Step
  async function solveContactStep() {
    console.log('[StealthSolver] Solving Contact Information step...');
    const profile = candidateProfile || {};

    const fullName = (profile.fullName || '').trim();
    const nameParts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
    const firstName = profile.firstName || (nameParts[0] || '');
    const lastName = profile.lastName || (nameParts.slice(1).join(' ') || '');

    // First Name / Last Name / Full Name
    const firstNameInput = document.querySelector('input[id*="firstName" i], input[name*="firstName" i]');
    if (firstNameInput && !firstNameInput.value && firstName) {
      await Stealth.humanType(firstNameInput, firstName);
    }

    const lastNameInput = document.querySelector('input[id*="lastName" i], input[name*="lastName" i]');
    if (lastNameInput && !lastNameInput.value && lastName) {
      await Stealth.humanType(lastNameInput, lastName);
    }

    const fullNameInput = document.querySelector('input[id*="name" i]:not([id*="first" i]):not([id*="last" i])');
    if (fullNameInput && !fullNameInput.value && fullName) {
      await Stealth.humanType(fullNameInput, fullName);
    }

    // Email
    const emailInput = document.querySelector('input[type="email"], input[id*="email" i], input[name*="email" i]');
    if (emailInput && !emailInput.value && profile.email) {
      await Stealth.humanType(emailInput, profile.email);
    }

    // Phone
    const phoneInput = document.querySelector('input[type="tel"], input[id*="phone" i], input[name*="phone" i]');
    if (phoneInput && !phoneInput.value && profile.phone) {
      await Stealth.humanType(phoneInput, profile.phone);
    }

    // City / Location
    const locationInput = document.querySelector('input[id*="location" i], input[id*="city" i], input[name*="location" i]');
    if (locationInput && !locationInput.value && profile.location) {
      await Stealth.humanType(locationInput, profile.location);
    }

    return true;
  }

  // Solve Resume Selection Step
  async function solveResumeStep() {
    console.log('[StealthSolver] Solving Resume selection step...');
    // Prefer existing saved/uploaded Indeed resume
    const defaultResumeRadio = document.querySelector(
      'input[type="radio"][value*="indeed" i], input[type="radio"][value*="saved" i], input[type="radio"]'
    );

    if (defaultResumeRadio && !defaultResumeRadio.checked) {
      defaultResumeRadio.checked = true;
      Stealth.setNativeValue(defaultResumeRadio, defaultResumeRadio.value);
      defaultResumeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      await Stealth.sleep(Stealth.getRandomInt(300, 600));
    }

    return true;
  }

  // Solve Employer Screening Questions
  async function solveQuestionsStep() {
    console.log('[StealthSolver] Solving Screening Questions step...');
    const profile = candidateProfile;
    const questions = Stealth.Selectors.findFormQuestions(document);

    for (const qContainer of questions) {
      const qText = (qContainer.innerText || qContainer.textContent || '').trim();
      const qLower = qText.toLowerCase();

      // 1. Number / Years of experience
      const numberInput = qContainer.querySelector('input[type="number"], input[inputmode="numeric"]');
      if (numberInput && !numberInput.value) {
        let years = profile.defaultYearsExperience || 3;

        // Check if question asks about specific skill
        for (const [skill, val] of Object.entries(profile.yearsOfExperienceBySkill || {})) {
          if (qLower.includes(skill.toLowerCase())) {
            years = val;
            break;
          }
        }

        await Stealth.humanType(numberInput, String(years));
        continue;
      }

      // 2. Radio group (Yes / No questions)
      const radioInputs = Array.from(qContainer.querySelectorAll('input[type="radio"]'));
      if (radioInputs.length >= 2) {
        const isChecked = radioInputs.some(r => r.checked);
        if (!isChecked) {
          let desiredChoice = 'yes'; // Default positive response

          if (qLower.includes('require sponsorship') || qLower.includes('visa sponsorship')) {
            desiredChoice = profile.sponsorshipRequired ? 'yes' : 'no';
          } else if (qLower.includes('authorized to work') || qLower.includes('legally authorized')) {
            desiredChoice = profile.workAuthorization ? 'yes' : 'no';
          } else if (qLower.includes('willing to relocate') || qLower.includes('relocation')) {
            desiredChoice = profile.relocationWillingness ? 'yes' : 'no';
          } else if (qLower.includes('night shift') || qLower.includes('graveyard')) {
            desiredChoice = profile.nightShiftWillingness ? 'yes' : 'no';
          } else if (qLower.includes('valid driver') || qLower.includes('license')) {
            desiredChoice = profile.driverLicense ? 'yes' : 'no';
          } else if (qLower.includes('background check')) {
            desiredChoice = profile.backgroundCheckConsent ? 'yes' : 'no';
          }

          const targetRadio = radioInputs.find(r => {
            const parentText = (r.closest('label')?.innerText || r.parentElement?.innerText || r.value || '').toLowerCase();
            return parentText.includes(desiredChoice);
          }) || radioInputs[0];

          if (targetRadio) {
            targetRadio.checked = true;
            Stealth.setNativeValue(targetRadio, targetRadio.value);
            targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
            targetRadio.dispatchEvent(new Event('click', { bubbles: true }));
            await Stealth.sleep(Stealth.getRandomInt(200, 500));
          }
        }
        continue;
      }

      // 3. Dropdown / Select
      const selectEl = qContainer.querySelector('select');
      if (selectEl && (!selectEl.value || selectEl.value === '')) {
        let choice = "Bachelor's Degree";
        if (qLower.includes('education') || qLower.includes('degree')) {
          choice = profile.educationLevel || "Bachelor's";
        } else if (qLower.includes('notice period') || qLower.includes('start date')) {
          choice = profile.noticePeriod || '2 weeks';
        }
        await Stealth.humanSelect(selectEl, choice);
        continue;
      }

      // 4. Free text / Textarea
      const textInput = qContainer.querySelector('textarea, input[type="text"]');
      if (textInput && !textInput.value) {
        // Check local custom answers
        let answered = false;
        for (const [key, answer] of Object.entries(profile.customAnswers || {})) {
          if (qLower.includes(key.toLowerCase())) {
            await Stealth.humanType(textInput, answer);
            answered = true;
            break;
          }
        }

        // Check salary question
        if (!answered && (qLower.includes('salary') || qLower.includes('compensation') || qLower.includes('pay rate') || qLower.includes('expected pay'))) {
          if (profile.salaryExpectation && profile.salaryExpectation.amount) {
            const salStr = `${profile.salaryExpectation.currency || 'USD'} ${profile.salaryExpectation.amount.toLocaleString()} / ${profile.salaryExpectation.period || 'Annual'}`;
            await Stealth.humanType(textInput, salStr);
            answered = true;
          }
        }

        // Check availability / notice period question
        if (!answered && (qLower.includes('notice period') || qLower.includes('start date') || qLower.includes('when can you start') || qLower.includes('available to start'))) {
          if (profile.noticePeriod) {
            await Stealth.humanType(textInput, profile.noticePeriod);
            answered = true;
          }
        }

        // If not found, try Gemini AI fallback
        if (!answered) {
          const aiResponse = await sendBgMessage({
            type: 'SOLVE_WITH_AI',
            questionText: qText,
            questionType: textInput.tagName.toLowerCase(),
            profile: profile
          });

          if (aiResponse && aiResponse.success && aiResponse.answer) {
            await Stealth.humanType(textInput, aiResponse.answer);
          } else {
            // Trigger Sentinel for human intervention
            Stealth.playNotificationChime();
            activeSentinelCleanup = Stealth.highlightSentinelElement(
              qContainer,
              'Question needs human attention'
            );
            await sendBgMessage({
              type: 'TRIGGER_SENTINEL',
              reason: `Unanswered screening question: "${qText.substring(0, 60)}..."`
            });
            return false;
          }
        }
      }
    }

    return true;
  }

  // Advance Wizard to Next Step using Trusted Hardware Click & DOM Click
  async function advanceWizard() {
    // 1. Specific known selectors & test IDs
    let continueBtn = document.querySelector(
      '#form-action-continue, ' +
      '#form-action-continue button, ' +
      '#form-action-submit, ' +
      '#form-action-submit button, ' +
      'button[data-testid*="continue" i], ' +
      'button[data-testid*="submit" i], ' +
      'button[data-testid*="review" i], ' +
      'button[data-testid*="next" i], ' +
      'button[id*="continue" i], ' +
      'button[id*="submit" i], ' +
      'button.ia-continueButton, ' +
      'button.ia-submitButton, ' +
      'button[data-testid="review-button"], ' +
      'button[data-testid="form-page-next-button"]'
    );

    // If a container was matched, drill down to clickable button/anchor
    if (continueBtn && !continueBtn.matches('button, a, [role="button"], input[type="submit"]')) {
      continueBtn = continueBtn.querySelector('button, a, [role="button"], input[type="submit"]') || continueBtn;
    }

    // 2. Comprehensive text & aria regex scan
    if (!continueBtn) {
      continueBtn = Stealth.Selectors.findButtonByText(
        document,
        /^(Continue|Next|Review your application|Review application|Review|Save and continue|Save & continue|Submit your application|Submit application|Submit|Send application|Proceed|Next step|Confirm)$/i
      );
    }

    // 3. Substring text fallback
    if (!continueBtn) {
      continueBtn = Stealth.Selectors.findButtonByText(
        document,
        /Continue|Review|Next|Save & continue|Save and continue|Submit/i
      );
    }

    // 4. Footer or Form primary action button fallback
    if (!continueBtn) {
      const candidates = Array.from(document.querySelectorAll(
        '.ia-BasePage-footer button, footer button, form button[type="submit"], form button:not([type="button"]), div[class*="footer" i] button'
      ));
      continueBtn = candidates.find(btn => {
        if (!Stealth.isElementVisible(btn)) return false;
        const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
        return !text.includes('back') && !text.includes('cancel') && !text.includes('exit') && !text.includes('close');
      });
    }

    if (!continueBtn) {
      return false;
    }

    await Stealth.smoothScrollIntoView(continueBtn);
    const coords = Stealth.getRandomizedTargetCoordinates(continueBtn);

    // Human pacing between form steps: 1000ms - 2200ms
    const stepDelay = Stealth.getRandomInt(1000, 2200);
    console.log(`[StealthSolver] Form step pacing: waiting ${stepDelay}ms before clicking continue...`);
    await Stealth.sleep(stepDelay);

    // Request iframe offset if nested
    let iframeOffset = { x: 0, y: 0 };
    if (isIframe) {
      const offsetRes = await sendBgMessage({ type: 'GET_IFRAME_OFFSET' });
      if (offsetRes && offsetRes.offset) {
        iframeOffset = offsetRes.offset;
      }
    }

    if (coords) {
      await sendBgMessage({
        type: 'FIRE_TRUSTED_CLICK',
        coords: coords,
        isIframe: isIframe,
        iframeOffset: iframeOffset
      });
    } else {
      // Fallback single DOM click only if physical coordinates could not be resolved
      try {
        continueBtn.click();
      } catch (_) {}
    }

    return true;
  }

  // Handle Review & Final Submit
  async function handleReviewStep() {
    console.log('[StealthSolver] Handling Review step...');
    let submitBtn = document.querySelector(
      '#form-action-submit, ' +
      '#form-action-submit button, ' +
      'button[data-testid*="submit" i], ' +
      'button[id*="submit" i], ' +
      'button.ia-submitButton, ' +
      'button[data-testid="form-page-submit-button"]'
    );
    if (!submitBtn) {
      submitBtn = Stealth.Selectors.findButtonByText(
        document,
        /^(Submit your application|Submit application|Submit|Send application|Confirm and submit)$/i
      );
    }
    if (!submitBtn) {
      submitBtn = Stealth.Selectors.findButtonByText(
        document,
        /Submit your application|Submit application|Submit|Send application/i
      );
    }
    if (!submitBtn) {
      const footerButtons = Array.from(document.querySelectorAll('.ia-BasePage-footer button, footer button, form button[type="submit"]'));
      submitBtn = footerButtons.find(btn => {
        if (!Stealth.isElementVisible(btn)) return false;
        const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
        return !text.includes('back') && !text.includes('cancel') && !text.includes('exit');
      });
    }

    if (!submitBtn) {
      return false;
    }

    // Safe Mode Check
    if (userConfig.safeMode) {
      console.log('[StealthSolver] Safe Mode active: stopping before final submit.');
      Stealth.playNotificationChime();
      Stealth.highlightSentinelElement(submitBtn, 'Safe Mode: Inspect and submit manually');
      await sendBgMessage({
        type: 'SAFE_MODE_REVIEW_STOP',
        jobTitle: document.title || 'Indeed Job Application'
      });
      return true;
    }

    // Natural human review pause (1.5s - 2.8s)
    await Stealth.smoothScrollIntoView(submitBtn);
    const reviewDelay = Stealth.getRandomInt(1500, 2800);
    console.log(`[StealthSolver] Simulating final review: pausing ${reviewDelay}ms before submitting...`);
    await Stealth.sleep(reviewDelay);

    const coords = Stealth.getRandomizedTargetCoordinates(submitBtn);
    let iframeOffset = { x: 0, y: 0 };
    if (isIframe) {
      const offsetRes = await sendBgMessage({ type: 'GET_IFRAME_OFFSET' });
      if (offsetRes && offsetRes.offset) iframeOffset = offsetRes.offset;
    }

    if (coords) {
      await sendBgMessage({
        type: 'FIRE_TRUSTED_CLICK',
        coords: coords,
        isIframe: isIframe,
        iframeOffset: iframeOffset
      });
    }

    // Dual-trigger direct DOM click fallback
    await Stealth.sleep(250);
    try {
      submitBtn.click();
      const child = submitBtn.querySelector('button, a, span');
      if (child && child !== submitBtn) child.click();
    } catch (_) {}

    return true;
  }

  // Check if an application modal or form is currently active in this frame
  function isApplicationFormActive() {
    const href = (window.location.href || '').toLowerCase();

    // Exclude third-party tracking/recaptcha iframes
    if (isIframe) {
      if (href.includes('recaptcha') || href.includes('google') || href.includes('doubleclick') || href.includes('facebook') || href.includes('telemetry') || href.includes('analytics')) {
        return false;
      }
      return href.includes('smartapply') || href.includes('indeedapply') || href.includes('/apply/');
    }

    // In top frame:
    // If the top frame is on the dedicated SmartApply subdomain or application path
    if (href.includes('smartapply.indeed.com') || href.includes('/indeedapply/') || href.includes('/apply/')) {
      return true;
    }

    // In top frame on search/general page: must have an active application modal, dialog, or SmartApply iframe
    const modal = document.querySelector(
      'div[role="dialog"], [data-testid="smartapply-modal"], .ia-BasePage, #indeed-apply-modal, iframe[src*="smartapply"], iframe[id*="indeedapply"]'
    );
    return !!modal && Stealth.isElementVisible(modal);
  }

  // Main step processing engine
  async function processCurrentWizardStep() {
    if (isSolving) return;
    if (!isApplicationFormActive()) return;
    isSolving = true;

    try {
      await loadConfig();

      // Attempt to auto-bypass any visible Turnstile or checkbox CAPTCHA first
      await attemptCaptchaBypass();

      // 1. Sentinel Check: Only trigger on actual blocking challenges
      const sentinel = checkSentinelTriggers();
      if (sentinel.triggered) {
        if (Date.now() - lastSentinelAlertTime > 15000) {
          lastSentinelAlertTime = Date.now();
          Stealth.playNotificationChime();
          activeSentinelCleanup = Stealth.highlightSentinelElement(sentinel.element, sentinel.reason);
          await sendBgMessage({
            type: 'TRIGGER_SENTINEL',
            reason: sentinel.reason
          });
        }
        isSolving = false;
        return;
      }

      // Clear any prior sentinel highlight if resolved
      if (activeSentinelCleanup) {
        activeSentinelCleanup();
        activeSentinelCleanup = null;
      }

      // 2. Identify Current Step
      const step = detectCurrentStep();
      const currentSignature = `${step}_${document.body.innerText.length}`;

      if (currentSignature === currentStepSignature && step !== 'SUBMITTED' && step !== 'LOADING') {
        // Step hasn't changed yet, wait for DOM update
        isSolving = false;
        return;
      }
      currentStepSignature = currentSignature;

      console.log(`[StealthSolver] Current wizard step: ${step}`);

      switch (step) {
        case 'LOADING': {
          console.log('[StealthSolver] Application in transition/loading (e.g. Preparing review). Waiting for DOM...');
          await Stealth.sleep(1500);
          break;
        }

        case 'CONTACT': {
          await solveContactStep();
          await advanceWizard();
          break;
        }

        case 'RESUME': {
          await solveResumeStep();
          await advanceWizard();
          break;
        }

        case 'QUESTIONS': {
          const solved = await solveQuestionsStep();
          if (solved) {
            await advanceWizard();
          }
          break;
        }

        case 'REVIEW': {
          await handleReviewStep();
          break;
        }

        case 'SUBMITTED': {
          console.log('[StealthSolver] Application successfully submitted!');
          await sendBgMessage({
            type: 'APPLICATION_COMPLETED',
            jobTitle: document.title || 'Indeed Application'
          });
          break;
        }

        default: {
          console.log('[StealthSolver] Step unknown or in transition. Checking for progression button...');
          const genericAdvance = await advanceWizard();
          if (!genericAdvance) {
            console.log('[StealthSolver] Waiting for DOM transition.');
          }
          break;
        }
      }
    } catch (err) {
      console.error('[StealthSolver] Error processing wizard step:', err);
    } finally {
      isSolving = false;
    }
  }

  // Observe DOM changes in the modal/wizard
  observer = new MutationObserver(() => {
    // Debounce processing
    clearTimeout(window.__stealthSolverTimer);
    window.__stealthSolverTimer = setTimeout(() => {
      processCurrentWizardStep();
    }, 600);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false
  });

  // Initial execution check with staggered retries for async hydration
  setTimeout(() => {
    processCurrentWizardStep();
  }, 1000);
  setTimeout(() => {
    processCurrentWizardStep();
  }, 2500);

})();
