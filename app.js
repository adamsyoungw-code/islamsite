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
    list: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
  };

  /* ---------- Постоянный плеер (живёт вне #app, не прерывается при навигации) ---------- */
  const Player = {
    el: document.getElementById("player"),
    audio: document.getElementById("playerAudio"),
    titleEl: document.getElementById("playerTitle"),
    key: "",
    init() {
      document.getElementById("playerClose").onclick = () => this.close();
      this.audio.addEventListener("play", () => this.el.classList.remove("paused"));
      this.audio.addEventListener("pause", () => this.el.classList.add("paused"));
      this.audio.addEventListener("ended", () => this.el.classList.add("paused"));
    },
    play(key, src, title) {
      if (this.key !== key) {           // новый трек — грузим
        this.key = key;
        this.audio.src = src;
        this.titleEl.textContent = title;
      }
      this.el.hidden = false;
      document.body.classList.add("has-player");
      this.audio.play().catch(() => {});
      refreshNowPlaying();
    },
    close() {
      this.audio.pause();
      this.el.hidden = true;
      this.key = "";
      document.body.classList.remove("has-player");
      refreshNowPlaying();
    },
    isCurrent(key) { return this.key === key && !this.audio.paused; },
  };
  Player.init();

  // Подсветка «сейчас играет» на странице урока, если плеер крутит этот урок
  function refreshNowPlaying() {
    document.querySelectorAll("[data-play-key]").forEach((btn) => {
      const np = btn.parentElement.querySelector(".now-playing");
      if (np) np.style.display = Player.isCurrent(btn.dataset.playKey) ? "inline-flex" : "none";
    });
  }

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
    // сводная статистика по всем данным
    let cycles = 0, lessons = 0, audioN = 0, testQ = 0;
    DATA.sections.forEach((s) => (s.cycles || []).forEach((c) => {
      cycles++;
      (c.lessons || []).forEach((l) => {
        lessons++;
        if (l.audio) audioN++;
        if (l.tests) testQ += l.tests.length;
      });
      if (c.finalTest && c.finalTest.questions) testQ += c.finalTest.questions.length;
    }));

    // «Продолжить обучение» — последний открытый урок
    let contBtn = "";
    try {
      const last = JSON.parse(localStorage.getItem("lastLesson") || "null");
      if (last) {
        const s = find(DATA.sections, last.sid);
        const c = s && find(s.cycles, last.cid);
        const l = c && find(c.lessons, last.lid);
        if (l) contBtn = `<a class="btn" href="#/section/${esc(last.sid)}/cycle/${esc(last.cid)}/lesson/${esc(last.lid)}">Продолжить: ${esc(l.title)}</a>`;
      }
    } catch (e) { /* повреждённый localStorage — игнорируем */ }

    const firstSection = DATA.sections[0];
    const startBtn = firstSection
      ? `<a class="btn btn-hero-ghost" href="#/section/${esc(firstSection.id)}">${contBtn ? "К разделам" : "Начать обучение"}</a>`
      : "";

    const cards = DATA.sections.map((s) => {
      const nc = s.cycles ? s.cycles.length : 0;
      const nl = (s.cycles || []).reduce((n, c) => n + (c.lessons ? c.lessons.length : 0), 0);
      return `
      <a class="card" href="#/section/${esc(s.id)}">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.description || "")}</p>
        <span class="meta">Циклов: ${nc}${nl ? ` · уроков: ${nl}` : ""}</span>
      </a>`;
    }).join("");

    app.innerHTML = `
      <section class="hero">
        <svg class="hero-ornament" width="360" height="360" viewBox="0 0 100 100" aria-hidden="true">
          <g fill="none" stroke="#d9c7a3" stroke-opacity="0.25" stroke-width="0.6">
            <rect x="25" y="25" width="50" height="50"/>
            <rect x="25" y="25" width="50" height="50" transform="rotate(45 50 50)"/>
            <circle cx="50" cy="50" r="16"/>
            <circle cx="50" cy="50" r="34"/>
          </g>
        </svg>
        <div class="container hero-inner">
          <span class="hero-kicker">طلب العلم فريضة</span>
          <h1>Исламские науки — шаг за шагом, от урока к уроку</h1>
          <p class="lead">Циклы уроков с аудио, конспектами и тестами для самопроверки. Учитесь в удобном темпе — прогресс всегда под рукой.</p>
          <div class="hero-actions">${contBtn}${startBtn}<a class="btn btn-hero-ghost" href="#/library">Библиотека</a></div>
          <div class="hero-stats">
            <div class="stat"><b>${DATA.sections.length}</b><span>${plural(DATA.sections.length, "раздел", "раздела", "разделов")}</span></div>
            <div class="stat"><b>${lessons}</b><span>${plural(lessons, "урок", "урока", "уроков")}</span></div>
            <div class="stat"><b>${audioN}</b><span>аудио</span></div>
            <div class="stat"><b>${testQ}</b><span>вопросов в тестах</span></div>
          </div>
        </div>
      </section>
      <div class="container page home-sections">
        <div class="section-heading">
          <h2>Разделы</h2>
          <span class="hint">выберите науку, чтобы начать</span>
        </div>
        <div class="card-list">${cards}</div>
      </div>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
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
    const n = (c.lessons || []).length;
    const finalCard = (c.finalTest && c.finalTest.questions && c.finalTest.questions.length)
      ? `<a class="card card-final" href="#/section/${esc(s.id)}/cycle/${esc(c.id)}/test">
           <h3>${n + 1}. Итоговый тест</h3>
           <p>${c.finalTest.questions.length} вопросов · ${c.finalTest.timeLimitMin} минут</p>
         </a>`
      : "";
    app.innerHTML =
      crumbs([
        { label: "Разделы", href: "#/" },
        { label: s.title, href: `#/section/${s.id}` },
        { label: c.title },
      ]) +
      page(head(c.title, c.level || "") + `<div class="card-list">${cards}${finalCard}</div>`);
  }

  function finalTestPage(sid, cid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    const ft = c && c.finalTest;
    if (!s || !c || !ft || !ft.questions || !ft.questions.length) return notFound();

    app.innerHTML =
      crumbs([
        { label: "Разделы", href: "#/" },
        { label: s.title, href: `#/section/${s.id}` },
        { label: c.title, href: `#/section/${s.id}/cycle/${c.id}` },
        { label: "Итоговый тест" },
      ]) +
      page(
        head("Итоговый тест", `${ft.questions.length} вопросов · на выполнение ${ft.timeLimitMin} минут`) +
        `<div class="final-timer" id="finalTimer"></div>
         <div id="quiz">${renderQuiz(ft.questions)}</div>`
      );

    bindQuiz(ft.questions);
    startTimer(ft.timeLimitMin * 60);
  }

  // Таймер итогового теста: по истечении времени автоматически проверяет ответы.
  function startTimer(totalSec) {
    const el = document.getElementById("finalTimer");
    if (!el) return;
    let left = totalSec;
    const tick = () => {
      const m = String(Math.floor(left / 60)).padStart(2, "0");
      const sec = String(left % 60).padStart(2, "0");
      el.textContent = `Осталось времени: ${m}:${sec}`;
      el.classList.toggle("urgent", left <= 60);
      if (left <= 0) {
        clearInterval(timerId);
        el.textContent = "Время вышло";
        const btn = document.getElementById("checkQuiz");
        if (btn) btn.click();
        return;
      }
      left--;
    };
    tick();
    const timerId = setInterval(tick, 1000);
    // остановить таймер при уходе со страницы
    window.addEventListener("hashchange", () => clearInterval(timerId), { once: true });
  }

  function lessonPage(sid, cid, lid) {
    const s = find(DATA.sections, sid);
    const c = s && find(s.cycles, cid);
    const l = c && find(c.lessons, lid);
    if (!s || !c || !l) return notFound();

    // запоминаем последний открытый урок для кнопки «Продолжить» на главной
    try {
      localStorage.setItem("lastLesson", JSON.stringify({ sid: s.id, cid: c.id, lid: l.id }));
    } catch (e) { /* приватный режим — не критично */ }

    const audio = l.audio
      ? `<button class="btn btn-primary play-lesson" data-play-key="${esc(l.id)}"
             data-src="${esc(l.audio)}" data-title="${esc(l.title)}">
           <span class="pic">${icon.audio}</span> Слушать урок
         </button>
         <div class="now-playing" style="display:none">${icon.audio} Идёт воспроизведение — плеер внизу продолжит играть при переходах</div>`
      : emptyState("Аудио будет добавлено позже.");

    const text = l.text
      ? `<div class="lesson-text">${esc(l.text)}</div>`
      : emptyState("Текст к уроку будет добавлен позже.");

    // Тест к уроку — встроенный тест с моментальной проверкой.
    const testBlock = (l.tests && l.tests.length)
      ? `<div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.quiz}</span>Тест к уроку</div>
           <div id="quiz">${renderQuiz(l.tests)}</div>
         </div>`
      : "";

    // Вопросы к уроку — открытые, без вариантов ответа.
    const questionsBlock = (l.questions && l.questions.length)
      ? `<div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.list}</span>Вопросы к уроку</div>
           <ol class="lesson-questions">${l.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
         </div>`
      : "";

    app.innerHTML =
      crumbs([
        { label: "Разделы", href: "#/" },
        { label: s.title, href: `#/section/${s.id}` },
        { label: c.title, href: `#/section/${s.id}/cycle/${c.id}` },
        { label: l.title },
      ]) +
      page(
        head(l.title) +
        `<div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.audio}</span>Аудио урока</div>${audio}
         </div>
         <div class="lesson-block">
           <div class="block-head"><span class="ic">${icon.text}</span>Текст к уроку</div>${text}
         </div>
         ${testBlock}
         ${questionsBlock}`
      );

    if (l.tests && l.tests.length) bindQuiz(l.tests);

    const playBtn = app.querySelector(".play-lesson");
    if (playBtn) {
      playBtn.onclick = () =>
        Player.play(playBtn.dataset.playKey, playBtn.dataset.src, playBtn.dataset.title);
    }
    refreshNowPlaying();
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
    const btn = document.getElementById("checkQuiz");
    if (!btn) return;
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
  function setActiveNav() {
    const h = location.hash || "#/";
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const target = a.getAttribute("href");
      const active = target === "#/" ? (h === "#/" || h === "" || h === "#") : h.startsWith(target);
      a.classList.toggle("active", active);
    });
  }

  function router() {
    const parts = (location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    window.scrollTo(0, 0);
    closeNav();
    setActiveNav();
    if (parts.length === 0) return homePage();
    if (parts[0] === "library") return libraryPage();
    if (parts[0] === "login") return loginPage();
    if (parts[0] === "register") return registerPage();
    if (parts[0] === "section") {
      if (parts.length === 2) return sectionPage(parts[1]);
      if (parts[2] === "cycle" && parts.length === 4) return cyclePage(parts[1], parts[3]);
      if (parts[2] === "cycle" && parts[4] === "test" && parts.length === 5)
        return finalTestPage(parts[1], parts[3]);
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

  /* ---------- Theme ---------- */
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.onclick = () => {
      const next = document.documentElement.dataset.theme === "dark" ? "" : "dark";
      if (next) document.documentElement.dataset.theme = next;
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem("theme", next); } catch (e) { /* ок */ }
    };
  }

  /* ---------- Init ---------- */
  fetch("data.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => { DATA = d; renderAuthBox(); router(); })
    .catch(() => {
      app.innerHTML = page(emptyState("Не удалось загрузить данные. Запустите сайт через локальный сервер."));
    });

  window.addEventListener("hashchange", router);
})();
