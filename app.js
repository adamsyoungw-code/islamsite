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

  function hasContent(l) {
    return !!l.url || (Array.isArray(l.episodes) && l.episodes.length > 0);
  }

  function matches(lesson) {
    if (activeLang !== "all" && lesson.lang !== activeLang) return false;
    if (!query) return true;
    const q = norm(query);
    return norm(lesson.title).includes(q) || norm(lesson.teacher).includes(q);
  }

  // ---- Модальная панель с отдельными уроками ----
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");

  function openModal(l) {
    const link = l.url ? linkInfo(l.url) : null;
    const playlistBtn = link
      ? `<a class="btn ${link.type}" href="${l.url}" target="_blank" rel="noopener">
           <span class="ic">${link.icon}</span>${link.label}</a>`
      : "";

    let episodesHtml = "";
    if (Array.isArray(l.episodes) && l.episodes.length) {
      const items = l.episodes.map((ep, i) => {
        const epLink = linkInfo(ep.url);
        const title = ep.title || `Урок ${i + 1}`;
        return ep.url
          ? `<a class="ep" href="${ep.url}" target="_blank" rel="noopener">
               <span class="ep-num">${i + 1}</span>
               <span class="ep-title">${title}</span>
               <span class="ep-ic ${epLink ? epLink.type : ""}">${epLink ? epLink.icon : "↗"}</span>
             </a>`
          : `<div class="ep ep-soon">
               <span class="ep-num">${i + 1}</span>
               <span class="ep-title">${title}</span>
               <span class="ep-ic">скоро</span>
             </div>`;
      }).join("");
      episodesHtml = `<div class="ep-list">${items}</div>`;
    }

    modalBody.innerHTML = `
      <div class="modal-head" dir="${l.lang === "ar" ? "rtl" : "ltr"}">
        <h3 class="${l.lang === "ar" ? "ar" : ""}">${l.title}</h3>
        ${l.teacher ? `<p class="modal-teacher">${l.teacher}</p>` : ""}
      </div>
      ${playlistBtn ? `<div class="modal-actions">${playlistBtn}</div>` : ""}
      ${episodesHtml || (playlistBtn ? "" : `<p class="empty">Ссылки на уроки скоро появятся.</p>`)}
    `;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

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

      const available = lessons.filter(hasContent).length;
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
        const epCount = Array.isArray(l.episodes) ? l.episodes.length : 0;
        let action;
        if (epCount > 0) {
          action = `<button class="btn open">📚 Уроки: ${epCount}</button>`;
        } else if (l.url) {
          const link = linkInfo(l.url);
          action = `<button class="btn open ${link.type}"><span class="ic">${link.icon}</span>${link.label}</button>`;
        } else {
          action = `<span class="badge soon">скоро</span>`;
        }
        card.innerHTML = `
          <div class="title">${l.title}</div>
          ${teacher}
          <div class="badges">
            <span class="badge ${l.lang}">${l.lang === "ar" ? "عربي" : "Рус"}</span>
            ${action}
          </div>`;
        if (hasContent(l)) {
          card.classList.add("clickable");
          card.addEventListener("click", () => openModal(l));
        }
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
      (n, c) => n + c.lessons.filter(hasContent).length, 0);
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
