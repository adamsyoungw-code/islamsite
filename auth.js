/*
 * Простая клиентская авторизация (прототип) на localStorage.
 *
 * ВНИМАНИЕ: это демо-уровень для статического сайта. Пароли хранятся
 * локально в браузере и НЕ защищены. Для реального входа через Google,
 * Apple и почту нужен бэкенд (или сервис вроде Firebase Auth / Supabase)
 * с настоящими OAuth client ID и проверкой на сервере.
 */
const Auth = (() => {
  const USERS_KEY = "iz_users";
  const SESSION_KEY = "iz_session";

  const read = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; }
    catch { return def; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function currentUser() {
    return read(SESSION_KEY, null);
  }

  function registerEmail(name, email, password) {
    email = (email || "").trim().toLowerCase();
    if (!email || !password) throw new Error("Введите почту и пароль.");
    if (password.length < 6) throw new Error("Пароль должен быть не короче 6 символов.");
    const users = read(USERS_KEY, {});
    if (users[email]) throw new Error("Пользователь с такой почтой уже существует.");
    users[email] = { name: name || email.split("@")[0], email, password, provider: "email" };
    write(USERS_KEY, users);
    return loginEmail(email, password);
  }

  function loginEmail(email, password) {
    email = (email || "").trim().toLowerCase();
    const users = read(USERS_KEY, {});
    const u = users[email];
    if (!u || u.password !== password) throw new Error("Неверная почта или пароль.");
    const session = { name: u.name, email: u.email, provider: "email" };
    write(SESSION_KEY, session);
    return session;
  }

  // Заглушка для OAuth-провайдеров. В реальной версии здесь будет
  // редирект на провайдера и обмен токенов на бэкенде.
  function loginProvider(provider) {
    const label = provider === "google" ? "Google" : "Apple";
    const email = prompt(`Демо-вход через ${label}. Укажите вашу почту:`);
    if (!email) return null;
    const session = { name: email.split("@")[0], email: email.trim().toLowerCase(), provider };
    write(SESSION_KEY, session);
    return session;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  return { currentUser, registerEmail, loginEmail, loginProvider, logout };
})();
