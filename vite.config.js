import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    open: true,
    // 포트 고정(strictPort): 다른 프로젝트가 5173을 쓰면 조용히 다른 포트로 옮겨가
    // OAuth redirect 주소가 바뀌는 문제가 있어, 이 앱은 항상 5273만 쓴다.
    // (이 포트를 Supabase Auth의 Redirect URLs에 등록해야 구글 로그인 후 되돌아온다.)
    port: 5273,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
