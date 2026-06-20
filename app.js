(() => {
  let DATA = { sections: [], library: [] };
  const app = document.getElementById("app");
  const authBox = document.getElementById("authBox");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const find = (arr, id) => (arr || []).find((x) => x.id === id);

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
      authBox.innerHTML = `<a class="btn" href="#/login">Войти</a>`;
    }
  }

  /* ---------- Pages ---------- */
  function homePage() {
    const cards = DATA.sections.map((s) => `
      <a class="card" href="#/section/${esc(s.id)}">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.description || "")}</p>
        <div class="meta">Циклов: ${s.cycles ? s.cycles.length : 0}</div>
      </a>`).join("");
    app.innerHTML = `
      <h1 class="page-title">Разделы</h1>
      <p class="page-sub">Выберите раздел исламских наук.</p>
      <div class="card-list">${cards}</div>`;
  }

  function sectionPage(id) {
    const s = find(DATA.sections, id);
    if (!s) return notFound();
    const cards = (s.cycles || []).map((c) => `
      <a class="card" href="#/section/${esc(s.id)}/cycle/${esc(c.id)}">
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.level || "")}</p>
        <div class="meta">Уроков: ${c.lessons ? c.lessons.length : 0}</div>
      </a>`).join("") || `<p class="empty">Циклы скоро появятся.</p>`;
    app.innerHTML = `
      <div class="breadcrumbs"><a href="#/">Разделы</a> / ${esc(s.title)}</div>
      <h1 class="page-title">${esc(s.title)}</h1>
      <p class="page-sub">${esc(s.description || "")}</p>
      <div class="card-list">${cards}</div>`;
  }

  function cyclePage(sid, cid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    if (!s || !c) return notFound();
    const cards = (c.lessons || []).map((l) => `
      <a class="card" href="#/section/${esc(s.id)}/cycle/${esc(c.id)}/lesson/${esc(l.id)}">
        <h3>${esc(l.title)}</h3>
      </a>`).join("") || `<p class="empty">Уроки скоро появятся.</p>`;
    app.innerHTML = `
      <div class="breadcrumbs">
        <a href="#/">Разделы</a> / <a href="#/section/${esc(s.id)}">${esc(s.title)}</a> / ${esc(c.title)}
      </div>
      <h1 class="page-title">${esc(c.title)}</h1>
      <p class="page-sub">${esc(c.level || "")}</p>
      <div class="card-list">${cards}</div>`;
  }

  function lessonPage(sid, cid, lid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    const l = c && find(c.lessons, lid);
    if (!s || !c || !l) return notFound();

    const audio = l.audio
      ? `<audio controls src="${esc(l.audio)}"></audio>`
      : `<p class="empty">Аудио будет добавлено позже.</p>`;

    const text = l.text
      ? `<div class="lesson-text">${esc(l.text)}</div>`
      : `<p class="empty">Текст урока будет добавлен позже.</p>`;

    const tests = (l.tests && l.tests.length)
      ? renderQuizPlaceholder(l.tests)
      : `<p class="empty">Тесты будут добавлены позже.</p>`;

    app.innerHTML = `
      <div class="breadcrumbs">
        <a href="#/">Разделы</a> / <a href="#/section/${esc(s.id)}">${esc(s.title)}</a> /
        <a href="#/section/${esc(s.id)}/cycle/${esc(c.id)}">${esc(c.title)}</a> / ${esc(l.title)}
      </div>
      <h1 class="page-title">${esc(l.title)}</h1>
      <div class="lesson-block"><h2>Аудио урока</h2>${audio}</div>
      <div class="lesson-block"><h2>Текст урока</h2>${text}</div>
      <div class="lesson-block"><h2>Тесты для проверки знаний</h2><div id="quiz">${tests}</div></div>`;

    if (l.tests && l.tests.length) bindQuiz(l.tests);
  }

  function renderQuizPlaceholder(tests) {
    const qs = tests.map((t, i) => {
      const opts = t.options.map((o, j) => `
        <label class="quiz-opt" data-q="${i}" data-opt="${j}">
          <input type="radio" name="q${i}" value="${j}" /> ${esc(o)}
        </label>`).join("");
      return `<div class="quiz-q" data-q="${i}">
        <div class="q-text">${i + 1}. ${esc(t.question)}</div>${opts}</div>`;
    }).join("");
    return `${qs}
      <button class="btn" id="checkQuiz">Проверить</button>
      <div class="quiz-result" id="quizResult"></div>`;
  }

  function bindQuiz(tests) {
    const btn = document.getElementById("checkQuiz");
    btn.onclick = () => {
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
      document.getElementById("quizResult").textContent =
        `Правильных ответов: ${correct} из ${tests.length}`;
    };
  }

  function libraryPage() {
    const items = (DATA.library || []).map((b) => {
      const action = b.url
        ? `<a class="btn btn-outline" href="${esc(b.url)}" target="_blank" rel="noopener">Открыть</a>`
        : `<span class="meta">Скоро</span>`;
      return `<div class="card">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author || "")}</p>
        <div class="meta">${esc(b.description || "")}</div>
        <div style="margin-top:12px">${action}</div>
      </div>`;
    }).join("") || `<p class="empty">Книги скоро появятся.</p>`;
    app.innerHTML = `
      <h1 class="page-title">Библиотека</h1>
      <p class="page-sub">Книги в электронном варианте.</p>
      <div class="card-list">${items}</div>`;
  }

  /* ---------- Auth pages ---------- */
  function loginPage() {
    app.innerHTML = `
      <div class="auth-card">
        <h1>Вход</h1>
        <div class="form-error" id="err" style="display:none"></div>
        <button class="provider-btn" data-provider="google">Войти через Google</button>
        <button class="provider-btn" data-provider="apple">Войти через Apple</button>
        <div class="divider">или</div>
        <form id="loginForm">
          <div class="field"><label>Почта</label><input type="email" id="email" required /></div>
          <div class="field"><label>Пароль</label><input type="password" id="password" required /></div>
          <button class="btn btn-block" type="submit">Войти</button>
        </form>
        <div class="auth-switch">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></div>
      </div>`;
    bindProviders();
    document.getElementById("loginForm").onsubmit = (e) => {
      e.preventDefault();
      try {
        Auth.loginEmail(email.value, password.value);
        afterAuth();
      } catch (err) { showErr(err.message); }
    };
  }

  function registerPage() {
    app.innerHTML = `
      <div class="auth-card">
        <h1>Регистрация</h1>
        <div class="form-error" id="err" style="display:none"></div>
        <button class="provider-btn" data-provider="google">Регистрация через Google</button>
        <button class="provider-btn" data-provider="apple">Регистрация через Apple</button>
        <div class="divider">или</div>
        <form id="regForm">
          <div class="field"><label>Имя</label><input type="text" id="name" /></div>
          <div class="field"><label>Почта</label><input type="email" id="email" required /></div>
          <div class="field"><label>Пароль</label><input type="password" id="password" required /></div>
          <button class="btn btn-block" type="submit">Создать аккаунт</button>
        </form>
        <div class="auth-switch">Уже есть аккаунт? <a href="#/login">Войти</a></div>
      </div>`;
    bindProviders();
    document.getElementById("regForm").onsubmit = (e) => {
      e.preventDefault();
      try {
        Auth.registerEmail(name.value, email.value, password.value);
        afterAuth();
      } catch (err) { showErr(err.message); }
    };
  }

  function bindProviders() {
    document.querySelectorAll(".provider-btn").forEach((b) => {
      b.onclick = () => {
        const s = Auth.loginProvider(b.dataset.provider);
        if (s) afterAuth();
      };
    });
  }

  function showErr(msg) {
    const el = document.getElementById("err");
    el.textContent = msg;
    el.style.display = "block";
  }

  function afterAuth() {
    renderAuthBox();
    location.hash = "#/";
  }

  function notFound() {
    app.innerHTML = `<h1 class="page-title">Страница не найдена</h1>
      <p class="page-sub"><a href="#/">Вернуться на главную</a></p>`;
  }

  /* ---------- Router ---------- */
  function router() {
    const parts = (location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    window.scrollTo(0, 0);
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

  /* ---------- Init ---------- */
  fetch("data.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      renderAuthBox();
      router();
    })
    .catch(() => {
      app.innerHTML = `<p class="empty">Не удалось загрузить данные. Запустите сайт через локальный сервер.</p>`;
    });

  window.addEventListener("hashchange", router);
})();
