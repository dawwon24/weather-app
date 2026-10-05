// Windowless launcher: starts the Vite server in-process, opens the app in its own
// browser window (Chrome/Edge "app" mode with a dedicated profile), and shuts the
// server down as soon as that window is closed.
//
// Started hidden by "날씨앱 실행.vbs" — there is no console, so problems go to
// launcher.log and a message box.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logFile = path.join(root, 'launcher', 'launcher.log');
const dataDir = path.join(process.env.LOCALAPPDATA ?? root, 'weather-app');
const profileDir = path.join(dataDir, 'browser-profile');
const lockFile = path.join(dataDir, 'running.json');

writeFileSync(logFile, '');
const log = (...args) => writeFileSync(logFile, `[${new Date().toLocaleString()}] ${args.join(' ')}\n`, { flag: 'a' });

function messageBox(text) {
  const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(${JSON.stringify(text).replace(/\$/g, '`$')}, '날씨 앱') | Out-Null`;
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

function findBrowser() {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  return [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].find((p) => existsSync(p));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openWindow(browser, url) {
  return spawn(
    browser,
    [`--app=${url}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
    { stdio: 'ignore', windowsHide: false },
  );
}

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) {
    messageBox('Chrome 또는 Edge 브라우저를 찾지 못했어요. 둘 중 하나를 설치한 뒤 다시 실행해 주세요.');
    log('no browser found');
    return;
  }

  // Already running? Open another window in the existing instance and leave.
  // (The same profile hands the window to the running browser, which keeps its server.)
  if (existsSync(lockFile)) {
    try {
      const { pid, url } = JSON.parse(readFileSync(lockFile, 'utf8'));
      if (isAlive(pid)) {
        log('already running at', url);
        openWindow(browser, url).unref();
        return;
      }
    } catch {
      /* stale or broken lock — start fresh */
    }
  }

  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'error',
    clearScreen: false,
    server: { port: 5173, strictPort: false, open: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, url }));
  log('server started at', url);

  let closing = false;
  const shutdown = async (reason) => {
    if (closing) return;
    closing = true;
    log('shutting down:', reason);
    try {
      rmSync(lockFile, { force: true });
      await server.close();
    } finally {
      process.exit(0);
    }
  };

  const child = openWindow(browser, url);
  const openedAt = Date.now();
  child.on('error', (e) => {
    messageBox(`브라우저를 열지 못했어요: ${e.message}`);
    shutdown('browser spawn error');
  });
  child.on('exit', (code) => {
    // A quick exit means the profile was handed to a browser that was already open
    // (e.g. left over from a crash). Its window still needs the server, so keep
    // serving until that browser process is gone.
    if (Date.now() - openedAt < 5000) {
      log('browser handed off (exit code', code, '), watching profile processes');
      watchProfile(() => shutdown('handed-off browser closed'));
    } else {
      shutdown('window closed');
    }
  });
}

/** Poll for any browser process still using our dedicated profile. */
function watchProfile(onGone) {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profileDir.replace(/'/g, "''")}*' } | Measure-Object | Select-Object -ExpandProperty Count`;
  const check = () => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('exit', () => {
      if (Number(out.trim()) > 0) setTimeout(check, 3000);
      else onGone();
    });
  };
  setTimeout(check, 3000);
}

main().catch((e) => {
  log('fatal:', e?.stack ?? e);
  messageBox(`날씨 앱을 시작하지 못했어요.\n\n${e?.message ?? e}\n\n자세한 내용: launcher\\launcher.log`);
  rmSync(lockFile, { force: true });
  process.exit(1);
});
