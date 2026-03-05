import puppeteer, { type Browser, type Page } from "puppeteer-core";
import debugModule from "debug";

const debug = debugModule("service:screenshot-renderer");

let browser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let rendering = false;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const PAGE_TIMEOUT_MS = 30 * 1000; // 30s per page
const TOTAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min total
const MAX_PAGES = 4;
const VIEWPORT = { width: 1080, height: 1920 };

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    resetIdleTimer();
    return browser;
  }

  debug("Launching Chromium");
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--no-first-run",
      "--no-zygote",
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser",
  });

  resetIdleTimer();
  return browser;
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browser && !rendering) {
      debug("Idle timeout — closing browser");
      await browser.close().catch(() => {});
      browser = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function renderPage(b: Browser, html: string): Promise<Buffer> {
  let page: Page | null = null;
  try {
    page = await b.newPage();
    await page.setViewport(VIEWPORT);

    // Block all outbound network requests — HTML must be self-contained
    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") {
        req.continue();
      } else {
        req.abort("blockedbyclient");
      }
    });

    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: PAGE_TIMEOUT_MS,
    });

    // Small delay for CSS animations/transitions to settle
    await new Promise((r) => setTimeout(r, 500));

    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, ...VIEWPORT },
    });

    return Buffer.from(screenshot);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export async function renderScreenshots(htmlPages: string[]): Promise<Buffer[]> {
  if (htmlPages.length > MAX_PAGES) {
    throw new Error(`Too many pages (max ${MAX_PAGES})`);
  }

  if (rendering) {
    throw new Error("BUSY");
  }

  rendering = true;

  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    totalTimer = setTimeout(() => {
      reject(new Error("Total render timeout exceeded"));
    }, TOTAL_TIMEOUT_MS);
  });

  try {
    const renderPromise = (async () => {
      const b = await getBrowser();

      // Render all pages in parallel (Puppeteer handles multiple tabs)
      const results = await Promise.all(
        htmlPages.map(async (html, i) => {
          debug("Rendering page %d/%d", i + 1, htmlPages.length);
          const buf = await renderPage(b, html);
          debug("Page %d: %d bytes", i + 1, buf.byteLength);
          return buf;
        })
      );

      return results;
    })();

    return await Promise.race([renderPromise, timeoutPromise]);
  } finally {
    rendering = false;
    if (totalTimer) clearTimeout(totalTimer);
    resetIdleTimer();
  }
}

export function isRendering(): boolean {
  return rendering;
}
