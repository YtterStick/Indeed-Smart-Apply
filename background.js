/**
 * Indeed Stealth SmartApply - Background Service Worker
 * Orchestrates CDP trusted hardware clicks, queue state machine,
 * behavioral pacing, coffee breaks, AI fallback, and cross-frame routing.
 */

// Track attached debugger sessions
const attachedTabs = new Set();
let currentMousePos = { x: 400, y: 300 };

// Queue & State Machine status
const STATE = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED_FOR_HUMAN: 'PAUSED_FOR_HUMAN',
  COFFEE_BREAK: 'COFFEE_BREAK',
  DAILY_CAP_REACHED: 'DAILY_CAP_REACHED',
  STOPPED: 'STOPPED'
};

let queueState = {
  status: STATE.IDLE,
  activeTabId: null,
  searchTabId: null,
  applicationTabId: null,
  applicationsInSession: 0,
  applicationsToday: 0,
  lastApplicationDate: new Date().toISOString().split('T')[0],
  cooldownEndsAt: null,
  currentJobTitle: null,
  currentCompany: null,
  safeMode: false,
  dailyCap: 25,
  logs: []
};

// Utilities
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function logActivity(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = { timestamp, message, level, id: Date.now() + Math.random() };
  queueState.logs.unshift(entry);
  if (queueState.logs.length > 100) {
    queueState.logs.pop();
  }
  chrome.storage.local.set({ stealthLogs: queueState.logs });
  broadcastState();
  console.log(`[StealthApply ${level.toUpperCase()}] ${timestamp} - ${message}`);
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    state: queueState
  }).catch(() => {
    // Popup might not be open, which is normal
  });
}

// Persist and restore state
async function initStorage() {
  const data = await chrome.storage.local.get([
    'stealthProfile',
    'stealthFilters',
    'stealthConfig',
    'stealthLogs',
    'stealthDailyStats'
  ]);

  const today = new Date().toISOString().split('T')[0];
  const stats = data.stealthDailyStats || { date: today, count: 0 };

  if (stats.date !== today) {
    queueState.applicationsToday = 0;
    queueState.lastApplicationDate = today;
    await chrome.storage.local.set({ stealthDailyStats: { date: today, count: 0 } });
  } else {
    queueState.applicationsToday = stats.count;
    queueState.lastApplicationDate = stats.date;
  }

  if (data.stealthConfig) {
    queueState.safeMode = data.stealthConfig.safeMode !== undefined ? data.stealthConfig.safeMode : false;
    queueState.dailyCap = data.stealthConfig.dailyCap || 25;
  }

  if (data.stealthLogs && Array.isArray(data.stealthLogs)) {
    queueState.logs = data.stealthLogs.slice(0, 50);
  }

  logActivity('Stealth SmartApply initialized. Ready for automation.', 'info');
}

initStorage();

// Track SmartApply tab creation and lifecycle
chrome.tabs.onCreated.addListener((tab) => {
  if (queueState.status === STATE.RUNNING && queueState.searchTabId) {
    queueState.applicationTabId = tab.id;
    console.log(`[StealthBackground] Registered application tab: ${tab.id}`);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (queueState.status !== STATE.RUNNING) return;

  if (tabId === queueState.applicationTabId && changeInfo.status === 'complete') {
    const url = (tab.url || '').toLowerCase();
    if (url.includes('indeed.com') || url.includes('smartapply')) {
      console.log(`[StealthBackground] Application tab ${tabId} loaded. Injecting solver...`);
      await sleep(600);
      await ensureSolverInjected(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (tabId === queueState.applicationTabId) {
    console.log(`[StealthBackground] Application tab ${tabId} closed.`);
    queueState.applicationTabId = null;
    if (queueState.searchTabId) {
      chrome.tabs.update(queueState.searchTabId, { active: true }).catch(() => {});
    }
  }
});

// Clean up debugger when detached by user or tab close
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    logActivity(`Debugger detached from tab ${source.tabId} (${reason})`, 'warning');
  }
});

// CDP Command Wrapper
function sendCdpCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// Attach CDP 1.3
async function ensureDebuggerAttached(tabId) {
  if (attachedTabs.has(tabId)) return true;

  return new Promise((resolve) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        if (msg.includes('Already attached')) {
          attachedTabs.add(tabId);
          resolve(true);
          return;
        }
        logActivity(`Failed to attach debugger: ${msg}`, 'error');
        resolve(false);
        return;
      }
      attachedTabs.add(tabId);
      logActivity(`CDP Debugger attached to tab ${tabId} for trusted hardware clicks`, 'info');
      resolve(true);
    });
  });
}

// Simulate realistic cursor bezier curve motion
async function simulateNaturalMovement(tabId, startX, startY, endX, endY) {
  const steps = getRandomInt(4, 7);
  const midX = (startX + endX) / 2 + getRandomInt(-30, 30);
  const midY = (startY + endY) / 2 + getRandomInt(-30, 30);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const curX = Math.round((1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX);
    const curY = Math.round((1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY);

    await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: curX,
      y: curY
    }).catch(() => {});

    await sleep(getRandomInt(12, 28));
  }
}

// Trusted Hardware Click Generator
async function dispatchTrustedHardwareClick(tabId, targetCoords) {
  const success = await ensureDebuggerAttached(tabId);
  if (!success) {
    throw new Error('Could not attach debugger for trusted click');
  }

  const { x, y } = targetCoords;
  const startX = currentMousePos.x || (x - getRandomInt(50, 150));
  const startY = currentMousePos.y || (y - getRandomInt(50, 150));

  // 1. Natural mouse trajectory
  await simulateNaturalMovement(tabId, startX, startY, x, y);
  currentMousePos = { x, y };

  // 2. Pre-click settling delay
  await sleep(getRandomInt(40, 110));

  // 3. Mouse Down
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x,
    y: y,
    button: 'left',
    clickCount: 1
  });

  // 4. Physical button hold down delay
  await sleep(getRandomInt(50, 140));

  // 5. Mouse Up (event.isTrusted === true)
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x,
    y: y,
    button: 'left',
    clickCount: 1
  });

  return true;
}

// Gemini API Fallback for dynamic screening questions
async function queryGeminiForAnswer(questionText, questionType, profile, jobTitle) {
  const storage = await chrome.storage.local.get(['stealthConfig']);
  const apiKey = storage.stealthConfig?.geminiApiKey;

  if (!apiKey) {
    return { success: false, reason: 'No Gemini API key provided' };
  }

  const prompt = `You are an AI assistant answering job application screening questions accurately based on this candidate profile:
Candidate Profile:
${JSON.stringify(profile, null, 2)}

Job Title: ${jobTitle || 'Relevant Position'}
Screening Question: "${questionText}"
Question Type: ${questionType}

Instructions:
- If this is a number question (e.g. "How many years of experience...?"), reply with ONLY a single integer or number matching candidate skills.
- If this is a Yes/No question, reply with ONLY "Yes" or "No".
- If this asks for a short text response, provide a professional, concise response (1-2 sentences) aligned with the candidate's profile.
- If uncertain or if the candidate profile clearly does not fit, say "UNKNOWN".

Output ONLY the answer without markdown, quotes, or conversational filler.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const candidateAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!candidateAnswer || candidateAnswer.toUpperCase().includes('UNKNOWN')) {
      return { success: false, reason: 'Gemini indicated UNKNOWN answer' };
    }

    return { success: true, answer: candidateAnswer };
  } catch (err) {
    logActivity(`Gemini fallback error: ${err.message}`, 'warning');
    return { success: false, reason: err.message };
  }
}

// Behavioral Throttling & Cooldown Manager
async function handleCoffeeBreak() {
  const breakMinutes = getRandomInt(8, 12);
  const breakMs = breakMinutes * 60 * 1000;
  queueState.status = STATE.COFFEE_BREAK;
  queueState.cooldownEndsAt = Date.now() + breakMs;

  logActivity(`[Pacing] Cooldown active for ${breakMinutes} minutes to evade velocity tracking.`, 'warning');
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Indeed Stealth: Coffee Break Active',
    message: `Applied to 6 jobs. Pausing for ${breakMinutes} minutes for human pacing.`
  });

  broadcastState();

  await sleep(breakMs);

  if (queueState.status === STATE.COFFEE_BREAK) {
    queueState.status = STATE.RUNNING;
    queueState.cooldownEndsAt = null;
    logActivity('[Pacing] Cooldown concluded. Resuming application queue.', 'info');
    broadcastState();
  }
}

// Ensure solver script is active in the target tab or modal
async function ensureSolverInjected(tabId) {
  if (!tabId) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['utils/dom-stealth.js', 'content/solver.js']
    }).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[StealthBackground] Solver injection warning:', err.message);
    return false;
  }
}

// Ensure content scripts are active in the target tab
async function ensureScannerInjected(tabId) {
  if (!tabId) return false;
  try {
    const isAlive = await new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.pong) resolve(false);
        else resolve(true);
      });
    });
    if (isAlive) return true;
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['utils/dom-stealth.js', 'content/scanner.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['utils/dom-stealth.js', 'content/solver.js']
    }).catch(() => {});
    await sleep(250);
    return true;
  } catch (err) {
    console.warn('[StealthBackground] Script injection warning:', err.message);
    return false;
  }
}

// Message Bus
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = (sender.tab && sender.tab.id) 
    ? sender.tab.id 
    : (queueState.applicationTabId || queueState.searchTabId || queueState.activeTabId);

  switch (message.type) {
    // 1. Trusted Click Request from content scripts (scanner or solver)
    case 'FIRE_TRUSTED_CLICK': {
      (async () => {
        try {
          let coords = message.coords;

          // If click is dispatched from an iframe, adjust coordinates using iframe position
          if (message.isIframe && message.iframeOffset) {
            coords = {
              x: coords.x + message.iframeOffset.x,
              y: coords.y + message.iframeOffset.y
            };
          }

          await dispatchTrustedHardwareClick(tabId, coords);
          sendResponse({ success: true });
        } catch (err) {
          logActivity(`Trusted click error: ${err.message}`, 'error');
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // Keep channel open for async response
    }

    // 2. Sentinel Alert (Screening question or form validation error)
    case 'TRIGGER_SENTINEL': {
      // Discard any CAPTCHA or challenge sentinel triggers.
      // attemptCaptchaBypass() handles real checkboxes automatically; sentinel should never pause for CAPTCHAs.
      if (message.reason && /captcha|challenge/i.test(message.reason)) {
        console.warn('[StealthBackground] Dropping false/stale CAPTCHA sentinel alert:', message.reason);
        sendResponse({ ignored: true });
        break;
      }

      const now = Date.now();
      if (queueState.lastSentinelTime && (now - queueState.lastSentinelTime < 15000)) {
        sendResponse({ ignored: true });
        break;
      }
      queueState.lastSentinelTime = now;
      queueState.status = STATE.PAUSED_FOR_HUMAN;
      logActivity(`[Sentinel] ${message.reason}. Paused for human intervention.`, 'warning');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Indeed Stealth: Human Action Needed',
        message: message.reason || 'Screening question requires attention or verification.'
      });
      broadcastState();
      sendResponse({ success: true });
      break;
    }

    // Custom telemetry logging from content scripts
    case 'LOG_ACTIVITY': {
      logActivity(message.message, message.level || 'info');
      sendResponse({ success: true });
      break;
    }

    // Application link triggered from search tab
    case 'APPLY_LINK_TRIGGERED': {
      queueState.currentJobTitle = message.jobTitle || '';
      queueState.currentCompany = message.company || '';
      // Watchdog fallback: if browser popup blocker prevented new tab, open it explicitly
      setTimeout(async () => {
        if (!queueState.applicationTabId && queueState.status === STATE.RUNNING) {
          try {
            const newTab = await chrome.tabs.create({ url: message.url, active: true });
            queueState.applicationTabId = newTab.id;
            logActivity(`Opened SmartApply tab for "${message.jobTitle}"`, 'info');
          } catch (e) {
            console.warn('[StealthBackground] Could not open apply tab:', e);
          }
        }
      }, 1500);
      sendResponse({ success: true });
      break;
    }

    case 'CHECK_APPLICATION_TAB': {
      sendResponse({
        hasApplicationTab: !!queueState.applicationTabId,
        applicationTabId: queueState.applicationTabId
      });
      break;
    }

    // 3. AI screening question fallback
    case 'SOLVE_WITH_AI': {
      (async () => {
        const result = await queryGeminiForAnswer(
          message.questionText,
          message.questionType,
          message.profile,
          queueState.currentJobTitle
        );
        sendResponse(result);
      })();
      return true;
    }

    // 4. Job Step Notification
    case 'JOB_STEP_COMPLETE': {
      logActivity(`Completed step: ${message.stepName}`, 'info');
      sendResponse({ success: true });
      break;
    }

    // 5. Application Finished Successfully
    case 'APPLICATION_COMPLETED': {
      (async () => {
        queueState.applicationsInSession += 1;
        queueState.applicationsToday += 1;

        const today = new Date().toISOString().split('T')[0];
        await chrome.storage.local.set({
          stealthDailyStats: { date: today, count: queueState.applicationsToday }
        });

        logActivity(`✅ Application submitted for "${message.jobTitle || queueState.currentJobTitle || 'Job'}"! (Today: ${queueState.applicationsToday}/${queueState.dailyCap})`, 'info');

        // If this application was running in a dedicated SmartApply tab, close it and refocus search tab
        if (queueState.applicationTabId) {
          const appTabId = queueState.applicationTabId;
          queueState.applicationTabId = null;
          await sleep(2200);
          chrome.tabs.remove(appTabId).catch(() => {});
          if (queueState.searchTabId) {
            chrome.tabs.update(queueState.searchTabId, { active: true }).catch(() => {});
          }
        }

        // Check daily cap
        if (queueState.applicationsToday >= queueState.dailyCap) {
          queueState.status = STATE.DAILY_CAP_REACHED;
          logActivity(`[Limit] Daily application cap of ${queueState.dailyCap} reached. Stopping for the day.`, 'warning');
          broadcastState();
          sendResponse({ action: 'STOP_DAILY_CAP' });
          return;
        }

        // Check 6-application coffee break
        if (queueState.applicationsInSession > 0 && queueState.applicationsInSession % 6 === 0) {
          sendResponse({ action: 'WAIT_FOR_COFFEE_BREAK' });
          await handleCoffeeBreak();
          return;
        }

        // Regular inter-application delay (12s - 25s)
        const delayBetweenJobs = getRandomInt(12000, 25000);
        logActivity(`Pacing: waiting ${(delayBetweenJobs / 1000).toFixed(1)}s before next job...`, 'info');
        broadcastState();

        setTimeout(() => {
          const targetTabId = queueState.searchTabId || queueState.activeTabId;
          if (queueState.status === STATE.RUNNING && targetTabId) {
            chrome.tabs.sendMessage(targetTabId, { type: 'NEXT_JOB' }).catch(() => {});
          }
        }, delayBetweenJobs);

        sendResponse({ action: 'SCHEDULED_NEXT' });
      })();
      return true;
    }

    // 6. Application Stopped on Review (Safe Mode)
    case 'SAFE_MODE_REVIEW_STOP': {
      queueState.status = STATE.PAUSED_FOR_HUMAN;
      logActivity(`[Safe Mode] Stopped at final Review screen for "${message.jobTitle || 'Job'}". Inspect answers before submitting.`, 'info');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Indeed Stealth: Safe Mode Review',
        message: 'Application reached the Review step. Please check the details.'
      });
      broadcastState();
      sendResponse({ success: true });
      break;
    }

    // 7. Popup Control Commands
    case 'NAVIGATE_SEARCH': {
      (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        let origin = 'https://www.indeed.com';
        if (tab.url && tab.url.includes('indeed.com')) {
          try {
            origin = new URL(tab.url).origin;
          } catch (_) {}
        }

        const what = message.what || '';
        const where = message.where || '';
        const searchUrl = `${origin}/jobs?q=${encodeURIComponent(what)}&l=${encodeURIComponent(where)}`;

        logActivity(`[Navigation] Navigating to Indeed search: "${what}" in "${where}"`, 'info');
        await chrome.tabs.update(tab.id, { url: searchUrl });
        sendResponse({ success: true, url: searchUrl });
      })();
      return true;
    }

    case 'START_AUTOMATION': {
      (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        queueState.status = STATE.RUNNING;
        queueState.searchTabId = tab.id;
        queueState.activeTabId = tab.id;
        queueState.applicationTabId = null;

        // If user specified search terms and current tab is not on an Indeed search page, navigate first
        const what = (message.searchWhat || '').trim();
        const where = (message.searchWhere || '').trim();
        const currentUrl = tab.url || '';
        const isAlreadyOnSearch = currentUrl.includes('/jobs') && (currentUrl.includes('q=') || currentUrl.includes('l='));

        if ((what || where) && !isAlreadyOnSearch) {
          let origin = 'https://www.indeed.com';
          if (currentUrl.includes('indeed.com')) {
            try { origin = new URL(currentUrl).origin; } catch (_) {}
          }
          const searchUrl = `${origin}/jobs?q=${encodeURIComponent(what)}&l=${encodeURIComponent(where)}`;
          logActivity(`[Navigation] Navigating to search: "${what}" in "${where}"...`, 'info');

          await chrome.tabs.update(tab.id, { url: searchUrl });

          const onTabLoaded = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onTabLoaded);
              setTimeout(async () => {
                await ensureScannerInjected(tab.id);
                chrome.tabs.sendMessage(tab.id, {
                  type: 'START_SCAN',
                  config: message.config,
                  profile: message.profile,
                  filters: message.filters
                }).catch((err) => {
                  logActivity(`Could not start scanner: ${err.message}.`, 'error');
                });
              }, 2000);
            }
          };
          chrome.tabs.onUpdated.addListener(onTabLoaded);

          broadcastState();
          sendResponse({ success: true, navigating: true });
          return;
        }

        // Ensure content script is actively listening in the tab
        await ensureScannerInjected(tab.id);

        const isSafe = message.config && message.config.safeMode;
        if (isSafe) {
          logActivity('[Safe Mode] Review Mode Active: Will pause on the Review screen so you can inspect before submitting.', 'info');
        } else {
          logActivity('[Auto-Apply] Full Auto-Apply Active: Automatically filling and submitting applications.', 'info');
        }

        chrome.tabs.sendMessage(tab.id, {
          type: 'START_SCAN',
          config: message.config,
          profile: message.profile,
          filters: message.filters
        }).catch(async () => {
          // Retry with programmatic injection
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['utils/dom-stealth.js', 'content/scanner.js']
          }).catch(() => {});
          await sleep(400);

          chrome.tabs.sendMessage(tab.id, {
            type: 'START_SCAN',
            config: message.config,
            profile: message.profile,
            filters: message.filters
          }).catch((finalErr) => {
            logActivity(`Could not start scanner: ${finalErr.message}. Please refresh the Indeed page.`, 'error');
          });
        });

        broadcastState();
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'PAUSE_AUTOMATION': {
      queueState.status = STATE.PAUSED_FOR_HUMAN;
      logActivity('Automation paused by user.', 'info');
      broadcastState();
      if (queueState.applicationTabId) {
        chrome.tabs.sendMessage(queueState.applicationTabId, { type: 'PAUSE' }).catch(() => {});
      }
      if (queueState.searchTabId || queueState.activeTabId) {
        const targetTab = queueState.searchTabId || queueState.activeTabId;
        chrome.tabs.sendMessage(targetTab, { type: 'PAUSE' }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
    }

    case 'RESUME_AUTOMATION': {
      (async () => {
        queueState.status = STATE.RUNNING;
        logActivity('Automation resumed by user.', 'info');
        broadcastState();

        if (!queueState.searchTabId && !queueState.activeTabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            queueState.searchTabId = tab.id;
            queueState.activeTabId = tab.id;
          }
        }

        if (queueState.applicationTabId) {
          chrome.tabs.sendMessage(queueState.applicationTabId, { type: 'RESUME' }).catch(() => {});
        }
        const targetTab = queueState.searchTabId || queueState.activeTabId;
        if (targetTab) {
          chrome.tabs.sendMessage(targetTab, { type: 'RESUME' }).catch(() => {});
        }
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'STOP_AUTOMATION': {
      queueState.status = STATE.STOPPED;
      logActivity('Automation stopped by user.', 'info');
      broadcastState();
      if (queueState.applicationTabId) {
        chrome.tabs.sendMessage(queueState.applicationTabId, { type: 'STOP' }).catch(() => {});
      }
      if (queueState.searchTabId || queueState.activeTabId) {
        const targetTab = queueState.searchTabId || queueState.activeTabId;
        chrome.tabs.sendMessage(targetTab, { type: 'STOP' }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({ state: queueState });
      break;
    }

    case 'UPDATE_CONFIG': {
      if (message.config) {
        queueState.safeMode = message.config.safeMode !== undefined ? message.config.safeMode : queueState.safeMode;
        queueState.dailyCap = message.config.dailyCap || queueState.dailyCap;
      }
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ unhandled: true });
  }
});
