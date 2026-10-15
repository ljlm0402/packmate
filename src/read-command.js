import { spawn } from 'node:child_process';
import process from 'node:process';
import { trackProcessStart, trackProcessEnd } from './warning-capture.js';

// Buffered read-only commands: no terminal output, bounded time and output size.
export function readCommand(cmd, args, { cwd, timeout = 60000, maxBytes = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32' && !cmd.toLowerCase().endsWith('.exe');
    if (
      windows &&
      (!['npm', 'pnpm', 'yarn'].includes(cmd) || args.some((arg) => !/^[a-z-]+$/i.test(arg)))
    ) {
      resolve({ code: 1, stdout: '', stderr: '', error: 'Unsafe command arguments' });
      return;
    }
    const child = spawn(cmd, args, {
      cwd,
      shell: windows,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    trackProcessStart(child);
    let forceTimer;
    const terminate = () => {
      child.kill('SIGTERM');
      forceTimer ||= setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 1000);
    };
    let stdout = '';
    let stderr = '';
    let error = null;
    let bytes = 0;
    const timer = setTimeout(() => {
      error = 'Command timed out';
      terminate();
    }, timeout);
    child.on('error', (cause) => {
      error = cause.message;
    });
    for (const [stream, append] of [
      [
        child.stdout,
        (text) => {
          stdout += text;
        },
      ],
      [
        child.stderr,
        (text) => {
          stderr += text;
        },
      ],
    ]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxBytes) {
          error = 'Command output limit exceeded';
          terminate();
          return;
        }
        append(chunk.toString());
      });
    }
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      trackProcessEnd(child);
      resolve({ code, signal, stdout, stderr, error });
    });
  });
}
