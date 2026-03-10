import { spawn } from 'child_process';
import process from 'process';

// 프로세스 추적을 위한 콜백 함수들
let processTracker = {
  onStart: null,
  onEnd: null
};

/**
 * 프로세스 추적 설정
 */
export function setProcessTracker(tracker) {
  processTracker = tracker;
}

export async function runWithWarningCapture(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    // Windows에서 shell을 통해 명령어 실행 필요
    const isWindows = process.platform === 'win32';
    const child = spawn(cmd, args, { 
      stdio: ['inherit', 'pipe', 'pipe'], 
      shell: isWindows,
      ...options 
    });

    // 프로세스 추적 시작
    if (processTracker.onStart) {
      processTracker.onStart(child);
    }

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
    
    child.on('exit', (code, signal) => {
      // 프로세스 추적 종료
      if (processTracker.onEnd) {
        processTracker.onEnd(child);
      }

      // 신호로 종료된 경우 (Ctrl+C 등)
      if (signal) {
        resolve({ code: signal === 'SIGINT' ? 130 : 1, warnings, terminated: true, signal });
        return;
      }

      resolve({ code: code || 0, warnings });
    });

    // 프로세스 에러 처리
    child.on('error', (error) => {
      if (processTracker.onEnd) {
        processTracker.onEnd(child);
      }
      
      console.error(`Process error: ${error.message}`);
      resolve({ code: 1, warnings, error: error.message });
    });
  });
}
