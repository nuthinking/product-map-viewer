import { spawn } from 'node:child_process';

/** Open a URL in the default browser. Best effort, never throws. */
export function openBrowser(url) {
  try {
    const platform = process.platform;
    let cmd;
    let args;
    if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '""', url.replace(/&/g, '^&')];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
