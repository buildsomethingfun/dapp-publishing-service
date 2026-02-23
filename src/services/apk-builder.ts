import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, exec } from "child_process";
import { config } from "../config.js";
import { TurboUploader } from "./turbo-upload.js";
import { toMetaplexFile } from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("service:apk-builder");

// --- Types ---

type BuildParams = {
  deployedUrl: string;
  appName: string;
  packageName: string;
  iconUrl?: string;
  version: string;
  versionCode: number;
};

type BuildStatus = {
  status: "queued" | "building" | "done" | "failed";
  apkUrl?: string;
  error?: string;
  startedAt: number;
};

// --- State ---

const builds = new Map<string, BuildStatus>();
let activeBuilds = 0;
const MAX_CONCURRENT = 2;
const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// --- Helpers ---

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function downloadIcon(url: string, destPath: string): Promise<void> {
  // SSRF protection: only allow https, reject private IPs
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Icon URL must be HTTPS");
  }

  // DNS resolution check for SSRF
  const { resolve4 } = await import("dns/promises");
  const addresses = await resolve4(parsed.hostname);
  for (const addr of addresses) {
    if (
      addr.startsWith("10.") ||
      addr.startsWith("172.16.") ||
      addr.startsWith("192.168.") ||
      addr.startsWith("127.") ||
      addr.startsWith("169.254.") ||
      addr === "0.0.0.0"
    ) {
      throw new Error("Icon URL resolves to private IP");
    }
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download icon: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Icon URL content-type is not an image: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Icon file too large (>10MB)");
  }

  await fs.promises.writeFile(destPath, buffer);
  debug("Downloaded icon: %d bytes", buffer.byteLength);
}

function substituteTokens(filePath: string, replacements: Record<string, string>): void {
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value);
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

// --- Core ---

export function queueBuild(params: BuildParams): string {
  if (activeBuilds >= MAX_CONCURRENT) {
    throw new Error("Too many concurrent builds. Try again later.");
  }

  const buildId = randomUUID();
  builds.set(buildId, { status: "queued", startedAt: Date.now() });

  // Run async, don't await
  runBuild(buildId, params).catch((err) => {
    debug("Build %s failed unexpectedly: %O", buildId, err);
    const status = builds.get(buildId);
    if (status && status.status !== "done") {
      builds.set(buildId, {
        ...status,
        status: "failed",
        error: err.message ?? "Unknown error",
      });
    }
  });

  return buildId;
}

export function getBuildStatus(buildId: string): BuildStatus | undefined {
  return builds.get(buildId);
}

async function runBuild(buildId: string, params: BuildParams): Promise<void> {
  activeBuilds++;
  const status = builds.get(buildId)!;
  builds.set(buildId, { ...status, status: "building" });

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bsf-build-"));
  let gradleProcess: ReturnType<typeof exec> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    debug("Build %s: copying template to %s", buildId, tmpDir);

    // Copy template
    execSync(`cp -r "${config.androidTemplatePath}/." "${tmpDir}/"`, { stdio: "pipe" });

    // Substitute tokens
    const xmlEscapedName = escapeXml(params.appName);

    const replacements: Record<string, string> = {
      __BSF_APPLICATION_ID__: params.packageName,
      __BSF_APP_NAME__: xmlEscapedName,
      __BSF_APP_URL__: params.deployedUrl,
      __BSF_VERSION_NAME__: params.version,
      __BSF_VERSION_CODE__: String(params.versionCode),
    };

    // Substitute in build.gradle (or build.gradle.kts)
    const buildGradle = path.join(tmpDir, "app", "build.gradle");
    const buildGradleKts = path.join(tmpDir, "app", "build.gradle.kts");
    const gradleFile = fs.existsSync(buildGradle) ? buildGradle : buildGradleKts;
    substituteTokens(gradleFile, replacements);

    // Substitute in strings.xml
    const stringsXml = path.join(tmpDir, "app", "src", "main", "res", "values", "strings.xml");
    if (fs.existsSync(stringsXml)) {
      substituteTokens(stringsXml, replacements);
    }

    // Substitute in capacitor.config.json
    const capConfig = path.join(tmpDir, "capacitor.config.json");
    if (fs.existsSync(capConfig)) {
      substituteTokens(capConfig, {
        __BSF_APP_URL__: params.deployedUrl,
        __BSF_APP_NAME__: params.appName, // JSON string, no XML escaping
        __BSF_APPLICATION_ID__: params.packageName,
      });
      // Also copy to assets
      const assetsDir = path.join(tmpDir, "app", "src", "main", "assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.copyFileSync(capConfig, path.join(assetsDir, "capacitor.config.json"));
    }

    // Download icon
    if (params.iconUrl) {
      const iconDest = path.join(tmpDir, "app", "src", "main", "res", "mipmap-xxxhdpi", "ic_launcher.png");
      fs.mkdirSync(path.dirname(iconDest), { recursive: true });
      await downloadIcon(params.iconUrl, iconDest);
    }

    // Run cap sync if node_modules/@capacitor exists
    const capDir = path.join(tmpDir, "node_modules", "@capacitor");
    if (fs.existsSync(capDir)) {
      debug("Build %s: running cap sync", buildId);
      execSync("npx cap sync android", { cwd: tmpDir, stdio: "pipe", timeout: 120_000 });
    }

    // Run Gradle build with timeout
    debug("Build %s: starting Gradle build", buildId);
    const apkPath = await new Promise<string>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        if (gradleProcess) {
          gradleProcess.kill("SIGKILL");
        }
        reject(new Error("Build timed out after 10 minutes"));
      }, BUILD_TIMEOUT_MS);

      gradleProcess = exec(
        "./gradlew assembleRelease --no-daemon -q",
        { cwd: tmpDir, maxBuffer: 50 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`Gradle build failed: ${stderr.slice(-2000)}`));
          } else {
            const apk = path.join(
              tmpDir,
              "app",
              "build",
              "outputs",
              "apk",
              "release",
              "app-release-unsigned.apk"
            );
            if (fs.existsSync(apk)) {
              resolve(apk);
            } else {
              // Try debug APK as fallback
              const debugApk = path.join(
                tmpDir, "app", "build", "outputs", "apk", "release", "app-release.apk"
              );
              if (fs.existsSync(debugApk)) {
                resolve(debugApk);
              } else {
                reject(new Error("APK not found after build"));
              }
            }
          }
        }
      );
    });

    debug("Build %s: APK built at %s", buildId, apkPath);

    // Upload APK to Arweave
    const apkBuffer = await fs.promises.readFile(apkPath);
    const uploader = new TurboUploader(
      config.serviceKeypair,
      config.isDevnet ? "devnet" : "mainnet",
      config.turboBufferPercentage
    );

    const metaplexFile = toMetaplexFile(apkBuffer, `${params.packageName}-${params.version}.apk`);
    const apkUrl = await uploader.upload(metaplexFile);

    debug("Build %s: APK uploaded to %s", buildId, apkUrl);
    builds.set(buildId, { status: "done", apkUrl, startedAt: status.startedAt });
  } catch (err: any) {
    debug("Build %s failed: %s", buildId, err.message);
    builds.set(buildId, {
      status: "failed",
      error: err.message ?? "Unknown error",
      startedAt: status.startedAt,
    });
  } finally {
    activeBuilds--;
    if (timeoutId) clearTimeout(timeoutId);
    // Cleanup tmpdir
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
