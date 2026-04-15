const http = require('http');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(process.env.USERPROFILE, '.maven-cache');
const PORT = 8888;

const REPOS = [
  'https://dl.google.com/dl/android/maven2',
  'https://repo.maven.apache.org/maven2',
  'https://plugins.gradle.org/m2',
  'https://www.jitpack.io',
  'https://repo1.maven.org/maven2',
];

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const downloading = new Map();

function downloadFile(url, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const script = `
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
try {
  Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -OutFile '${destPath.replace(/'/g, "''")}' -ErrorAction Stop -TimeoutSec 90
  Write-Output 'OK'
} catch {
  Write-Output "FAIL: $_"
}
`;

  try {
    const result = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      timeout: 120000,
      encoding: 'utf8',
    }).trim();
    return result.startsWith('OK') && fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
  } catch (e) {
    if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch (_) {}
    return false;
  }
}

const server = http.createServer((req, res) => {
  const reqPath = req.url.replace(/[?#].*$/, '');
  const cachePath = path.join(CACHE_DIR, reqPath.replace(/\//g, path.sep));

  // Serve from cache
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).isFile() && fs.statSync(cachePath).size > 0) {
    const stat = fs.statSync(cachePath);
    res.writeHead(200, { 'Content-Length': stat.size });
    fs.createReadStream(cachePath).pipe(res);
    return;
  }

  // Prevent duplicate downloads
  if (downloading.has(reqPath)) {
    const interval = setInterval(() => {
      if (!downloading.has(reqPath)) {
        clearInterval(interval);
        if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
          const stat = fs.statSync(cachePath);
          res.writeHead(200, { 'Content-Length': stat.size });
          fs.createReadStream(cachePath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    }, 500);
    return;
  }

  downloading.set(reqPath, true);

  // Try each repo
  let found = false;
  for (const repo of REPOS) {
    const url = repo + reqPath;
    if (downloadFile(url, cachePath)) {
      console.log(`[OK] ${reqPath} from ${repo}`);
      found = true;
      break;
    }
  }

  downloading.delete(reqPath);

  if (found && fs.existsSync(cachePath)) {
    const stat = fs.statSync(cachePath);
    res.writeHead(200, { 'Content-Length': stat.size });
    fs.createReadStream(cachePath).pipe(res);
  } else {
    console.log(`[404] ${reqPath}`);
    res.writeHead(404);
    res.end('Not found');
  }
});

server.maxConnections = 50;
server.timeout = 300000;
server.keepAliveTimeout = 60000;

server.listen(PORT, () => {
  console.log(`Maven proxy on http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Error:', err.message);
});
