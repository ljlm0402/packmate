import { spawn } from 'child_process';
import process from 'process';

export async function runWithWarningCapture(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    // Windows에서 shell을 통해 명령어 실행 필요
    const isWindows = process.platform === 'win32';
    const child = spawn(cmd, args, { 
      stdio: ['inherit', 'pipe', 'pipe'], 
      shell: isWindows,
      ...options 
    });
    let warnings = [];
    function capture(line) {
      if (
        /WARNING|not supported|deprecated|unsupported|not officially supported|obsolete/i.test(line)
      ) {
        warnings.push(line.trim());
      }
    }
    child.stdout.on('data', (data) => {
      data
        .toString()
        .split('\n')
        .forEach((line) => {
          capture(line);
          process.stdout.write(line + '\n');
        });
    });
    child.stderr.on('data', (data) => {
      data
        .toString()
        .split('\n')
        .forEach((line) => {
          capture(line);
          process.stderr.write(line + '\n');
        });
    });
    child.on('exit', (code) => {
      resolve({ code, warnings });
    });
  });
}
