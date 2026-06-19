(() => {
  let DATA = { categories: [] };
  let activeLang = "all";
  let query = "";

  const elContent = document.getElementById("content");
  const elNav = document.getElementById("catNav");
  const elStats = document.getElementById("stats");
  const elSearch = document.getElementById("search");

  const norm = (s) => (s || "").toLowerCase().replace(/[ـّ]/g, "").trim();

  function linkInfo(url) {
    if (!url) return null;
    if (/youtube\.com|youtu\.be/i.test(url)) {
      const playlist = /[?&]list=/.test(url) && !/[?&]v=/.test(url);
      return { type: "youtube", label: playlist ? "Плейлист на YouTube" : "Смотреть на YouTube", icon: "▶" };
    }
    if (/t\.me|telegram/i.test(url)) {
      return { type: "telegram", label: "Открыть в Telegram", icon: "✈" };
    }
    return { type: "other", label: "Открыть урок", icon: "↗" };
  }

  function matches(lesson) {
    if (activeLang !== "all" && lesson.lang !== activeLang) return false;
    if (!query) return true;
    const q = norm(query);
    return norm(lesson.title).includes(q) || norm(lesson.teacher).includes(q);
  }

  function render() {
    elContent.innerHTML = "";
    let totalShown = 0;

    DATA.categories.forEach((cat) => {
      const lessons = cat.lessons.filter(matches);
      if (lessons.length === 0) return;
      totalShown += lessons.length;

      const section = document.createElement("section");
      section.className = "category";
      section.id = cat.id;

      const available = lessons.filter((l) => l.url).length;
      const countLabel = available
        ? `${available} / ${lessons.length}`
        : `${lessons.length}`;
      const head = document.createElement("div");
      head.className = "cat-head";
      head.innerHTML = `
        <h2>${cat.titleAr}</h2>
        <span class="ru">${cat.titleRu}</span>
        <span class="count" title="Доступно ссылок / всего уроков">${countLabel}</span>`;
      section.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "grid";
      lessons.forEach((l) => {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.lang = l.lang;
        const teacher = l.teacher ? `<div class="teacher">${l.teacher}</div>` : "";
        const link = linkInfo(l.url);
        const action = link
          ? `<a class="btn ${link.type}" href="${l.url}" target="_blank" rel="noopener">
               <span class="ic">${link.icon}</span>${link.label}</a>`
          : `<span class="badge soon">скоро</span>`;
        card.innerHTML = `
          <div class="title">${l.title}</div>
          ${teacher}
          <div class="badges">
            <span class="badge ${l.lang}">${l.lang === "ar" ? "عربي" : "Рус"}</span>
            ${action}
          </div>`;
        grid.appendChild(card);
      });
      section.appendChild(grid);
      elContent.appendChild(section);
    });

    if (totalShown === 0) {
      elContent.innerHTML = `<p class="empty">Ничего не найдено по запросу «${query}».</p>`;
    }

    const total = DATA.categories.reduce((n, c) => n + c.lessons.length, 0);
    const withLinks = DATA.categories.reduce(
      (n, c) => n + c.lessons.filter((l) => l.url).length, 0);
    elStats.textContent =
      `Показано ${totalShown} из ${total} уроков · ${DATA.categories.length} разделов · со ссылками: ${withLinks}`;
  }

  function buildNav() {
    elNav.innerHTML = "";
    DATA.categories.forEach((cat) => {
      const a = document.createElement("a");
      a.href = `#${cat.id}`;
      a.textContent = cat.titleAr;
      a.title = cat.titleRu;
      elNav.appendChild(a);
    });
  }

  elSearch.addEventListener("input", (e) => {
    query = e.target.value;
    render();
  });

  document.querySelectorAll(".lang-filter button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lang-filter button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeLang = btn.dataset.lang;
      render();
    });
  });

  fetch("data.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      buildNav();
      render();
    })
    .catch((err) => {
      elContent.innerHTML = `<p class="empty">Не удалось загрузить данные: ${err.message}</p>`;
    });
})();
