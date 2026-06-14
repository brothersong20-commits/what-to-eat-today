// dev 서버 시작 전(npm predev 훅) 지정 포트(기본 5273)를 점유한 프로세스를 종료한다.
// vite 가 strictPort 로 5273 에 고정돼 있어, 포트가 이미 쓰이면 다른 포트로 넘어가지 않고
// "Port 5273 is already in use" 로 그냥 죽는다. 보통은 깜빡하고 둔 이전 dev 인스턴스이므로
// 정리하고 비운 뒤 vite 가 깨끗하게 뜨도록 한다. (의존성 없이 Node 만으로, 크로스플랫폼)
import { execSync } from 'node:child_process';
import net from 'node:net';

const port = process.argv[2] || '5273';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pidsOnPort(p) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      return [
        ...new Set(
          out
            .split('\n')
            .filter((l) => l.includes('LISTENING') && l.includes(`:${p} `))
            .map((l) => l.trim().split(/\s+/).pop())
            .filter((pid) => pid && pid !== '0')
        )
      ];
    }
    const out = execSync(`lsof -ti tcp:${p}`, { encoding: 'utf8' });
    return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
  } catch {
    return []; // 점유 없음(grep/lsof 미매칭)이면 비어있음으로 취급
  }
}

function kill(pid) {
  try {
    execSync(
      process.platform === 'win32' ? `taskkill /PID ${pid} /F /T` : `kill -9 ${pid}`,
      { stdio: 'ignore' }
    );
  } catch {
    /* 이미 죽었거나 권한 문제 — 무시하고 진행 */
  }
}

function portFree(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(p, '127.0.0.1');
  });
}

const pids = pidsOnPort(port);
if (pids.length) {
  console.log(`[free-port] ${port} 점유 프로세스 종료: PID ${pids.join(', ')}`);
  pids.forEach(kill);
  // 소켓이 완전히 해제될 때까지 잠깐 대기(최대 2초). strictPort 가 TIME_WAIT 에 걸리지 않게.
  for (let i = 0; i < 20; i++) {
    if (await portFree(port)) break;
    await sleep(100);
  }
}
