import './styles/global.css';
import { defineRoute, start } from './lib/router.js';
import { renderHome } from './pages/home.js';
import { renderVote } from './pages/vote.js';
import { renderResult } from './pages/result.js';
import { renderAdmin } from './pages/admin.js';

const app = document.getElementById('app');

defineRoute('/', () => renderHome(app));
defineRoute('/vote/:id', (params) => renderVote(app, params));
defineRoute('/result/:id', (params) => renderResult(app, params));
defineRoute('/admin', () => renderAdmin(app));

start(() => {
  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1 class="site-title">오늘뭐먹지?</h1>
      </div>
    </header>
    <section class="card stack-3" style="text-align: center;">
      <h2>페이지를 찾을 수 없어요</h2>
      <p class="text-soft">URL을 다시 확인해주세요.</p>
      <div><a class="btn btn-primary" href="#/">홈으로</a></div>
    </section>
  `;
});
