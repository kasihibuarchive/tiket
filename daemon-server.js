// True daemon with single-instance guard
// Survives parent process death via double-fork
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PID_FILE = path.join(__dirname, '.zscripts', 'daemon.pid');
const LOG_FILE = path.join(__dirname, '.zscripts', 'server.log');

// Load .env
const envPath = path.join(__dirname, '.env');
const env = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
}

function log(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[daemon ${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// ─── Parent process: double-fork and exit ───
if (!process.argv.includes('--child')) {
  // Check if already running
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    try {
      process.kill(oldPid, 0); // still alive?
      console.log(`Daemon already running (PID ${oldPid}). Not starting a new one.`);
      process.exit(0);
    } catch {
      // Old PID dead, stale file — proceed
    }
  }

  // Kill any leftover next-server processes on port 3000
  try {
    execSync('fuser -k 3000/tcp 2>/dev/null', { timeout: 3000 });
  } catch {}

  const child = spawn(process.execPath, [__filename, '--child'], {
    detached: true,
    stdio: 'ignore',
    env,
    cwd: __dirname,
  });

  child.unref();
  try { child.disconnect(); } catch {}
  console.log(`Daemon started (child PID: ${child.pid})`);
  process.exit(0);
}

// ─── Child process (the actual daemon) ───
log(`Daemon started, PID=${process.pid}`);

// Write PID file
fs.writeFileSync(PID_FILE, String(process.pid));

const logFd = fs.openSync(LOG_FILE, 'a');

const server = spawn('npx', ['next', 'start', '-p', '3000'], {
  stdio: ['ignore', logFd, logFd],
  env,
  cwd: __dirname,
});

log(`Next.js server started, PID=${server.pid}`);

server.on('exit', (code, signal) => {
  log(`Server exited (code=${code}, signal=${signal})`);
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  server.kill('SIGTERM');
});
