import { execSync } from 'child_process';

const port = process.env.PORT || 5000;

export function freePort(targetPort = port) {
  try {
    if (process.platform === 'win32') {
      let output = '';
      try {
        output = execSync(`netstat -ano | findstr :${targetPort}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch {
        // netstat found nothing, port is free
        return;
      }

      const lines = output.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && Number(pid) !== process.pid) {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        try {
          console.log(`[freePort] Freeing port ${targetPort} (terminating stale process ${pid})...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {
          // Process may have already exited
        }
      }
    } else {
      try {
        execSync(`lsof -ti :${targetPort} | xargs kill -9`, { stdio: 'ignore' });
      } catch {
        // Port free
      }
    }
  } catch (err) {
    // Non-fatal
  }
}

// Run immediately if executed directly
freePort(port);

