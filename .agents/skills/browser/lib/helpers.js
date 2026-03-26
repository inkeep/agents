// playwright-helpers.js
// Reusable utility functions for Playwright automation

const { chromium, firefox, webkit } = require('playwright');

/**
 * Parse extra HTTP headers from environment variables.
 * Supports two formats:
 * - PW_HEADER_NAME + PW_HEADER_VALUE: Single header (simple, common case)
 * - PW_EXTRA_HEADERS: JSON object for multiple headers (advanced)
 * Single header format takes precedence if both are set.
 * @returns {Object|null} Headers object or null if none configured
 */
function getExtraHeadersFromEnv() {
  const headerName = process.env.PW_HEADER_NAME;
  const headerValue = process.env.PW_HEADER_VALUE;

  if (headerName && headerValue) {
    return { [headerName]: headerValue };
  }

  const headersJson = process.env.PW_EXTRA_HEADERS;
  if (headersJson) {
    try {
      const parsed = JSON.parse(headersJson);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
      console.warn('PW_EXTRA_HEADERS must be a JSON object, ignoring...');
    } catch (e) {
      console.warn('Failed to parse PW_EXTRA_HEADERS as JSON:', e.message);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolution Presets
// ---------------------------------------------------------------------------

/**
 * Pre-configured viewport + DPR combinations for different media targets.
 * Use with createPresetContext() to get consistent dimensions.
 *
 * - docs-retina: 1280x720 viewport @ DPR 2 → 2560x1440 PNG (docs site, Retina-sharp)
 * - pr-standard: 1280x720 viewport @ DPR 1 → 1280x720 PNG (GitHub PR inline images)
 * - gif-compact: 800x450 viewport @ DPR 1 → 800x450 frames (GitHub PR GIFs, <10MB)
 * - video: 2560x1440 viewport @ DPR 1 → 2560x1440 WebM (all video — Bunny Stream or Vimeo)
 */
const RESOLUTION_PRESETS = {
  'docs-retina': {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  },
  'pr-standard': {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  'gif-compact': {
    viewport: { width: 800, height: 450 },
    deviceScaleFactor: 1,
  },
  video: {
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
  },
};

/**
 * Launch browser with standard configuration
 * @param {string} browserType - 'chromium', 'firefox', or 'webkit'
 * @param {Object} options - Additional launch options
 */
async function launchBrowser(browserType = 'chromium', options = {}) {
  const defaultOptions = {
    headless: process.env.HEADLESS !== 'false',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  const browsers = { chromium, firefox, webkit };
  const browser = browsers[browserType];

  if (!browser) {
    throw new Error(`Invalid browser type: ${browserType}`);
  }

  return await browser.launch({ ...defaultOptions, ...options });
}

/**
 * Create a new page with viewport and user agent
 * @param {Object} context - Browser context
 * @param {Object} options - Page options
 */
async function createPage(context, options = {}) {
  const page = await context.newPage();

  if (options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  if (options.userAgent) {
    await page.setExtraHTTPHeaders({
      'User-Agent': options.userAgent,
    });
  }

  // Set default timeout
  page.setDefaultTimeout(options.timeout || 30000);

  return page;
}

/**
 * Smart wait for page to be ready
 * @param {Object} page - Playwright page
 * @param {Object} options - Wait options
 */
async function waitForPageReady(page, options = {}) {
  const waitOptions = {
    waitUntil: options.waitUntil || 'networkidle',
    timeout: options.timeout || 30000,
  };

  try {
    await page.waitForLoadState(waitOptions.waitUntil, {
      timeout: waitOptions.timeout,
    });
  } catch (e) {
    console.warn('Page load timeout, continuing...');
  }

  // Additional wait for dynamic content if selector provided
  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, {
      timeout: options.timeout,
    });
  }
}

/**
 * Safe click with retry logic
 * @param {Object} page - Playwright page
 * @param {string} selector - Element selector
 * @param {Object} options - Click options
 */
async function safeClick(page, selector, options = {}) {
  const maxRetries = options.retries || 3;
  const retryDelay = options.retryDelay || 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.waitForSelector(selector, {
        state: 'visible',
        timeout: options.timeout || 5000,
      });
      await page.click(selector, {
        force: options.force || false,
        timeout: options.timeout || 5000,
      });
      return true;
    } catch (e) {
      if (i === maxRetries - 1) {
        console.error(`Failed to click ${selector} after ${maxRetries} attempts`);
        throw e;
      }
      console.log(`Retry ${i + 1}/${maxRetries} for clicking ${selector}`);
      await page.waitForTimeout(retryDelay);
    }
  }
}

/**
 * Safe text input with clear before type
 * @param {Object} page - Playwright page
 * @param {string} selector - Input selector
 * @param {string} text - Text to type
 * @param {Object} options - Type options
 */
async function safeType(page, selector, text, options = {}) {
  await page.waitForSelector(selector, {
    state: 'visible',
    timeout: options.timeout || 10000,
  });

  if (options.clear !== false) {
    await page.fill(selector, '');
  }

  if (options.slow) {
    await page.type(selector, text, { delay: options.delay || 100 });
  } else {
    await page.fill(selector, text);
  }
}

/**
 * Extract text from multiple elements
 * @param {Object} page - Playwright page
 * @param {string} selector - Elements selector
 */
async function extractTexts(page, selector) {
  await page.waitForSelector(selector, { timeout: 10000 });
  return await page.$$eval(selector, (elements) =>
    elements.map((el) => el.textContent?.trim()).filter(Boolean)
  );
}

/**
 * Take screenshot with timestamp
 * @param {Object} page - Playwright page
 * @param {string} name - Screenshot name
 * @param {Object} options - Screenshot options
 * @param {boolean} [options.fullPage=true] - Capture full page (default: true, unlike Playwright's false)
 */
async function takeScreenshot(page, name, options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.png`;

  await page.screenshot({
    path: filename,
    fullPage: options.fullPage !== false,
    ...options,
  });

  console.log(`Screenshot saved: ${filename}`);
  return filename;
}

/**
 * Handle authentication
 * @param {Object} page - Playwright page
 * @param {Object} credentials - Username and password
 * @param {Object} selectors - Login form selectors
 */
async function authenticate(page, credentials, selectors = {}) {
  const defaultSelectors = {
    username: 'input[name="username"], input[name="email"], #username, #email',
    password: 'input[name="password"], #password',
    submit:
      'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")',
  };

  const finalSelectors = { ...defaultSelectors, ...selectors };

  await safeType(page, finalSelectors.username, credentials.username);
  await safeType(page, finalSelectors.password, credentials.password);
  await safeClick(page, finalSelectors.submit);

  // Wait for navigation or success indicator
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.waitForSelector(selectors.successIndicator || '.dashboard, .user-menu, .logout', {
      timeout: 10000,
    }),
  ]).catch(() => {
    console.log('Login might have completed without navigation');
  });
}

// ---------------------------------------------------------------------------
// Auth State Persistence
// ---------------------------------------------------------------------------

/**
 * Save browser auth state (cookies + localStorage + optionally IndexedDB) for reuse across runs.
 * @param {Object} context - Playwright browser context (after login)
 * @param {string} [savePath='/tmp/playwright-auth.json'] - Where to save
 * @param {Object} [options={}]
 * @param {boolean} [options.indexedDB=false] - Include IndexedDB contents (for Firebase, etc.)
 * @returns {{ path: string, cookies: number, origins: number }}
 */
async function saveAuthState(context, savePath = '/tmp/playwright-auth.json', options = {}) {
  const stateOpts = { path: savePath };
  if (options.indexedDB) stateOpts.indexedDB = true;
  const state = await context.storageState(stateOpts);
  return {
    path: savePath,
    cookies: state.cookies ? state.cookies.length : 0,
    origins: state.origins ? state.origins.length : 0,
  };
}

/**
 * Create a browser context with previously saved auth state.
 * @param {Object} browser - Playwright browser instance
 * @param {string} [authPath='/tmp/playwright-auth.json'] - Auth state file
 * @param {Object} [options={}] - Extra options passed to createContext()
 * @returns {Object} Browser context with saved auth applied
 */
async function loadAuthState(browser, authPath = '/tmp/playwright-auth.json', options = {}) {
  const fs = require('fs');
  if (!fs.existsSync(authPath)) {
    throw new Error(
      `No auth state found at ${authPath}. Run a login flow with saveAuthState first.`
    );
  }
  return createContext(browser, { ...options, storageState: authPath });
}

/**
 * Scroll page
 * @param {Object} page - Playwright page
 * @param {string} direction - 'down', 'up', 'top', 'bottom'
 * @param {number} distance - Pixels to scroll (for up/down)
 */
async function scrollPage(page, direction = 'down', distance = 500) {
  switch (direction) {
    case 'down':
      await page.evaluate((d) => window.scrollBy(0, d), distance);
      break;
    case 'up':
      await page.evaluate((d) => window.scrollBy(0, -d), distance);
      break;
    case 'top':
      await page.evaluate(() => window.scrollTo(0, 0));
      break;
    case 'bottom':
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      break;
  }
  await page.waitForTimeout(500); // Wait for scroll animation
}

/**
 * Extract table data
 * @param {Object} page - Playwright page
 * @param {string} tableSelector - Table selector
 */
async function extractTableData(page, tableSelector) {
  await page.waitForSelector(tableSelector);

  return await page.evaluate((selector) => {
    const table = document.querySelector(selector);
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim()
    );

    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      if (headers.length > 0) {
        return cells.reduce((obj, cell, index) => {
          obj[headers[index] || `column_${index}`] = cell.textContent?.trim();
          return obj;
        }, {});
      } else {
        return cells.map((cell) => cell.textContent?.trim());
      }
    });

    return { headers, rows };
  }, tableSelector);
}

/**
 * Wait for and dismiss cookie banners
 * @param {Object} page - Playwright page
 * @param {number} timeout - Max time to wait
 */
async function handleCookieBanner(page, timeout = 3000) {
  const commonSelectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    'button:has-text("I agree")',
    '.cookie-accept',
    '#cookie-accept',
    '[data-testid="cookie-accept"]',
  ];

  for (const selector of commonSelectors) {
    try {
      const element = await page.waitForSelector(selector, {
        timeout: timeout / commonSelectors.length,
        state: 'visible',
      });
      if (element) {
        await element.click();
        console.log('Cookie banner dismissed');
        return true;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} initialDelay - Initial delay in ms
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = initialDelay * Math.pow(2, i);
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create browser context with common settings
 * @param {Object} browser - Browser instance
 * @param {Object} options - Context options
 */
async function createContext(browser, options = {}) {
  const envHeaders = getExtraHeadersFromEnv();

  // Merge environment headers with any passed in options
  const mergedHeaders = {
    ...envHeaders,
    ...options.extraHTTPHeaders,
  };

  const defaultOptions = {
    viewport: { width: 1280, height: 720 },
    userAgent: options.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
      : undefined,
    permissions: options.permissions || [],
    geolocation: options.geolocation,
    locale: options.locale || 'en-US',
    timezoneId: options.timezoneId || 'America/New_York',
    // Only include extraHTTPHeaders if we have any
    ...(Object.keys(mergedHeaders).length > 0 && { extraHTTPHeaders: mergedHeaders }),
  };

  return await browser.newContext({ ...defaultOptions, ...options });
}

/**
 * Create a browser context using a resolution preset.
 * Presets: 'docs-retina' (2560x1440), 'pr-standard' (1280x720), 'gif-compact' (800x450).
 * @param {Object} browser - Browser instance
 * @param {string} presetName - Key from RESOLUTION_PRESETS
 * @param {Object} [extraOptions] - Additional context options (merged after preset)
 * @returns {Object} Browser context configured for the preset
 */
async function createPresetContext(browser, presetName, extraOptions = {}) {
  const preset = RESOLUTION_PRESETS[presetName];
  if (!preset) {
    const available = Object.keys(RESOLUTION_PRESETS).join(', ');
    throw new Error(`Unknown resolution preset: "${presetName}". Available: ${available}`);
  }

  const envHeaders = getExtraHeadersFromEnv();
  const mergedHeaders = { ...envHeaders, ...extraOptions.extraHTTPHeaders };

  const contextOptions = {
    viewport: preset.viewport,
    deviceScaleFactor: preset.deviceScaleFactor,
    ...(Object.keys(mergedHeaders).length > 0 && { extraHTTPHeaders: mergedHeaders }),
    ...extraOptions,
  };

  return await browser.newContext(contextOptions);
}

/**
 * Detect running dev servers on common ports
 * @param {Array<number>} customPorts - Additional ports to check
 * @returns {Promise<Array>} Array of detected server URLs
 */
async function detectDevServers(customPorts = []) {
  const http = require('http');

  // Common dev server ports
  const commonPorts = [3000, 3001, 3002, 5173, 8080, 8000, 4200, 5000, 9000, 1234];
  const allPorts = [...new Set([...commonPorts, ...customPorts])];

  const detectedServers = [];

  console.log('Checking for running dev servers...');

  for (const port of allPorts) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: port,
            path: '/',
            method: 'HEAD',
            timeout: 500,
          },
          (res) => {
            if (res.statusCode < 500) {
              detectedServers.push(`http://localhost:${port}`);
              console.log(`  Found server on port ${port}`);
            }
            resolve();
          }
        );

        req.on('error', () => resolve());
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });

        req.end();
      });
    } catch (e) {
      // Port not available, continue
    }
  }

  if (detectedServers.length === 0) {
    console.log('  No dev servers detected');
  }

  return detectedServers;
}

// ---------------------------------------------------------------------------
// Console Monitoring
// ---------------------------------------------------------------------------

/**
 * Start capturing browser console output. Call BEFORE navigating to the page.
 * Returns a collector object — pass it to getConsoleErrors() or getConsoleLogs().
 * @param {Object} page - Playwright page
 * @returns {Object} Collector with .entries array
 */
function startConsoleCapture(page) {
  const collector = { entries: [] };
  page.on('console', (msg) => {
    collector.entries.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: Date.now(),
    });
  });
  page.on('pageerror', (error) => {
    collector.entries.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack,
      timestamp: Date.now(),
    });
  });
  return collector;
}

/**
 * Get only error-level messages from a console collector.
 * Includes console.error() calls and uncaught page errors.
 * @param {Object} collector - From startConsoleCapture()
 * @returns {Array} Error entries
 */
function getConsoleErrors(collector) {
  return collector.entries.filter((e) => e.type === 'error' || e.type === 'pageerror');
}

/**
 * Get console logs from a collector, optionally filtered.
 * @param {Object} collector - From startConsoleCapture()
 * @param {string|RegExp|Function} [filter] - String (includes), RegExp (test), or predicate function
 * @returns {Array} Matching entries
 */
function getConsoleLogs(collector, filter) {
  if (!filter) return collector.entries;
  if (typeof filter === 'string') {
    return collector.entries.filter((e) => e.text.includes(filter));
  }
  if (filter instanceof RegExp) {
    return collector.entries.filter((e) => filter.test(e.text));
  }
  if (typeof filter === 'function') {
    return collector.entries.filter(filter);
  }
  return collector.entries;
}

// ---------------------------------------------------------------------------
// Network Capture & Inspection
// ---------------------------------------------------------------------------

/**
 * Start capturing network requests. Call BEFORE navigating to the page.
 * Returns a collector object — pass it to getFailedRequests() or getCapturedRequests().
 * @param {Object} page - Playwright page
 * @param {string} [urlFilter] - Only capture requests whose URL contains this string (e.g. '/api/')
 * @returns {Object} Collector with .requests array
 */
function startNetworkCapture(page, urlFilter) {
  const collector = { requests: [] };

  page.on('requestfinished', async (request) => {
    const url = request.url();
    if (urlFilter && !url.includes(urlFilter)) return;

    const response = await request.response();
    collector.requests.push({
      url,
      method: request.method(),
      status: response ? response.status() : null,
      statusText: response ? response.statusText() : null,
      resourceType: request.resourceType(),
      failure: null,
      timestamp: Date.now(),
    });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (urlFilter && !url.includes(urlFilter)) return;

    collector.requests.push({
      url,
      method: request.method(),
      status: null,
      statusText: null,
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || 'unknown',
      timestamp: Date.now(),
    });
  });

  return collector;
}

/**
 * Get failed requests (4xx, 5xx, or connection failures) from a network collector.
 * @param {Object} collector - From startNetworkCapture()
 * @returns {Array} Failed request entries
 */
function getFailedRequests(collector) {
  return collector.requests.filter((r) => r.failure || (r.status && r.status >= 400));
}

/**
 * Get all captured requests from a network collector.
 * @param {Object} collector - From startNetworkCapture()
 * @returns {Array} All request entries
 */
function getCapturedRequests(collector) {
  return collector.requests;
}

/**
 * Wait for a specific API response matching a URL pattern.
 * @param {Object} page - Playwright page
 * @param {string} urlPattern - URL substring to match (e.g. '/api/users')
 * @param {Object} [options] - { timeout: 10000, status: 200 }
 * @returns {Object} { url, status, statusText, body, json }
 */
async function waitForApiResponse(page, urlPattern, options = {}) {
  const timeout = options.timeout || 10000;
  const expectedStatus = options.status;

  const response = await page.waitForResponse(
    (resp) =>
      resp.url().includes(urlPattern) && (!expectedStatus || resp.status() === expectedStatus),
    { timeout }
  );

  return {
    url: response.url(),
    status: response.status(),
    statusText: response.statusText(),
    body: await response.text().catch(() => null),
    json: await response.json().catch(() => null),
  };
}

// ---------------------------------------------------------------------------
// Video Recording
// ---------------------------------------------------------------------------

/**
 * Create a browser context with video recording enabled.
 * Videos are saved when the page or context is closed.
 * @param {Object} browser - Browser instance
 * @param {Object} [options] - { outputDir, videoSize, viewport, ...contextOptions }
 * @returns {Object} Browser context with recording active
 */
async function createVideoContext(browser, options = {}) {
  const envHeaders = getExtraHeadersFromEnv();
  const mergedHeaders = { ...envHeaders, ...options.extraHTTPHeaders };

  const contextOptions = {
    viewport: options.viewport || { width: 1280, height: 720 },
    recordVideo: {
      dir: options.outputDir || '/tmp/playwright-videos',
      size: options.videoSize || { width: 1280, height: 720 },
    },
    ...(Object.keys(mergedHeaders).length > 0 && { extraHTTPHeaders: mergedHeaders }),
    ...options,
  };
  // Remove non-context keys
  delete contextOptions.outputDir;
  delete contextOptions.videoSize;

  return await browser.newContext(contextOptions);
}

// ---------------------------------------------------------------------------
// Video Upload (optional — only when user requests it)
// ---------------------------------------------------------------------------

/**
 * Upload a video file to Vimeo. Optional — use only when the user asks to upload.
 * Videos are saved locally to /tmp by default; this is the opt-in upload path.
 * Requires env vars: VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET, VIMEO_ACCESS_TOKEN.
 * Accepts WebM directly (no conversion needed — Vimeo transcodes server-side).
 * @param {string} filePath - Path to video file (WebM or MP4)
 * @param {Object} [options] - { name, description, privacy: 'unlisted'|'anybody'|'nobody'|'password', password }
 * @returns {Promise<Object>} { videoId, url, embedUrl, uri }
 */
async function uploadToVimeo(filePath, options = {}) {
  const { Vimeo } = require('@vimeo/vimeo');

  const clientId = process.env.VIMEO_CLIENT_ID;
  const clientSecret = process.env.VIMEO_CLIENT_SECRET;
  const accessToken = process.env.VIMEO_ACCESS_TOKEN;

  if (!clientId || !clientSecret || !accessToken) {
    throw new Error(
      'Vimeo upload requires VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET, and VIMEO_ACCESS_TOKEN env vars. ' +
        'Generate a Personal Access Token at https://developer.vimeo.com/apps'
    );
  }

  const client = new Vimeo(clientId, clientSecret, accessToken);

  const params = {
    name: options.name || `Recording - ${new Date().toISOString().slice(0, 19)}`,
    description: options.description || 'Uploaded via Playwright browser skill',
    privacy: { view: options.privacy || 'unlisted' },
  };

  if (options.privacy === 'password' && options.password) {
    params.password = options.password;
  }

  return new Promise((resolve, reject) => {
    client.upload(
      filePath,
      params,
      function (uri) {
        const videoId = uri.split('/').pop();
        resolve({
          videoId,
          url: `https://vimeo.com/${videoId}`,
          embedUrl: `https://player.vimeo.com/video/${videoId}`,
          uri,
        });
      },
      function (bytesUploaded, bytesTotal) {
        const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
        console.log(`Vimeo upload: ${pct}%`);
      },
      function (error) {
        reject(new Error(`Vimeo upload failed: ${error}`));
      }
    );
  });
}

/**
 * Upload a video file to Bunny Stream. Optional — use only when the user asks to upload.
 * Videos are saved locally to /tmp by default; this is the opt-in upload path.
 * Requires env vars: BUNNY_STREAM_API_KEY, BUNNY_STREAM_LIBRARY_ID.
 * Accepts WebM directly (VP8 explicitly supported — Bunny transcodes server-side).
 * Two-step upload: POST to create video object, then PUT binary.
 * @param {string} filePath - Path to video file (WebM or MP4)
 * @param {Object} [options] - { name, collectionId, thumbnailTime }
 * @returns {Promise<Object>} { videoId, url, embedUrl, directPlayUrl, thumbnailUrl }
 */
async function uploadToBunny(filePath, options = {}) {
  const fs = require('fs');

  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;

  if (!apiKey || !libraryId) {
    throw new Error(
      'Bunny Stream upload requires BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIBRARY_ID env vars. ' +
        'Get these from the Bunny Stream dashboard: https://dash.bunny.net/stream'
    );
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  // Step 1: Create video object
  const createBody = {
    title: options.name || `Recording - ${new Date().toISOString().slice(0, 19)}`,
  };
  if (options.collectionId) createBody.collectionId = options.collectionId;
  if (options.thumbnailTime != null) createBody.thumbnailTime = options.thumbnailTime;

  const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Bunny Stream: failed to create video (${createRes.status}): ${errText}`);
  }

  const video = await createRes.json();
  const videoId = video.guid;

  // Step 2: Upload binary
  const fileBuffer = fs.readFileSync(filePath);
  console.log(`Bunny Stream: uploading ${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB...`);

  const uploadRes = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      method: 'PUT',
      headers: { AccessKey: apiKey },
      body: fileBuffer,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Bunny Stream: upload failed (${uploadRes.status}): ${errText}`);
  }

  const embedUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
  console.log(`Bunny Stream: upload complete. Player: ${embedUrl}`);

  return {
    videoId,
    url: `https://iframe.mediadelivery.net/play/${libraryId}/${videoId}`,
    embedUrl,
    directPlayUrl: `https://video.bunnycdn.com/play/${libraryId}/${videoId}`,
    thumbnailUrl: `https://${video.pullZoneUrl || 'vz-cdn.net'}/${videoId}/thumbnail.jpg`,
  };
}

// ---------------------------------------------------------------------------
// Image/File Upload — Bunny Edge Storage (general-purpose CDN)
// ---------------------------------------------------------------------------

/**
 * Upload any file (image, GIF, PDF, etc.) to Bunny Edge Storage and return a permanent CDN URL.
 * Use for PR screenshots, annotated images, comparison PNGs — anything that needs a public URL.
 * Requires: BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_HOSTNAME env vars.
 * Set up a Storage Zone + Pull Zone at https://dash.bunny.net/storage
 * @param {string} filePath - Local file to upload
 * @param {string} remotePath - Path within the storage zone (e.g., "pr-123/dashboard-before.png")
 * @param {Object} [options] - { region: '' } — storage region prefix (e.g., 'ny' for New York)
 * @returns {Object} { url, storagePath, size }
 */
async function uploadToBunnyStorage(filePath, remotePath, options = {}) {
  const fs = require('fs');
  const apiKey = process.env.BUNNY_STORAGE_API_KEY;
  const zoneName = process.env.BUNNY_STORAGE_ZONE_NAME;
  const cdnHostname = process.env.BUNNY_STORAGE_HOSTNAME;
  if (!apiKey || !zoneName || !cdnHostname) {
    throw new Error(
      'Bunny Storage upload requires BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE_NAME, and BUNNY_STORAGE_HOSTNAME env vars. ' +
        'Set up a Storage Zone + Pull Zone at https://dash.bunny.net/storage'
    );
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const region = options.region || '';
  const endpoint = region
    ? `https://${region}.storage.bunnycdn.com`
    : 'https://storage.bunnycdn.com';
  const fileBuffer = fs.readFileSync(filePath);
  console.log(
    `Bunny Storage: uploading ${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB → ${remotePath}`
  );
  const res = await fetch(`${endpoint}/${zoneName}/${remotePath}`, {
    method: 'PUT',
    headers: { AccessKey: apiKey },
    body: fileBuffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bunny Storage: upload failed (${res.status}): ${errText}`);
  }
  const url = `https://${cdnHostname}/${remotePath}`;
  console.log(`Bunny Storage: upload complete. URL: ${url}`);
  return {
    url,
    storagePath: `${zoneName}/${remotePath}`,
    size: fileBuffer.length,
  };
}

// ---------------------------------------------------------------------------
// Media Conversion
// ---------------------------------------------------------------------------

/**
 * Convert an array of PNG screenshot buffers (or file paths) into an animated GIF.
 * Best for step-by-step PR demos — precise frame control, crisp output, 1-5 MB.
 * Requires: gif-encoder-2 + @napi-rs/canvas (installed via npm run setup).
 * @param {Array<Buffer|string>} frames - PNG buffers from page.screenshot() or file paths
 * @param {string} outputPath - Output GIF file path
 * @param {Object} [options] - { width: 800, height: 450, fps: 10, quality: 10, repeat: 0 }
 * @returns {Object} { path, size, sizeMB, frames, dimensions, fps }
 */
async function screenshotsToGif(frames, outputPath, options = {}) {
  const GIFEncoder = require('gif-encoder-2');
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const fs = require('fs');
  const path = require('path');

  const width = options.width || 800;
  const height = options.height || 450;
  const fps = options.fps || 10;
  const repeat = options.repeat !== undefined ? options.repeat : 0;
  const quality = options.quality || 10;

  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  const encoder = new GIFEncoder(width, height);
  const stream = fs.createWriteStream(outputPath);
  encoder.createReadStream().pipe(stream);

  encoder.start();
  encoder.setRepeat(repeat);
  encoder.setDelay(Math.round(1000 / fps));
  encoder.setQuality(quality);

  const annotations = options.annotations || null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const imgData = Buffer.isBuffer(frame) ? frame : fs.readFileSync(frame);
    const img = await loadImage(imgData);
    ctx.drawImage(img, 0, 0, width, height);

    // Apply annotations if present for this frame
    const annotation = annotations && annotations[i];
    if (annotation) {
      if (annotation.click) {
        const sx = annotation.sourceWidth || width;
        const sy = annotation.sourceHeight || height;
        const cx = annotation.click.x * (width / sx);
        const cy = annotation.click.y * (height / sy);
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (annotation.label) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, height - 32, width, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(annotation.label, 10, height - 10);
      }
    }

    encoder.addFrame(ctx);
  }

  encoder.finish();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const stats = fs.statSync(outputPath);
  return {
    path: outputPath,
    size: stats.size,
    sizeMB: Math.round((stats.size / 1024 / 1024) * 100) / 100,
    frames: frames.length,
    dimensions: `${width}x${height}`,
    fps,
  };
}

// ---------------------------------------------------------------------------
// Browser State Inspection
// ---------------------------------------------------------------------------

/**
 * Read localStorage. Pass a key to get one value, or omit for all entries.
 * @param {Object} page - Playwright page
 * @param {string} [key] - Specific key to read
 * @returns {string|Object} Single value or { key: value } map
 */
async function getLocalStorage(page, key) {
  if (key) {
    return await page.evaluate((k) => window.localStorage.getItem(k), key);
  }
  return await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      items[k] = window.localStorage.getItem(k);
    }
    return items;
  });
}

/**
 * Read sessionStorage. Pass a key to get one value, or omit for all entries.
 * @param {Object} page - Playwright page
 * @param {string} [key] - Specific key to read
 * @returns {string|Object} Single value or { key: value } map
 */
async function getSessionStorage(page, key) {
  if (key) {
    return await page.evaluate((k) => window.sessionStorage.getItem(k), key);
  }
  return await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      items[k] = window.sessionStorage.getItem(k);
    }
    return items;
  });
}

/**
 * Get all cookies from a browser context.
 * @param {Object} context - Browser context
 * @returns {Array} Array of cookie objects
 */
async function getCookies(context) {
  return await context.cookies();
}

/**
 * Clear localStorage, sessionStorage, and cookies.
 * @param {Object} page - Playwright page
 */
async function clearAllStorage(page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

/**
 * Run an accessibility audit using axe-core (injected from CDN).
 * Returns violations, pass count, and a summary. Requires internet for first load.
 * @param {Object} page - Playwright page
 * @param {Object} [options] - { context: 'main', tags: ['wcag2a','wcag2aa'], rules: {} }
 * @returns {Object} { violations, violationCount, passes, incomplete, summary }
 */
async function runAccessibilityAudit(page, options = {}) {
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
  });

  const results = await page.evaluate(async (opts) => {
    return await window.axe.run(opts.context || document, {
      rules: opts.rules,
      tags: opts.tags || ['wcag2a', 'wcag2aa'],
    });
  }, options);

  return {
    violations: results.violations,
    violationCount: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete,
    summary: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
    })),
  };
}

/**
 * Verify keyboard focus order by tabbing through elements.
 * Returns whether each Tab press landed on the expected element.
 * @param {Object} page - Playwright page
 * @param {Array<string>} selectors - Expected focus order as CSS selectors
 * @returns {Array} [{ step, expectedSelector, actualElement, matches }]
 */
async function checkFocusOrder(page, selectors) {
  const results = [];
  await page.click('body');

  for (let i = 0; i < selectors.length; i++) {
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tagName: el.tagName,
        id: el.id || null,
        textContent: el.textContent?.trim()?.substring(0, 50) || null,
      };
    });

    const matches = await page.evaluate(
      (sel) => document.activeElement === document.querySelector(sel),
      selectors[i]
    );

    results.push({
      step: i + 1,
      expectedSelector: selectors[i],
      actualElement: focused,
      matches,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Performance Metrics
// ---------------------------------------------------------------------------

/**
 * Capture page performance metrics including Navigation Timing and Web Vitals.
 * Call AFTER page has fully loaded (after networkidle or load event).
 * Note: Web Vitals (FCP, LCP, CLS) require real page loads — they may be empty
 * for pages served via page.route() or page.setContent().
 * @param {Object} page - Playwright page
 * @returns {Object} { timing: { ttfb, domInteractive, ... }, vitals: { fcp, lcp, cls } }
 */
async function capturePerformanceMetrics(page) {
  const timing = await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0];
    if (!perf) return null;
    return {
      dns: Math.round(perf.domainLookupEnd - perf.domainLookupStart),
      tcp: Math.round(perf.connectEnd - perf.connectStart),
      ttfb: Math.round(perf.responseStart - perf.requestStart),
      download: Math.round(perf.responseEnd - perf.responseStart),
      domInteractive: Math.round(perf.domInteractive - perf.fetchStart),
      domComplete: Math.round(perf.domComplete - perf.fetchStart),
      loadEvent: Math.round(perf.loadEventEnd - perf.fetchStart),
    };
  });

  const vitals = await page.evaluate(() => {
    const result = {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcp) result.fcp = Math.round(fcp.startTime);

    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      result.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
    }

    const clsEntries = performance.getEntriesByType('layout-shift');
    if (clsEntries.length > 0) {
      result.cls = clsEntries.filter((e) => !e.hadRecentInput).reduce((sum, e) => sum + e.value, 0);
      result.cls = Math.round(result.cls * 1000) / 1000;
    }

    return result;
  });

  return { timing, vitals };
}

// ---------------------------------------------------------------------------
// Multi-Viewport Responsive Sweep
// ---------------------------------------------------------------------------

/**
 * Capture screenshots at multiple viewport sizes.
 * @param {Object} page - Playwright page
 * @param {string} url - URL to capture
 * @param {Array} [breakpoints] - [{ name, width, height }] defaults to mobile/tablet/desktop/wide
 * @param {string} [outputDir] - Output directory (default: /tmp/responsive-screenshots)
 * @returns {Array} [{ name, width, height, path }]
 */
async function captureResponsiveScreenshots(page, url, breakpoints, outputDir) {
  const fs = require('fs');
  const path = require('path');

  const bps = breakpoints || [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'wide', width: 1920, height: 1080 },
  ];
  const dir = outputDir || '/tmp/responsive-screenshots';
  fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (const bp of bps) {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await page.waitForTimeout(1000);

    const filePath = path.join(dir, `${bp.name}-${bp.width}x${bp.height}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    results.push({ ...bp, path: filePath });
    console.log(`  ${bp.name} (${bp.width}x${bp.height}): ${filePath}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Network Simulation
// ---------------------------------------------------------------------------

/**
 * Add artificial latency to all network requests.
 * @param {Object} page - Playwright page
 * @param {number} [latencyMs=500] - Delay in milliseconds per request
 */
async function simulateSlowNetwork(page, latencyMs = 500) {
  await page.route('**/*', async (route) => {
    await new Promise((r) => setTimeout(r, latencyMs));
    await route.fallback();
  });
}

/**
 * Set the browser context to offline mode.
 * @param {Object} context - Browser context
 */
async function simulateOffline(context) {
  await context.setOffline(true);
}

/**
 * Block specific resource types (images, fonts, stylesheets, etc.).
 * @param {Object} page - Playwright page
 * @param {Array<string>} [types] - Resource types to block (default: ['image','font','stylesheet'])
 */
async function blockResources(page, types = ['image', 'font', 'stylesheet']) {
  await page.route('**/*', (route) => {
    if (types.includes(route.request().resourceType())) {
      return route.abort();
    }
    return route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Layout & Visual Inspection
// ---------------------------------------------------------------------------

/**
 * Get an element's bounding box, visibility, and computed styles.
 * @param {Object} page - Playwright page
 * @param {string} selector - CSS selector
 * @returns {Object|null} { x, y, width, height, visible, inViewport, computedStyles }
 */
async function getElementBounds(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 5000, state: 'attached' });
  } catch {
    return null;
  }

  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible:
        styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
      inViewport:
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0,
      computedStyles: {
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        position: styles.position,
        zIndex: styles.zIndex,
        overflow: styles.overflow,
      },
    };
  }, selector);
}

// ---------------------------------------------------------------------------
// Page Structure Discovery
// ---------------------------------------------------------------------------

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'slider',
  'switch',
  'tab',
  'menuitem',
  'searchbox',
  'spinbutton',
  'option',
]);

/**
 * Parse a Playwright ARIA snapshot YAML string into structured nodes.
 * Each line like `- role "name" [attr=value]` becomes an object.
 * @param {string} yaml - ARIA snapshot YAML string
 * @returns {Array<{ role: string, name: string, level?: number, checked?: boolean, disabled?: boolean, expanded?: boolean, selected?: boolean, indent: number }>}
 */
function parseAriaSnapshot(yaml) {
  if (!yaml) return [];
  const nodes = [];
  const lines = yaml.split('\n');
  for (const line of lines) {
    // Match: "  - role "name" [attr=value, attr2]:" or "  - role "name":" or "  - role:"
    const match = line.match(/^(\s*)- (\w+)(?: "([^"]*)")?(?:\s*\[([^\]]*)\])?/);
    if (!match) continue;
    const indent = match[1].length;
    const role = match[2];
    const name = match[3] || '';
    const attrs = match[4] || '';

    const node = { role, name, indent };

    // Parse attributes like "level=1", "checked", "disabled", "expanded", "selected"
    if (attrs) {
      for (const attr of attrs.split(/,\s*/)) {
        const [key, val] = attr.split('=');
        if (key === 'level') node.level = parseInt(val, 10);
        else if (key === 'checked') node.checked = val === undefined ? true : val === 'true';
        else if (key === 'disabled') node.disabled = true;
        else if (key === 'expanded') node.expanded = val === undefined ? true : val === 'true';
        else if (key === 'selected') node.selected = val === undefined ? true : val === 'true';
      }
    }

    nodes.push(node);
  }
  return nodes;
}

/**
 * Generate a suggested Playwright selector for a parsed ARIA node.
 * @param {Object} node - Parsed ARIA node
 * @returns {string}
 */
function suggestSelector(node) {
  const { role, name, level } = node;
  if (!name) return `getByRole('${role}')`;
  const opts = [`name: '${name.replace(/'/g, "\\'")}'`];
  if (level) opts.push(`level: ${level}`);
  return `getByRole('${role}', { ${opts.join(', ')} })`;
}

/**
 * Get page structure via the accessibility tree. Returns the raw ARIA snapshot
 * YAML (preserving hierarchy) plus a parsed summary with suggested selectors.
 *
 * Uses locator.ariaSnapshot() — the modern Playwright API (v1.49+).
 *
 * @param {Object} page - Playwright page
 * @param {Object} [options={}]
 * @param {boolean} [options.interactiveOnly=false] - Only include interactive elements in parsed tree
 * @param {string} [options.root] - CSS selector to scope the tree (e.g., 'main', '#login-form')
 * @returns {{ url: string, title: string, yaml: string, tree: Array, summary: Object }}
 */
async function getPageStructure(page, options = {}) {
  const { interactiveOnly = false, root } = options;

  const locator = root ? page.locator(root).first() : page.locator('body');

  let yaml;
  try {
    yaml = await locator.ariaSnapshot();
  } catch (e) {
    return {
      url: page.url(),
      title: await page.title(),
      yaml: '',
      tree: [],
      summary: { total: 0, interactive: 0, headings: 0, links: 0, buttons: 0, inputs: 0 },
    };
  }

  let nodes = parseAriaSnapshot(yaml);

  if (interactiveOnly) {
    nodes = nodes.filter((n) => INTERACTIVE_ROLES.has(n.role));
  }

  const tree = nodes.map((node) => {
    const entry = {
      role: node.role,
      name: node.name,
      selector: suggestSelector(node),
    };
    if (node.level) entry.level = node.level;
    if (node.checked !== undefined) entry.checked = node.checked;
    if (node.disabled) entry.disabled = true;
    if (node.expanded !== undefined) entry.expanded = node.expanded;
    if (node.selected !== undefined) entry.selected = node.selected;
    return entry;
  });

  const summary = {
    total: tree.length,
    interactive: tree.filter((n) => INTERACTIVE_ROLES.has(n.role)).length,
    headings: tree.filter((n) => n.role === 'heading').length,
    links: tree.filter((n) => n.role === 'link').length,
    buttons: tree.filter((n) => n.role === 'button').length,
    inputs: tree.filter((n) =>
      ['textbox', 'searchbox', 'spinbutton', 'combobox', 'checkbox', 'radio'].includes(n.role)
    ).length,
  };

  return {
    url: page.url(),
    title: await page.title(),
    yaml,
    tree,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Dialog Handling
// ---------------------------------------------------------------------------

/**
 * Auto-handle dialogs (alert, confirm, prompt, beforeunload) on a page.
 * Call before navigating — registers a persistent listener.
 *
 * @param {Object} page - Playwright page
 * @param {Object} [options={}]
 * @param {boolean} [options.accept=true] - Accept dialogs (true) or dismiss (false)
 * @param {string} [options.promptText=''] - Text to enter for prompt() dialogs
 * @param {Function} [options.onDialog] - Optional callback(dialog) for custom logic; return true to skip default handling
 * @returns {{ dialogs: Array }} - Access .dialogs to see all captured dialogs after the fact
 */
function handleDialogs(page, options = {}) {
  const { accept = true, promptText = '', onDialog } = options;
  const captured = { dialogs: [] };

  page.on('dialog', async (dialog) => {
    captured.dialogs.push({
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
      timestamp: Date.now(),
    });

    if (onDialog) {
      const handled = await onDialog(dialog);
      if (handled) return;
    }

    if (accept) {
      await dialog.accept(dialog.type() === 'prompt' ? promptText : undefined);
    } else {
      await dialog.dismiss();
    }
  });

  return captured;
}

// ---------------------------------------------------------------------------
// Overlay / Popup Dismissal
// ---------------------------------------------------------------------------

/**
 * Register handlers to auto-dismiss blocking overlays (cookie banners, modals,
 * onboarding tours, etc.) whenever they appear during page interaction.
 * Uses Playwright's addLocatorHandler (v1.42+).
 *
 * @param {Object} page - Playwright page
 * @param {Array<{ locator: string, action?: 'click'|'remove', clickTarget?: string }>} [overlays]
 *   Each entry: locator to detect the overlay, action to take, optional click target within it.
 *   Defaults to common cookie/consent banner patterns.
 *   Note: default patterns are intentionally broad — they may match non-overlay buttons
 *   (e.g., "Accept Invitation"). Pass custom overlays for production flows.
 * @returns {void}
 */
async function dismissOverlays(page, overlays) {
  const defaults = [
    { locator: '[class*="cookie"] button, [id*="cookie"] button', action: 'click' },
    { locator: '[class*="consent"] button, [id*="consent"] button', action: 'click' },
    { locator: '[class*="CookieBanner"] button', action: 'click' },
    {
      locator:
        'button:has-text("Accept"), button:has-text("Accept All"), button:has-text("Got it"), button:has-text("I agree")',
      action: 'click',
    },
  ];

  const entries = overlays || defaults;

  for (const entry of entries) {
    const loc = page.locator(entry.locator).first();
    try {
      await page.addLocatorHandler(loc, async () => {
        if (entry.action === 'remove') {
          await loc.evaluate((el) => el.remove()).catch(() => {});
        } else {
          const target = entry.clickTarget ? page.locator(entry.clickTarget).first() : loc;
          await target.click({ timeout: 2000 }).catch(() => {});
        }
      });
    } catch (e) {
      // addLocatorHandler may fail if locator is invalid — skip silently
    }
  }
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

/**
 * Start a Playwright trace. Records DOM snapshots, screenshots, network, and
 * console activity. Stop with stopTracing() to save a .zip viewable in
 * Playwright Trace Viewer (npx playwright show-trace trace.zip).
 *
 * @param {Object} context - Playwright browser context
 * @param {Object} [options={}]
 * @param {boolean} [options.screenshots=true] - Capture screenshots at each step
 * @param {boolean} [options.snapshots=true] - Capture DOM snapshots
 * @param {boolean} [options.sources=false] - Include source files in the trace
 * @returns {void}
 */
async function startTracing(context, options = {}) {
  const { screenshots = true, snapshots = true, sources = false } = options;
  await context.tracing.start({ screenshots, snapshots, sources });
}

/**
 * Stop tracing and save the trace file.
 *
 * @param {Object} context - Playwright browser context
 * @param {string} [outputPath='/tmp/playwright-trace.zip'] - Where to save
 * @returns {{ path: string }}
 */
async function stopTracing(context, outputPath = '/tmp/playwright-trace.zip') {
  await context.tracing.stop({ path: outputPath });
  return { path: outputPath };
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a PDF from the current page. Only works in Chromium headless.
 *
 * @param {Object} page - Playwright page
 * @param {string} [outputPath='/tmp/playwright-page.pdf'] - Where to save
 * @param {Object} [options={}]
 * @param {string} [options.format='A4'] - Paper format (A4, Letter, Legal, etc.)
 * @param {boolean} [options.tagged=false] - Generate tagged (accessible) PDF
 * @param {boolean} [options.outline=false] - Embed document outline (bookmarks)
 * @param {boolean} [options.printBackground=true] - Print background graphics
 * @param {Object} [options.margin] - Margins object { top, right, bottom, left }
 * @returns {{ path: string }}
 */
async function generatePdf(page, outputPath = '/tmp/playwright-page.pdf', options = {}) {
  const {
    format = 'A4',
    tagged = false,
    outline = false,
    printBackground = true,
    margin,
  } = options;

  const pdfOpts = { path: outputPath, format, printBackground };
  if (tagged) pdfOpts.tagged = true;
  if (outline) pdfOpts.outline = true;
  if (margin) pdfOpts.margin = margin;

  await page.pdf(pdfOpts);
  return { path: outputPath };
}

// ---------------------------------------------------------------------------
// File Download
// ---------------------------------------------------------------------------

/**
 * Wait for a download triggered by an action, then save it.
 *
 * @param {Object} page - Playwright page
 * @param {Function} triggerAction - Async function that triggers the download (e.g., () => page.click('#download-btn'))
 * @param {string} [savePath] - Where to save. If omitted, uses suggested filename in /tmp/
 * @returns {{ path: string, suggestedFilename: string, url: string }}
 */
async function waitForDownload(page, triggerAction, savePath) {
  const [download] = await Promise.all([page.waitForEvent('download'), triggerAction()]);

  const filename = download.suggestedFilename();
  const finalPath = savePath || `/tmp/${filename}`;
  await download.saveAs(finalPath);

  return {
    path: finalPath,
    suggestedFilename: filename,
    url: download.url(),
  };
}

module.exports = {
  // Page interaction
  launchBrowser,
  createPage,
  waitForPageReady,
  safeClick,
  safeType,
  extractTexts,
  takeScreenshot,
  authenticate,
  scrollPage,
  extractTableData,
  handleCookieBanner,
  retryWithBackoff,
  createContext,
  createPresetContext,
  detectDevServers,
  getExtraHeadersFromEnv,
  // Auth state persistence
  saveAuthState,
  loadAuthState,
  // Resolution presets
  RESOLUTION_PRESETS,
  // Console monitoring
  startConsoleCapture,
  getConsoleErrors,
  getConsoleLogs,
  // Network capture
  startNetworkCapture,
  getFailedRequests,
  getCapturedRequests,
  waitForApiResponse,
  // Video recording
  createVideoContext,
  // Video upload (optional)
  uploadToVimeo,
  uploadToBunny,
  // Image/file upload to Bunny Edge Storage (optional)
  uploadToBunnyStorage,
  // Media conversion
  screenshotsToGif,
  // Browser state
  getLocalStorage,
  getSessionStorage,
  getCookies,
  clearAllStorage,
  // Accessibility
  runAccessibilityAudit,
  checkFocusOrder,
  // Performance
  capturePerformanceMetrics,
  // Responsive
  captureResponsiveScreenshots,
  // Network simulation
  simulateSlowNetwork,
  simulateOffline,
  blockResources,
  // Layout
  getElementBounds,
  // Page structure discovery
  getPageStructure,
  parseAriaSnapshot,
  suggestSelector,
  INTERACTIVE_ROLES,
  // Dialog handling
  handleDialogs,
  // Overlay dismissal
  dismissOverlays,
  // Tracing
  startTracing,
  stopTracing,
  // PDF generation
  generatePdf,
  // File download
  waitForDownload,
};
