import { spawn } from 'child_process';
import process from 'process';

// 프로세스 추적을 위한 콜백 함수들
let processTracker = {
  onStart: null,
  onEnd: null,
};

/**
 * 프로세스 추적 설정
 */
export function setProcessTracker(tracker) {
  processTracker = tracker;
}

export function trackProcessStart(child) {
  processTracker.onStart?.(child);
}
export function trackProcessEnd(child) {
  processTracker.onEnd?.(child);
}

export async function runWithWarningCapture(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    // Windows에서 shell을 통해 명령어 실행 필요
    const isWindows =
      process.platform === 'win32' &&
      options.shell !== false &&
      !cmd.toLowerCase().endsWith('.exe');
    // cmd.exe expands percent/exclamation syntax even inside quotes.
    // Reject it before invoking Windows package-manager shims.
    if (
      isWindows &&
      (!/^[a-zA-Z0-9_.-]+$/.test(cmd) || args.some((arg) => /["%!\r\n]/.test(arg)))
    ) {
      resolve({ code: 1, warnings: [], error: 'Unsafe Windows command arguments' });
      return;
    }
    const child = spawn(cmd, isWindows ? args.map((arg) => `"${arg}"`) : args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: isWindows,
      ...options,
    });

    // 프로세스 추적 시작
    trackProcessStart(child);

    const warnings = [];
    let spawnError;
    const pending = { stdout: '', stderr: '' };
    function streamOutput(stream, data, output) {
      output.write(data);
      const lines = (pending[stream] + data.toString()).split(/\r?\n/);
      pending[stream] = lines.pop();
      lines.forEach(capture);
    }

    function capture(line) {
      if (
        /WARNING|not supported|deprecated|unsupported|not officially supported|obsolete/i.test(line)
      ) {
        warnings.push(line.trim());
      }
    }

    child.stdout.on('data', (data) => streamOutput('stdout', data, process.stdout));
    child.stderr.on('data', (data) => streamOutput('stderr', data, process.stderr));

    child.on('close', (code, signal) => {
      Object.values(pending).filter(Boolean).forEach(capture);
      // 프로세스 추적 종료
      trackProcessEnd(child);

      // 신호로 종료된 경우 (Ctrl+C 등)
      if (signal) {
        resolve({ code: signal === 'SIGINT' ? 130 : 1, warnings, terminated: true, signal });
        return;
      }

      resolve({
        code: spawnError ? 1 : (code ?? 1),
        warnings,
        ...(spawnError ? { error: spawnError.message } : {}),
      });
    });

    // 프로세스 에러 처리
    child.on('error', (error) => {
      spawnError = error;
    });
  });
}
