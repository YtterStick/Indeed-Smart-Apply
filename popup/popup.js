/**
 * Indeed Stealth SmartApply - Popup Dashboard Logic
 * Coordinates UI state, telemetry feeds, JSON dictionary validation,
 * and background service worker message passing.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statusBadge = document.getElementById('statusBadge');
  const statToday = document.getElementById('statToday');
  const statSession = document.getElementById('statSession');
  const statCooldown = document.getElementById('statCooldown');
  const safeModeCheck = document.getElementById('safeModeCheck');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const logStream = document.getElementById('logStream');

  // Search Controls
  const searchWhat = document.getElementById('searchWhat');
  const searchWhere = document.getElementById('searchWhere');
  const btnSearchIndeed = document.getElementById('btnSearchIndeed');

  // Tabs
  const tabButtons = document.querySelectorAll('.nav-item, .tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Profile Form Elements
  const profFullName = document.getElementById('profFullName');
  const profEmail = document.getElementById('profEmail');
  const profPhone = document.getElementById('profPhone');
  const profLocation = document.getElementById('profLocation');
  const profSalaryAmount = document.getElementById('profSalaryAmount');
  const profSalaryCurrency = document.getElementById('profSalaryCurrency');
  const profSalaryPeriod = document.getElementById('profSalaryPeriod');
  const profNoticePeriod = document.getElementById('profNoticePeriod');
  const checkWorkAuth = document.getElementById('checkWorkAuth');
  const checkSponsorship = document.getElementById('checkSponsorship');
  const checkRelocate = document.getElementById('checkRelocate');
  const checkNightShift = document.getElementById('checkNightShift');
  const checkDriverLicense = document.getElementById('checkDriverLicense');
  const checkBackgroundCheck = document.getElementById('checkBackgroundCheck');
  const profSkillsJson = document.getElementById('profSkillsJson');
  const profCustomAnswersJson = document.getElementById('profCustomAnswersJson');
  const btnSaveProfile = document.getElementById('btnSaveProfile');
  const profileSavedNotice = document.getElementById('profileSavedNotice');

  // Filter Elements
  const checkFiltersEnabled = document.getElementById('checkFiltersEnabled');
  const filterStatusPill = document.getElementById('filterStatusPill');
  const filterStatusText = document.getElementById('filterStatusText');
  const filterSalaryMin = document.getElementById('filterSalaryMin');
  const filterSalaryMax = document.getElementById('filterSalaryMax');
  const filterSalaryPeriod = document.getElementById('filterSalaryPeriod');
  const checkRequireSalary = document.getElementById('checkRequireSalary');
  const filterBlacklist = document.getElementById('filterBlacklist');
  const filterMustHave = document.getElementById('filterMustHave');
  const btnSaveFilters = document.getElementById('btnSaveFilters');
  const filtersSavedNotice = document.getElementById('filtersSavedNotice');

  function updateFilterStatusBadge(filters) {
    if (!filterStatusPill || !filterStatusText) return;
    const isEnabled = !!filters.enabled;
    if (checkFiltersEnabled) checkFiltersEnabled.checked = isEnabled;

    if (isEnabled) {
      filterStatusPill.classList.add('active');
      const details = [];
      if (filters.salaryMin || filters.salaryMax) {
        details.push(`Salary ${filters.salaryMin || 0}-${filters.salaryMax || '∞'}`);
      }
      if (filters.blacklist && filters.blacklist.length > 0) {
        details.push(`${filters.blacklist.length} blacklist`);
      }
      filterStatusText.textContent = details.length > 0 
        ? `Filters: ON (${details.join(', ')})`
        : 'Filters: ON (Active)';
    } else {
      filterStatusPill.classList.remove('active');
      filterStatusText.textContent = 'Filters: OFF (Applying to all jobs)';
    }
  }

  // Settings Elements
  const settingDailyCap = document.getElementById('settingDailyCap');
  const settingGeminiKey = document.getElementById('settingGeminiKey');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const settingsSavedNotice = document.getElementById('settingsSavedNotice');

  let cooldownTimerInterval = null;

  // 1. Tab Navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  // 2. Load Persisted State & Storage
  async function loadInitialData() {
    const data = await chrome.storage.local.get([
      'stealthProfile',
      'stealthFilters',
      'stealthConfig',
      'stealthLogs',
      'stealthDailyStats'
    ]);

    // Profile defaults for fresh installs
    const profile = data.stealthProfile || {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      salaryExpectation: { amount: '', currency: 'PHP', period: 'Monthly' },
      noticePeriod: '',
      workAuthorization: true,
      sponsorshipRequired: false,
      relocationWillingness: false,
      nightShiftWillingness: false,
      driverLicense: true,
      backgroundCheckConsent: true,
      yearsOfExperienceBySkill: {},
      customAnswers: {}
    };

    profFullName.value = profile.fullName || '';
    profEmail.value = profile.email || '';
    profPhone.value = profile.phone || '';
    profLocation.value = profile.location || '';
    profSalaryAmount.value = profile.salaryExpectation?.amount || '';
    profSalaryCurrency.value = profile.salaryExpectation?.currency || 'PHP';
    profSalaryPeriod.value = profile.salaryExpectation?.period || 'Monthly';
    profNoticePeriod.value = profile.noticePeriod || '';
    checkWorkAuth.checked = profile.workAuthorization !== false;
    checkSponsorship.checked = !!profile.sponsorshipRequired;
    checkRelocate.checked = !!profile.relocationWillingness;
    checkNightShift.checked = !!profile.nightShiftWillingness;
    checkDriverLicense.checked = profile.driverLicense !== false;
    checkBackgroundCheck.checked = profile.backgroundCheckConsent !== false;

    // Show JSON in textarea only if configured, so placeholder hints remain visible for fresh users
    profSkillsJson.value = (profile.yearsOfExperienceBySkill && Object.keys(profile.yearsOfExperienceBySkill).length > 0)
      ? JSON.stringify(profile.yearsOfExperienceBySkill, null, 2)
      : '';
    profCustomAnswersJson.value = (profile.customAnswers && Object.keys(profile.customAnswers).length > 0)
      ? JSON.stringify(profile.customAnswers, null, 2)
      : '';

    // Filters (Default enabled: false so bot applies to all jobs unless user explicitly activates filters)
    const filters = data.stealthFilters || {
      enabled: false,
      blacklist: [],
      mustHave: [],
      salaryMin: null,
      salaryMax: null,
      salaryPeriod: 'any',
      requireSalary: false
    };
    if (checkFiltersEnabled) checkFiltersEnabled.checked = !!filters.enabled;
    updateFilterStatusBadge(filters);
    filterBlacklist.value = (filters.blacklist || []).join(', ');
    filterMustHave.value = (filters.mustHave || []).join(', ');
    filterSalaryMin.value = (filters.salaryMin !== null && filters.salaryMin !== undefined) ? filters.salaryMin : '';
    filterSalaryMax.value = (filters.salaryMax !== null && filters.salaryMax !== undefined) ? filters.salaryMax : '';
    filterSalaryPeriod.value = filters.salaryPeriod || 'any';
    checkRequireSalary.checked = !!filters.requireSalary;

    // Settings (Default safeMode: false so bot auto-submits unless user wants manual review)
    const config = data.stealthConfig || {
      safeMode: false,
      dailyCap: 25,
      geminiApiKey: '',
      searchWhat: '',
      searchWhere: ''
    };
    safeModeCheck.checked = !!config.safeMode;
    updateStartButtonText();
    settingDailyCap.value = config.dailyCap || 25;
    settingGeminiKey.value = config.geminiApiKey || '';
    if (searchWhat) searchWhat.value = config.searchWhat || '';
    if (searchWhere) searchWhere.value = config.searchWhere || '';

    // Logs
    if (data.stealthLogs && Array.isArray(data.stealthLogs)) {
      renderLogs(data.stealthLogs);
    }

    // Daily Stats
    const today = new Date().toISOString().split('T')[0];
    const stats = data.stealthDailyStats || { date: today, count: 0 };
    statToday.textContent = `${stats.count || 0} / ${config.dailyCap || 25}`;

    // Query active state from background
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res && res.state) {
        updateUIState(res.state);
      }
    });
  }

  // 3. Render Live Logs
  function renderLogs(logs) {
    logStream.innerHTML = '';
    logs.forEach(item => {
      const row = document.createElement('div');
      row.className = 'log-entry';
      row.innerHTML = `
        <span class="log-time">[${item.timestamp}]</span>
        <span class="log-msg-${item.level || 'info'}">${escapeHtml(item.message)}</span>
      `;
      logStream.appendChild(row);
    });
    logStream.scrollTop = 0;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  const svgPlay = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
  const svgShield = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';

  function updateStartButtonText() {
    if (btnStart.disabled) return;
    if (btnStart.innerText.includes('Resume')) return;
    if (safeModeCheck && safeModeCheck.checked) {
      btnStart.innerHTML = `${svgShield} Start Auto-Apply (Review Mode)`;
    } else {
      btnStart.innerHTML = `${svgPlay} Start Full Auto-Apply`;
    }
  }

  // 4. Update UI State based on background telemetry
  function updateUIState(state) {
    if (!state) return;

    let statusClass = 'status-idle';
    let statusText = state.status || 'IDLE';

    switch (state.status) {
      case 'RUNNING':
        statusClass = 'status-running';
        statusText = 'RUNNING';
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        break;

      case 'PAUSED_FOR_HUMAN':
        statusClass = 'status-paused';
        statusText = 'PAUSED';
        btnStart.disabled = false;
        btnStart.innerHTML = `${svgPlay} Resume`;
        btnPause.disabled = true;
        btnStop.disabled = false;
        break;

      case 'COFFEE_BREAK':
        statusClass = 'status-coffee';
        statusText = 'COFFEE BREAK';
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        break;

      case 'DAILY_CAP_REACHED':
        statusClass = 'status-cap';
        statusText = 'DAILY CAP MET';
        btnStart.disabled = true;
        btnPause.disabled = true;
        btnStop.disabled = false;
        break;

      default:
        statusClass = 'status-idle';
        statusText = 'IDLE';
        btnStart.disabled = false;
        updateStartButtonText();
        btnPause.disabled = true;
        btnStop.disabled = true;
        break;
    }
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">${statusText}</span>`;

    // Counters
    statToday.textContent = `${state.applicationsToday || 0} / ${state.dailyCap || 25}`;
    statSession.textContent = `${state.applicationsInSession || 0}`;

    // Cooldown countdown
    if (state.status === 'COFFEE_BREAK' && state.cooldownEndsAt) {
      startCooldownTimer(state.cooldownEndsAt);
    } else {
      clearInterval(cooldownTimerInterval);
      statCooldown.textContent = 'Ready';
    }

    // Refresh logs if available
    if (state.logs && Array.isArray(state.logs)) {
      renderLogs(state.logs);
    }
  }

  function startCooldownTimer(endsAt) {
    clearInterval(cooldownTimerInterval);
    const update = () => {
      const remainingMs = endsAt - Date.now();
      if (remainingMs <= 0) {
        statCooldown.textContent = 'Ready';
        clearInterval(cooldownTimerInterval);
      } else {
        const totalSec = Math.floor(remainingMs / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        statCooldown.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      }
    };
    update();
    cooldownTimerInterval = setInterval(update, 1000);
  }

  // 5. Build Current Candidate Profile Object
  function getCandidateProfileObject() {
    let skills = {};
    try {
      skills = JSON.parse(profSkillsJson.value.trim() || '{}');
    } catch (_) {
      skills = {};
    }

    let customAnswers = {};
    try {
      customAnswers = JSON.parse(profCustomAnswersJson.value.trim() || '{}');
    } catch (_) {
      customAnswers = {};
    }

    const nameParts = profFullName.value.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return {
      fullName: profFullName.value.trim(),
      firstName: firstName,
      lastName: lastName,
      email: profEmail.value.trim(),
      phone: profPhone.value.trim(),
      location: profLocation.value.trim(),
      salaryExpectation: {
        amount: profSalaryAmount.value ? Number(profSalaryAmount.value) : null,
        currency: profSalaryCurrency.value || 'USD',
        period: profSalaryPeriod.value || 'Annual'
      },
      noticePeriod: profNoticePeriod.value.trim() || 'Immediately',
      workAuthorization: checkWorkAuth.checked,
      sponsorshipRequired: checkSponsorship.checked,
      relocationWillingness: checkRelocate.checked,
      nightShiftWillingness: checkNightShift.checked,
      driverLicense: checkDriverLicense.checked,
      backgroundCheckConsent: checkBackgroundCheck.checked,
      defaultYearsExperience: 2,
      yearsOfExperienceBySkill: skills,
      customAnswers: customAnswers
    };
  }

  // 5b. Build Filter Config Object
  function getFilterConfigObject() {
    return {
      enabled: checkFiltersEnabled ? checkFiltersEnabled.checked : false,
      blacklist: filterBlacklist.value.split(',').map(s => s.trim()).filter(Boolean),
      mustHave: filterMustHave.value.split(',').map(s => s.trim()).filter(Boolean),
      salaryMin: filterSalaryMin.value ? Number(filterSalaryMin.value) : null,
      salaryMax: filterSalaryMax.value ? Number(filterSalaryMax.value) : null,
      salaryPeriod: filterSalaryPeriod.value || 'any',
      requireSalary: checkRequireSalary.checked
    };
  }

  // 6. Action Button Listeners
  if (btnSearchIndeed) {
    btnSearchIndeed.addEventListener('click', () => {
      const what = (searchWhat ? searchWhat.value : '').trim();
      const where = (searchWhere ? searchWhere.value : '').trim();
      if (!what && !where) {
        alert('Please enter at least a job title (What) or location (Where).');
        return;
      }
      // Save current search terms
      chrome.storage.local.get(['stealthConfig'], (res) => {
        const cfg = res.stealthConfig || {};
        cfg.searchWhat = what;
        cfg.searchWhere = where;
        chrome.storage.local.set({ stealthConfig: cfg });
      });
      chrome.runtime.sendMessage({
        type: 'NAVIGATE_SEARCH',
        what,
        where
      });
    });
  }

  btnStart.addEventListener('click', async () => {
    const isResume = btnStart.innerText.includes('Resume');
    const profile = getCandidateProfileObject();

    // Guardrail for outside users: Ensure candidate identity is set before launching
    if (!isResume && (!profile.fullName || !profile.email)) {
      alert('⚠️ Candidate Profile Incomplete\n\nPlease enter at least your Full Name and Email in the Profile tab before launching auto-apply.');
      const profileTabBtn = document.querySelector('[data-tab="tab-profile"]');
      if (profileTabBtn) profileTabBtn.click();
      return;
    }

    const filters = getFilterConfigObject();
    const what = (searchWhat ? searchWhat.value : '').trim();
    const where = (searchWhere ? searchWhere.value : '').trim();
    const config = {
      safeMode: safeModeCheck.checked,
      dailyCap: Number(settingDailyCap.value) || 25,
      geminiApiKey: settingGeminiKey.value.trim(),
      searchWhat: what,
      searchWhere: where
    };

    // Save state before starting
    await chrome.storage.local.set({
      stealthProfile: profile,
      stealthFilters: filters,
      stealthConfig: config
    });

    const msgType = isResume ? 'RESUME_AUTOMATION' : 'START_AUTOMATION';

    chrome.runtime.sendMessage({
      type: msgType,
      config,
      profile,
      filters,
      searchWhat: what,
      searchWhere: where
    }, (res) => {
      if (res && res.error) {
        alert(res.error);
      }
    });
  });

  btnPause.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_AUTOMATION' });
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' });
  });

  safeModeCheck.addEventListener('change', () => {
    updateStartButtonText();
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { safeMode: safeModeCheck.checked }
    });
    chrome.storage.local.get(['stealthConfig'], (res) => {
      const cfg = res.stealthConfig || {};
      cfg.safeMode = safeModeCheck.checked;
      chrome.storage.local.set({ stealthConfig: cfg });
    });
  });

  btnClearLogs.addEventListener('click', () => {
    chrome.storage.local.set({ stealthLogs: [] });
    logStream.innerHTML = '';
  });

  // 7. Save Handlers with Visual Feedback
  function flashNotice(el) {
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  btnSaveProfile.addEventListener('click', async () => {
    try {
      JSON.parse(profSkillsJson.value.trim() || '{}');
      JSON.parse(profCustomAnswersJson.value.trim() || '{}');
    } catch (e) {
      alert('Invalid JSON in Skills or Custom Q&A: ' + e.message);
      return;
    }

    const profile = getCandidateProfileObject();
    await chrome.storage.local.set({ stealthProfile: profile });
    flashNotice(profileSavedNotice);
  });

  btnSaveFilters.addEventListener('click', async () => {
    const filters = getFilterConfigObject();
    await chrome.storage.local.set({ stealthFilters: filters });
    updateFilterStatusBadge(filters);
    flashNotice(filtersSavedNotice);
  });

  if (checkFiltersEnabled) {
    checkFiltersEnabled.addEventListener('change', async () => {
      const filters = getFilterConfigObject();
      await chrome.storage.local.set({ stealthFilters: filters });
      updateFilterStatusBadge(filters);
    });
  }

  const btnClearFilters = document.getElementById('btnClearFilters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', async () => {
      filterBlacklist.value = '';
      filterMustHave.value = '';
      filterSalaryMin.value = '';
      filterSalaryMax.value = '';
      filterSalaryPeriod.value = 'any';
      checkRequireSalary.checked = false;
      if (checkFiltersEnabled) checkFiltersEnabled.checked = false;
      const emptyFilters = {
        enabled: false,
        blacklist: [],
        mustHave: [],
        salaryMin: null,
        salaryMax: null,
        salaryPeriod: 'any',
        requireSalary: false
      };
      await chrome.storage.local.set({ stealthFilters: emptyFilters });
      updateFilterStatusBadge(emptyFilters);
      flashNotice(filtersSavedNotice);
    });
  }

  btnSaveSettings.addEventListener('click', async () => {
    const config = {
      safeMode: safeModeCheck.checked,
      dailyCap: Number(settingDailyCap.value) || 25,
      geminiApiKey: settingGeminiKey.value.trim()
    };
    await chrome.storage.local.set({ stealthConfig: config });
    chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config });
    flashNotice(settingsSavedNotice);
  });

  // 8. Live Background State Subscription
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      updateUIState(message.state);
    }
  });

  // Initialize
  await loadInitialData();
});
