(() => {
  let DATA = { sections: [], library: [] };
  const app = document.getElementById("app");
  const authBox = document.getElementById("authBox");
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const find = (arr, id) => (arr || []).find((x) => x.id === id);

  /* ---------- Icons (минималистичные SVG) ---------- */
  const icon = {
    audio: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M21 16a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z"/><path d="M3 16a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/></svg>`,
    text: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2-2h6v18H5a2 2 0 0 1-2-2z"/><path d="M21 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2z"/></svg>`,
    quiz: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  };

  const emptyState = (text) =>
    `<div class="empty-state"><span class="ic">${icon.clock}</span><span>${esc(text)}</span></div>`;

  function crumbs(items) {
    const inner = items.map((it, i) => {
      const last = i === items.length - 1;
      const node = last
        ? `<span class="current">${esc(it.label)}</span>`
        : `<a href="${esc(it.href)}">${esc(it.label)}</a>`;
      return (i > 0 ? `<span class="sep">/</span>` : "") + node;
    }).join("");
    return `<div class="breadcrumbs-bar"><div class="container breadcrumbs">${inner}</div></div>`;
  }

  const page = (html) => `<div class="container page">${html}</div>`;
  const head = (title, sub) =>
    `<div class="page-head"><h1 class="page-title">${esc(title)}</h1>` +
    (sub ? `<p class="page-sub">${esc(sub)}</p>` : "") +
    `<div class="accent-rule"></div></div>`;

  /* ---------- Header auth ---------- */
  function renderAuthBox() {
    const u = Auth.currentUser();
    if (u) {
      authBox.innerHTML = `
        <span class="user-chip">${esc(u.name)}</span>
        <button class="btn btn-outline" id="logoutBtn">Выйти</button>`;
      document.getElementById("logoutBtn").onclick = () => {
        Auth.logout();
        renderAuthBox();
        router();
      };
    } else {
      authBox.innerHTML = `<a class="btn btn-outline" href="#/login">Войти</a>`;
    }
  }

  /* ---------- Pages ---------- */
  function homePage() {
    const cards = DATA.sections.map((s) => `
      <a class="card" href="#/section/${esc(s.id)}">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.description || "")}</p>
        <span class="meta">Циклов: ${s.cycles ? s.cycles.length : 0}</span>
      </a>`).join("");
    app.innerHTML = page(head("Разделы", "Выберите раздел исламских наук.") +
      `<div class="card-list">${cards}</div>`);
  }

  function sectionPage(id) {
    const s = find(DATA.sections, id);
    if (!s) return notFound();
    const cards = (s.cycles || []).map((c) => `
      <a class="card" href="#/section/${esc(s.id)}/cycle/${esc(c.id)}">
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.level || "")}</p>
        <span class="meta">Уроков: ${c.lessons ? c.lessons.length : 0}</span>
      </a>`).join("") || emptyState("Циклы скоро появятся.");
    app.innerHTML =
      crumbs([{ label: "Разделы", href: "#/" }, { label: s.title }]) +
      page(head(s.title, s.description || "") + `<div class="card-list">${cards}</div>`);
  }

  function cyclePage(sid, cid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    if (!s || !c) return notFound();
    const cards = (c.lessons || []).map((l) => `
      <a class="card" href="#/section/${esc(s.id)}/cycle/${esc(c.id)}/lesson/${esc(l.id)}">
        <h3>${esc(l.title)}</h3>
      </a>`).join("") || emptyState("Уроки скоро появятся.");
    app.innerHTML =
      crumbs([
        { label: "Разделы", href: "#/" },
        { label: s.title, href: `#/section/${s.id}` },
        { label: c.title },
      ]) +
      page(head(c.title, c.level || "") + `<div class="card-list">${cards}</div>`);
  }

  function lessonPage(sid, cid, lid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    const l = c && find(c.lessons, lid);
    if (!s || !c || !l) return notFound();

    const audio = l.audio
      ? `<div class="audio-card"><audio controls preload="none" src="${esc(l.audio)}"></audio></div>`
      : emptyState("Аудио будет добавлено позже.");

    const text = l.text
      ? `<div class="lesson-text">${esc(l.text)}</div>`
      : emptyState("Текст урока будет добавлен позже.");

    const tests = (l.tests && l.tests.length)
      ? renderQuiz(l.tests)
      : emptyState("Тесты будут добавлены позже.");

    app.innerHTML =
      crumbs([
        { label: "Разделы", href: "#/" },
        { label: s.title, href: `#/section/${s.id}` },
        { label: c.title, href: `#/section/${s.id}/cycle/${c.id}` },
        { label: l.title },
      ]) +
      page(
        head(l.title) +
        `<div class="lesson-block audio-block">
           <div class="block-head"><span class="ic">${icon.audio}</span>Аудио урока</div>${audio}
         </div>
         <div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.text}</span>Текст урока</div>${text}
         </div>
         <div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.quiz}</span>Тесты для проверки знаний</div>
           <div id="quiz">${tests}</div>
         </div>`
      );

    if (l.tests && l.tests.length) bindQuiz(l.tests);
  }

  function renderQuiz(tests) {
    const qs = tests.map((t, i) => {
      const opts = t.options.map((o, j) => `
        <label class="quiz-opt" data-q="${i}" data-opt="${j}">
          <input type="radio" name="q${i}" value="${j}" /> <span>${esc(o)}</span>
        </label>`).join("");
      return `<div class="quiz-q" data-q="${i}">
        <div class="q-text">${i + 1}. ${esc(t.question)}</div>${opts}</div>`;
    }).join("");
    return `${qs}
      <button class="btn btn-primary" id="checkQuiz">Проверить</button>
      <div class="quiz-result" id="quizResult"></div>`;
  }

  function bindQuiz(tests) {
    document.getElementById("checkQuiz").onclick = () => {
      let correct = 0;
      tests.forEach((t, i) => {
        const sel = document.querySelector(`input[name="q${i}"]:checked`);
        document.querySelectorAll(`.quiz-opt[data-q="${i}"]`).forEach((el) => {
          el.classList.remove("correct", "wrong");
          const opt = Number(el.dataset.opt);
          if (opt === t.correct) el.classList.add("correct");
          else if (sel && Number(sel.value) === opt) el.classList.add("wrong");
        });
        if (sel && Number(sel.value) === t.correct) correct++;
      });
      const res = document.getElementById("quizResult");
      res.textContent = `Правильных ответов: ${correct} из ${tests.length}`;
      res.classList.add("show");
    };
  }

  function libraryPage() {
    const items = (DATA.library || []).map((b) => {
      const action = b.url
        ? `<a class="btn btn-ghost" href="${esc(b.url)}" target="_blank" rel="noopener">Открыть</a>`
        : `<span class="meta">Скоро</span>`;
      return `<div class="card">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author || "")}</p>
        ${b.description ? `<p style="margin-top:6px">${esc(b.description)}</p>` : ""}
        <div style="margin-top:14px">${action}</div>
      </div>`;
    }).join("") || emptyState("Книги скоро появятся.");
    app.innerHTML = page(
      head("Библиотека", "Книги в электронном варианте.") +
      `<div class="card-list">${items}</div>`);
  }

  /* ---------- Auth pages ---------- */
  function loginPage() {
    app.innerHTML = page(`
      <div class="auth-card">
        <h1>Вход</h1>
        <p class="sub">Войдите, чтобы продолжить обучение</p>
        <div class="form-error" id="err"></div>
        <button class="provider-btn" data-provider="google">Войти через Google</button>
        <button class="provider-btn" data-provider="apple">Войти через Apple</button>
        <div class="divider">или по почте</div>
        <form id="loginForm">
          <div class="field"><label>Почта</label><input type="email" id="email" required /></div>
          <div class="field"><label>Пароль</label><input type="password" id="password" required /></div>
          <button class="btn btn-primary btn-block" type="submit">Войти</button>
        </form>
        <div class="auth-switch">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></div>
      </div>`);
    bindProviders();
    document.getElementById("loginForm").onsubmit = (e) => {
      e.preventDefault();
      try { Auth.loginEmail(email.value, password.value); afterAuth(); }
      catch (err) { showErr(err.message); }
    };
  }

  function registerPage() {
    app.innerHTML = page(`
      <div class="auth-card">
        <h1>Регистрация</h1>
        <p class="sub">Создайте аккаунт, чтобы начать</p>
        <div class="form-error" id="err"></div>
        <button class="provider-btn" data-provider="google">Регистрация через Google</button>
        <button class="provider-btn" data-provider="apple">Регистрация через Apple</button>
        <div class="divider">или по почте</div>
        <form id="regForm">
          <div class="field"><label>Имя</label><input type="text" id="name" /></div>
          <div class="field"><label>Почта</label><input type="email" id="email" required /></div>
          <div class="field"><label>Пароль</label><input type="password" id="password" required /></div>
          <button class="btn btn-primary btn-block" type="submit">Создать аккаунт</button>
        </form>
        <div class="auth-switch">Уже есть аккаунт? <a href="#/login">Войти</a></div>
      </div>`);
    bindProviders();
    document.getElementById("regForm").onsubmit = (e) => {
      e.preventDefault();
      try { Auth.registerEmail(name.value, email.value, password.value); afterAuth(); }
      catch (err) { showErr(err.message); }
    };
  }

  function bindProviders() {
    document.querySelectorAll(".provider-btn").forEach((b) => {
      b.onclick = () => { const s = Auth.loginProvider(b.dataset.provider); if (s) afterAuth(); };
    });
  }

  function showErr(msg) {
    const el = document.getElementById("err");
    el.textContent = msg;
    el.style.display = "block";
  }

  function afterAuth() { renderAuthBox(); location.hash = "#/"; }

  function notFound() {
    app.innerHTML = page(
      head("Страница не найдена") +
      `<p><a href="#/">Вернуться на главную</a></p>`);
  }

  /* ---------- Router ---------- */
  function router() {
    const parts = (location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    window.scrollTo(0, 0);
    closeNav();
    if (parts.length === 0) return homePage();
    if (parts[0] === "library") return libraryPage();
    if (parts[0] === "login") return loginPage();
    if (parts[0] === "register") return registerPage();
    if (parts[0] === "section") {
      if (parts.length === 2) return sectionPage(parts[1]);
      if (parts[2] === "cycle" && parts.length === 4) return cyclePage(parts[1], parts[3]);
      if (parts[2] === "cycle" && parts[4] === "lesson" && parts.length === 6)
        return lessonPage(parts[1], parts[3], parts[5]);
    }
    return notFound();
  }

  /* ---------- Mobile nav ---------- */
  function closeNav() {
    mainNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
  navToggle.onclick = () => {
    const open = mainNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  };

  /* ---------- Init ---------- */
  fetch("data.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => { DATA = d; renderAuthBox(); router(); })
    .catch(() => {
      app.innerHTML = page(emptyState("Не удалось загрузить данные. Запустите сайт через локальный сервер."));
    });

  window.addEventListener("hashchange", router);
})();
