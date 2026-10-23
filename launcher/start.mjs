// Windowless launcher: starts the Vite server in-process, opens the app as a new tab
// in the user's regular Chrome, and shuts the server down once no weather tab has
// been open for a while (a tab close can't be observed directly, so it watches the
// open pages' dev-server websocket connections instead).
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
const lockFile = path.join(dataDir, 'running.json');

/** Shut down after this long with no weather tab connected. */
const IDLE_MS = 90_000;
/** Allow Chrome this long to start and load the page before the idle clock applies. */
const STARTUP_GRACE_MS = 3 * 60_000;

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

function findChrome() {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  return [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
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

/** New tab in the user's normal Chrome (or a new window if Chrome isn't running yet). */
function openTab(chrome, url) {
  const p = chrome
    ? spawn(chrome, [url], { detached: true, stdio: 'ignore' })
    : spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', (e) => {
    log('open failed:', e.message);
    messageBox(`크롬을 열지 못했어요: ${e.message}

브라우저에서 ${url} 을 직접 열어 주세요.`);
  });
  p.unref();
}

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const chrome = findChrome();
  if (!chrome) log('chrome not found, using the default browser');

  // Already running? Just open another tab on the existing server.
  if (existsSync(lockFile)) {
    try {
      const { pid, url } = JSON.parse(readFileSync(lockFile, 'utf8'));
      if (isAlive(pid)) {
        log('already running at', url);
        openTab(chrome, url);
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

  openTab(chrome, url);

  // Every open weather tab keeps a websocket to the dev server; when none has been
  // connected for IDLE_MS (and the startup grace has passed), all tabs are closed.
  const startedAt = Date.now();
  let lastSeen = startedAt;
  let lastCount = 0;
  setInterval(() => {
    const now = Date.now();
    const count = server.ws.clients.size;
    if (count !== lastCount) log('open tabs:', count);
    lastCount = count;
    if (count > 0) lastSeen = now;
    else if (now - startedAt > STARTUP_GRACE_MS && now - lastSeen > IDLE_MS) shutdown('no open tabs');
  }, 10_000);
}

main().catch((e) => {
  log('fatal:', e?.stack ?? e);
  messageBox(`날씨 앱을 시작하지 못했어요.\n\n${e?.message ?? e}\n\n자세한 내용: launcher\\launcher.log`);
  rmSync(lockFile, { force: true });
  process.exit(1);
});
