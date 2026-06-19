(() => {
  let DATA = { categories: [] };
  let activeLang = "all";
  let query = "";

  const elContent = document.getElementById("content");
  const elNav = document.getElementById("catNav");
  const elStats = document.getElementById("stats");
  const elSearch = document.getElementById("search");

  const norm = (s) => (s || "").toLowerCase().replace(/[ـّ]/g, "").trim();

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

      const head = document.createElement("div");
      head.className = "cat-head";
      head.innerHTML = `
        <h2>${cat.titleAr}</h2>
        <span class="ru">${cat.titleRu}</span>
        <span class="count">${lessons.length}</span>`;
      section.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "grid";
      lessons.forEach((l) => {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.lang = l.lang;
        const teacher = l.teacher ? `<div class="teacher">${l.teacher}</div>` : "";
        card.innerHTML = `
          <div class="title">${l.title}</div>
          ${teacher}
          <div class="badges">
            <span class="badge ${l.lang}">${l.lang === "ar" ? "عربي" : "Рус"}</span>
            <span class="badge soon">скоро</span>
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
    elStats.textContent = `Показано ${totalShown} из ${total} уроков · ${DATA.categories.length} разделов`;
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

  fetch("data.json")
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
