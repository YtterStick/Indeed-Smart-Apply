# Indeed Stealth SmartApply (Manifest V3) 🚀

[![Chrome Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Stealth Mode](https://img.shields.io/badge/Anti--Detection-CDP%20Hardware%20Clicks-success.svg)](#-key-anti-detection--stealth-features)
[![AI Powered](https://img.shields.io/badge/AI%20Assistant-Google%20Gemini-orange.svg)](#-ai-screening-assistant-setup-optional)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

An undetectable, human-paced, automated Chrome Extension engineered to safely search Indeed and complete multi-step **SmartApply / Indeed Apply** wizard applications without triggering Cloudflare Turnstile, DataDome bot checks, or React synthetic input anomalies.

---

## 📑 Table of Contents

- [⚡ Why Indeed Stealth SmartApply?](#-why-indeed-stealth-smartapply)
- [🛡️ Key Anti-Detection & Stealth Features](#️-key-anti-detection--stealth-features)
- [📦 Installation & Setup (5 Minutes)](#-installation--setup-5-minutes)
- [📘 Complete User Tutorial](#-complete-user-tutorial)
  - [Step 1: Set Up Your Candidate Profile](#step-1-set-up-your-candidate-profile)
  - [Step 2: Configure Skills & Custom Q&A Dictionaries (JSON)](#step-2-configure-skills--custom-qa-dictionaries-json)
  - [Step 3: Define Your Job Search Query](#step-3-define-your-job-search-query)
  - [Step 4: Smart Salary & Keyword Filtering](#step-4-smart-salary--keyword-filtering)
  - [Step 5: Safety Limits & Velocity Controls](#step-5-safety-limits--velocity-controls)
  - [Step 6: AI Screening Assistant Setup (Optional)](#step-6-ai-screening-assistant-setup-optional)
- [🎯 Running Your First Automation Session](#-running-your-first-automation-session)
- [🧪 Testing Locally (Without Live Indeed)](#-testing-locally-without-live-indeed)
- [🔔 Human Sentinel & Audio Chime](#-human-sentinel--audio-chime)
- [📁 Project Architecture](#-project-architecture)
- [💡 Best Practices for Account Safety](#-best-practices-for-account-safety)
- [❓ Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)
- [📄 Disclaimer & License](#-disclaimer--license)

---

## ⚡ Why Indeed Stealth SmartApply?

Most job application bots get detected and banned within hours because they use synthetic JavaScript events (`element.click()`, fake keyboard events) and blitz through forms at superhuman speeds. 

**Indeed Stealth SmartApply** was built from the ground up to mimic genuine human hardware interaction:
- **Physical clicks** generated directly by the browser's rendering engine via Chrome DevTools Protocol (`event.isTrusted === true`).
- **Natural typing jitter** with random per-character delays and prototype-level React 18 setter triggers.
- **Organic pacing** with realistic reading delays, inter-application breathers, and automatic coffee breaks.
- **Safe-Stop Mode** that lets you review every filled form before final submission.

---

## 🛡️ Key Anti-Detection & Stealth Features

1. **Trusted Hardware Clicks (`event.isTrusted === true`):**
   - Eliminates detectable synthetic `element.click()` calls.
   - Calculates randomized click coordinates within the central 60% of target buttons (`getBoundingClientRect()`).
   - Uses Chrome DevTools Protocol (`chrome.debugger` v1.3) via `Input.dispatchMouseEvent` with intermediate Bézier movements, press delays (40–110ms), and release holds (50–140ms).

2. **React 18+ Virtual DOM Setter Bypass:**
   - Bypasses React's synthetic event wrappers by calling native prototype property setters (`HTMLInputElement.prototype`, `HTMLTextAreaElement.prototype`, `HTMLSelectElement.prototype`).
   - Resets React's internal `_valueTracker` to ensure form state updates cleanly without validation failures.
   - Simulates human typing jitter (35ms–95ms per character) followed by bubbling `input`, `change`, and `blur` events.

3. **Cross-Origin Iframe Bridge:**
   - Seamlessly handles Indeed's cross-origin `smartapply.indeed.com` and `beta/indeedapply` iframes.
   - Translates coordinates from nested iframes to top-level window coordinates for accurate CDP hardware clicks.
   - Coordinates top-frame `scanner.js` and sub-frame `solver.js` via `background.js` messaging.

4. **Behavioral Throttling & Coffee Breaks:**
   - Form step delays: `2.2s` to `4.8s` (mimics human reading and clicking).
   - Inter-application gaps: `12s` to `25s` between job listings.
   - **Automatic Coffee Break:** After every 6 applications, pauses queue for `8 to 12 minutes` with a live countdown timer.
   - **Daily Application Cap:** Configurable daily quota (default: `25 applications/day`) persisted in local storage.

5. **Cloudflare & Screening Question Sentinel:**
   - Automatically handles Cloudflare Turnstile interactive checkboxes where possible.
   - If an unfamiliar mandatory employer question or challenge appears, transitions immediately to `PAUSED_FOR_HUMAN`, highlights the exact question with a pulsating neon-orange glow, plays an audible chime, and waits for you to review and click **Resume**.

---

## 📦 Installation & Setup (5 Minutes)

### Prerequisites
- **Google Chrome** (or Chromium-based browser like Brave, Microsoft Edge, or Opera) version 100+.
- An active **Indeed account** logged in on your browser.
- A **saved or uploaded resume** on your Indeed profile (so Indeed can auto-select it during applications).

### Step-by-Step Installation

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/YtterStick/Indeed-Smart-Apply.git
   ```
   *(Or download and extract the ZIP file from GitHub).*

2. **Open Extensions in Chrome:**
   - In Chrome's address bar, navigate to:
     ```
     chrome://extensions/
     ```

3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner of the page.

4. **Load the Extension:**
   - Click the **"Load unpacked"** button in the top-left corner.
   - Select the folder containing the project files (the folder containing `manifest.json`).

5. **Pin to Toolbar:**
   - Click the puzzle piece icon (Extensions) in your Chrome toolbar and click the pin icon next to **Indeed Stealth**.

---

## 📘 Complete User Tutorial

When you open the extension popup by clicking the icon in your toolbar, you will see a clean dashboard with four navigation tabs: **Controls**, **Profile**, **Filters**, and **Settings**.

```
┌────────────────────────────────────────────────────────┐
│  ⚡ Indeed Stealth                         [ IDLE ]    │
│  Applications Today: 0 / 25   Session: 0   Cooldown: Ready
├────────────────────────────────────────────────────────┤
│  [ Controls ]   [ Profile ]   [ Filters ]   [ Settings ]│
└────────────────────────────────────────────────────────┘
```

---

### Step 1: Set Up Your Candidate Profile

Before starting any automation, switch to the **Profile** tab to configure your candidate identity. This information will be used to automatically fill contact steps and screening questions.

1. **Candidate Identity:**
   - **Full Name:** e.g., `Jane Doe`
   - **Email Address:** e.g., `jane.doe@example.com`
   - **Phone Number:** e.g., `+1 (555) 012-3456`
   - **Location:** e.g., `Remote, New York, NY` (or your city/country)

2. **Compensation & Preferences:**
   - **Target Salary:** Your minimum desired salary amount (e.g., `70000`).
   - **Currency:** Select your preferred currency (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `PHP`, `SGD`, `INR`).
   - **Frequency:** Choose `Annual / Yearly`, `Monthly`, or `Hourly`.
   - **Notice Period:** e.g., `Immediately`, `2 weeks`, or `1 month`.

3. **Work Authorizations & Disclosures:**
   - ✅ **Legally authorized to work:** Checked if you have work rights in target location.
   - ⬜ **Requires visa sponsorship:** Check only if you need visa sponsorship.
   - ⬜ **Willing to relocate:** Check if open to relocation.
   - ⬜ **Willing to work night / rotating shifts:** Check if applicable.
   - ✅ **Valid driver's license:** Check if you hold a driver's license.
   - ✅ **Consent to background check:** Check if you consent to employer background screening.

4. Click **"Save Profile"**. A green "Saved" confirmation will appear.

---

### Step 2: Configure Skills & Custom Q&A Dictionaries (JSON)

Employers on Indeed frequently ask screening questions like *"How many years of React experience do you have?"* or *"What is your highest level of education?"*.

The extension uses two flexible JSON dictionaries to answer these questions accurately:

#### 1. Experience by Skill (`profSkillsJson`)
Maps skill keywords to your years of experience. Whenever a numeric screening question mentions one of these keywords, the bot inputs the configured number:

```json
{
  "javascript": 5,
  "react": 4,
  "typescript": 3,
  "node": 4,
  "python": 3,
  "sql": 3,
  "customer support": 2
}
```

#### 2. Custom Screening Q&A Dictionary (`profCustomAnswersJson`)
Maps keywords found in employer questions to your exact textual answers:

```json
{
  "highest level of education": "Bachelor's Degree",
  "authorized to work": "Yes",
  "driver license": "Yes",
  "gpa": "3.8",
  "commute": "Yes",
  "certifications": "AWS Certified Solutions Architect"
}
```

> [!TIP]
> Both textareas accept standard JSON format. If you make a syntax error (e.g. missing quote or trailing comma), the extension will alert you before saving so your configuration stays valid.

---

### Step 3: Define Your Job Search Query

Go to the **Controls** tab:

1. **Job Title or Keyword:** Enter what you are looking for (e.g., `Software Engineer`, `Frontend Developer`, `Data Analyst`, or `Virtual Assistant`).
2. **Location / Remote:** Enter your preferred location (e.g., `Remote`, `New York, NY`, `United States`, or `London`).
3. Click **"Navigate to Indeed Search"**. The active Chrome tab will immediately load Indeed's search results for those parameters.

*(Alternatively, you can manually navigate to any Indeed job search page in Chrome yourself).*

---

### Step 4: Smart Salary & Keyword Filtering

Switch to the **Filters** tab. Filtering is **disabled by default**, meaning the bot will apply to all matching Indeed Apply jobs on the page.

To enable intelligent filtering, toggle **"Enable Keyword & Salary Filters"**:

1. **Salary Filter:**
   - **Minimum Salary:** e.g., `50000`
   - **Maximum Salary:** e.g., `120000`
   - **Pay Frequency:** Choose `Auto-detect`, `Per Year`, `Per Month`, or `Per Hour`.
   - **Require Listed Salary:** If checked, postings without a visible salary range will be skipped. If unchecked, postings with undisclosed salaries are allowed through.

2. **Blacklist Keywords (Skip List):**
   - Comma-separated words. If any of these appear in the job title or description, the job is skipped:
   ```
   commission only, unpaid, internship, security clearance, senior lead
   ```

3. **Must-Have Keywords (Optional):**
   - Comma-separated words. The bot will only apply if at least one of these keywords appears:
   ```
   remote, react, full-time, python
   ```
   *(Leave blank if you want all non-blacklisted jobs).*

4. Click **"Save Filters"**. The status pill on the Controls tab will update to indicate your active filters.

---

### Step 5: Safety Limits & Velocity Controls

Switch to the **Settings** tab:

1. **Daily Application Cap:** Set the maximum number of applications allowed per 24-hour day (default: `25`).
   - Prevents your account from tripping Indeed's velocity thresholds.
   - Once reached, the bot automatically stops and displays `DAILY CAP MET`.

2. **Pacing Cooldown:**
   - Built-in behavioral pacing automatically takes an **8 to 12-minute coffee break** after every 6 applications.
   - The cooldown countdown is displayed live on the dashboard metrics bar.

---

### Step 6: AI Screening Assistant Setup (Optional)

If an employer asks an open-ended free-text question that is **not** covered in your Custom Q&A Dictionary (e.g., *"Why do you want to work for our company?"* or *"Describe a time you handled a difficult client"*), the bot can automatically consult Google Gemini AI to craft a tailored answer.

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. In the **Settings** tab, paste your key into **Google Gemini API Key**.
3. Click **"Save Settings"**.

> [!NOTE]
> The API key is stored strictly locally in your browser's `chrome.storage.local`. It is never uploaded to any third-party server or repository.

---

## 🎯 Running Your First Automation Session

### Recommendation: Start in Safe-Stop Mode (Review Mode)

For your first run, it is highly recommended to keep **Safe-Stop Mode** enabled (checked on the Controls tab):

1. **Open Indeed Search:** Ensure your Chrome tab is on an Indeed search page with results.
2. **Click "Start Auto-Apply (Review Mode)":**
   - The bot attaches a trusted CDP session and scans the search results for jobs marked with **"Easily apply"** / **"Apply now"**.
   - It clicks the job card, reads the details, evaluates salary and keyword filters, and clicks **"Apply now"**.
   - In the SmartApply modal or window, it automatically fills contact info, selects your saved resume, and answers screening questions.
3. **Safe-Stop Pause:**
   - When the application reaches the final **"Review your application"** screen, the bot safely **pauses**.
   - You can inspect all filled fields with your own eyes!
   - Click the submit button yourself or click **Resume** in the popup to continue.
4. **Switch to Full Auto-Apply:**
   - Once you are confident with how the bot answers your screening questions, uncheck **Safe-Stop Mode**.
   - The button will update to **"Start Full Auto-Apply"**. The bot will now autonomously review and submit applications.

---

## 🧪 Testing Locally (Without Live Indeed)

Want to see the bot in action without risking live job submissions? Use the built-in local simulator!

1. In the extension popup, go to **Settings** and click **"🧪 Open Mock Indeed Wizard"** (or open [`test/mock-indeed-wizard.html`](test/mock-indeed-wizard.html) in Chrome).
2. The mock simulator displays a simulated Indeed job search page with interactive job cards and a realistic 4-step SmartApply wizard.
3. Click **"Start Auto-Apply"** in the popup:
   - Watch the bot perform CDP physical clicks on the simulated job card.
   - Observe human typing jitter in the contact inputs.
   - Watch the wizard advance through Resume selection, Screening questions, and Review.
4. Test Sentinel alerts using the test buttons in the mock page:
   - **"🚨 Inject Cloudflare Turnstile"**: Simulates a Cloudflare challenge and tests bypass/pause.
   - **"⚠️ Inject Form Error Banner"**: Tests immediate sentinel pause, neon highlight, and audible chime.

---

## 🔔 Human Sentinel & Audio Chime

The bot is designed to **never blindly guess** or make catastrophic mistakes.

When the bot encounters:
- An unanswered mandatory question
- A CAPTCHA or verification challenge
- A validation error banner on the form

It will:
1. Immediately halt queue execution (`PAUSED_FOR_HUMAN`).
2. Highlight the problematic element with a pulsating neon-orange glow.
3. Play a chime via the Web Audio API to alert you.
4. Send a Chrome desktop notification.

You can simply resolve the question in the tab, then click **Resume** in the popup to keep going!

---

## 📁 Project Architecture

```
indeed-automation/
├── manifest.json              # Chrome MV3 manifest (permissions, content scripts, metadata)
├── background.js              # Service Worker (CDP hardware clicks, queue state machine, Gemini AI)
├── utils/
│   └── dom-stealth.js         # React 18 setter bypass, typing simulation, resilient selectors, chime
├── content/
│   ├── scanner.js             # Top-frame search scanner, job filtering, "Apply now" trigger
│   └── solver.js              # SmartApply wizard solver, step detection, sentinel triggers
├── popup/
│   ├── popup.html             # Cyber-sleek dark dashboard UI with glassmorphism tabs
│   ├── popup.css              # Cyber-clean styles, status badges, glowing indicators
│   └── popup.js               # Dashboard state sync, JSON validation, live telemetry stream
├── test/
│   └── mock-indeed-wizard.html# Standalone React-controlled local test simulator
├── icons/                     # Extension icons (16px, 48px, 128px) & generator
└── README.md                  # Complete documentation and tutorial
```

---

## 💡 Best Practices for Account Safety

- **Keep Daily Cap Realistic:** We recommend keeping your daily cap at **20–30 applications per day**. Real human job seekers rarely submit 100+ applications in a single day.
- **Let Coffee Breaks Finish:** Do not manually skip the 8–12 minute coffee breaks. Indeed monitors application velocity, and natural breaks keep your session looking organic.
- **Maintain an Uploaded Resume on Indeed:** Having a saved resume on your Indeed profile ensures the bot can select it via radio buttons without needing to upload files from your local disk.
- **Check Your Activity Log:** Keep an eye on the **Activity Stream** on the Controls tab to see real-time step progress and filter decisions.

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Does this work on international Indeed domains?
**A:** Yes! The extension matches `*://*.indeed.com/*` and supports local country subdomains (e.g. `ca.indeed.com`, `uk.indeed.com`, `ph.indeed.com`, etc.). It also normalizes salary amounts across multiple currencies ($ USD, € EUR, £ GBP, ₱ PHP, CAD, AUD, SGD, INR).

#### Q: What if Indeed asks to upload a new resume file?
**A:** If you have at least one resume saved in your Indeed account, Indeed provides a radio button to select your saved resume, which the bot automatically selects. If an employer explicitly demands a fresh file upload, the Sentinel will pause and notify you to choose your file.

#### Q: Where are my profile and settings stored?
**A:** Everything is saved directly in your browser using Chrome's local storage API (`chrome.storage.local`). Your personal details, credentials, and API keys never leave your computer.

#### Q: How do I pause or stop the automation?
**A:** Simply click the **Pause** or **Stop** buttons in the popup at any time. You can also close the active Indeed tab to immediately halt execution.

---

## 📄 Disclaimer & License

**Disclaimer:** This software is developed for educational and personal workflow efficiency purposes. Users are responsible for complying with Indeed's Terms of Service and local job application regulations. The authors are not responsible for any account restrictions resulting from misuse.

Distributed under the **MIT License**. See `LICENSE` for more information.
