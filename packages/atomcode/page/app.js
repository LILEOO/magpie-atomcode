(() => {
  const meta = document.querySelector('meta[name="atomcode-token"]');
  const token = meta?.content || "";
  const locale = document.documentElement.lang.startsWith("zh") ? "zh" : "en";
  const text = {
    en: {
      loading: "Loading local snapshot…",
      ready: "Snapshot loaded. This page is read-only.",
      failed: "The diagnostics service could not load the snapshot.",
      refresh: "Refresh",
      selfCheck: "Run offline self-check",
      account: "Account",
      models: "Models",
      quota: "Quota snapshot",
      version: "Version source",
      quotaReadout: "QUOTA WINDOWS",
      snapshot: "Persisted snapshot",
      stale: "STALE",
      noQuota: "No successful quota snapshot has been recorded yet.",
      selfCheckTitle: "SELF-CHECK",
      signature: "Offline signature",
      notRun: "Not run in this session.",
      errorTitle: "LAST ERROR",
      redacted: "Redacted",
      noError: "No error has been recorded.",
      privacy: "Read-only. No request is sent to AtomGit from this page. Tokens, emails, prompts and raw responses are never included.",
      copy: "Copy redacted report",
      copied: "Redacted report copied.",
      anonymous: "No account snapshot",
      never: "never",
      modelsCount: "{count} models",
      captured: "captured {time}",
      checked: "checked {time}",
      checkOk: "Signature and configuration checks passed.",
      checkFailed: "Self-check failed: {detail}",
      window: "{used}% used",
      resetSeconds: "resets in {value}",
    },
    zh: {
      loading: "正在读取本机快照…",
      ready: "快照已加载。此页面只读。",
      failed: "诊断服务无法读取快照。",
      refresh: "刷新",
      selfCheck: "运行离线自检",
      account: "账号",
      models: "模型目录",
      quota: "额度快照",
      version: "版本来源",
      quotaReadout: "额度窗口",
      snapshot: "已持久化快照",
      stale: "历史快照",
      noQuota: "尚未记录成功的额度快照。",
      selfCheckTitle: "离线自检",
      signature: "签名与配置",
      notRun: "本次会话尚未运行。",
      errorTitle: "最近错误",
      redacted: "已脱敏",
      noError: "尚未记录错误。",
      privacy: "只读页面。不会从这里请求 AtomGit。页面不包含令牌、邮箱、提示词或原始响应。",
      copy: "复制脱敏报告",
      copied: "脱敏报告已复制。",
      anonymous: "暂无账号快照",
      never: "从未",
      modelsCount: "{count} 个模型",
      captured: "记录于 {time}",
      checked: "检查于 {time}",
      checkOk: "签名与配置检查通过。",
      checkFailed: "自检失败：{detail}",
      window: "已用 {used}%",
      resetSeconds: "{value} 后重置",
    },
  }[locale];

  const element = (id) => document.getElementById(id);
  const fill = (value, values) =>
    String(value).replace(/\{(\w+)\}/g, (all, key) =>
      Object.hasOwn(values, key) ? String(values[key]) : all,
    );
  const time = (value) => {
    if (!value) return text.never;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };
  const setText = (id, value) => {
    const node = element(id);
    if (node) node.textContent = value ?? "";
  };
  const setStatus = (message, tone = "") => {
    const node = element("status");
    node.textContent = message;
    if (tone) node.dataset.tone = tone;
    else delete node.dataset.tone;
  };

  for (const node of document.querySelectorAll("[data-i18n]")) {
    const value = text[node.dataset.i18n];
    if (value) node.textContent = value;
  }
  document.documentElement.lang = locale;
  document.title = locale === "zh" ? "AtomCode 诊断" : "AtomCode diagnostics";

  const query = new URLSearchParams(location.search);
  const theme = query.get("theme");
  if (theme === "dark" || theme === "light") document.body.dataset.theme = theme;
  try {
    const raw = query.get("tokens");
    const tokens = raw ? JSON.parse(decodeURIComponent(escape(atob(raw)))) : {};
    for (const [key, value] of Object.entries(tokens)) {
      if (/^--[\w-]+$/.test(key) && typeof value === "string" && value.length < 300) {
        document.documentElement.style.setProperty(key, value);
      }
    }
  } catch {}

  let snapshot;
  async function api(path, init = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { "x-atomcode-token": token, ...(init.headers || {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  function renderWindows(windows) {
    const list = element("windows");
    list.replaceChildren();
    for (const window of windows || []) {
      const item = document.createElement("li");
      item.className = "window";
      const name = document.createElement("strong");
      name.textContent = window.name;
      const bar = document.createElement("div");
      bar.className = "bar";
      const fillBar = document.createElement("span");
      const used = Number(window.used);
      fillBar.style.width = Number.isFinite(used)
        ? Math.max(0, Math.min(100, used)) + "%"
        : "0%";
      bar.append(fillBar);
      const value = document.createElement("span");
      value.className = "window-value";
      const pieces = [];
      if (window.display) pieces.push(window.display);
      else if (Number.isFinite(used)) pieces.push(fill(text.window, { used: used.toFixed(1) }));
      if (Number.isFinite(Number(window.resetSecs))) {
        pieces.push(fill(text.resetSeconds, { value: Math.round(Number(window.resetSecs)) + "s" }));
      } else if (window.resetsAt) {
        pieces.push(time(window.resetsAt));
      }
      value.textContent = pieces.join(" · ");
      item.append(name, bar, value);
      list.append(item);
    }
    element("quota-empty").hidden = Boolean(windows?.length);
  }

  function render(data) {
    snapshot = data;
    const account = data.account;
    setText("account", account?.digest ? account.digest : text.anonymous);
    setText("login-source", account?.loginSource || text.never);
    setText("model-source", data.models?.source || "built-in");
    setText(
      "model-detail",
      [
        fill(text.modelsCount, { count: data.models?.count || 0 }),
        data.models?.updatedAt ? fill(text.captured, { time: time(data.models.updatedAt) }) : "",
      ].filter(Boolean).join(" · "),
    );
    setText("quota-plan", data.quota?.plan || "—");
    setText(
      "quota-detail",
      data.quota?.capturedAt
        ? fill(text.captured, { time: time(data.quota.capturedAt) })
        : text.noQuota,
    );
    setText("stale-badge", text.stale);
    element("stale-badge").hidden = !data.quota;
    renderWindows(data.quota?.windows || []);
    setText("version", data.version?.version || "5.2.3");
    setText(
      "version-detail",
      [
        data.version?.source || "fallback",
        data.version?.checkedAt
          ? fill(text.checked, { time: time(data.version.checkedAt) })
          : "",
      ].filter(Boolean).join(" · "),
    );
    const error = data.lastError;
    const errorNode = element("last-error");
    errorNode.textContent = error
      ? [error.category, error.status ? "HTTP " + error.status : "", error.message, time(error.at)]
          .filter(Boolean).join("\n")
      : text.noError;
    errorNode.classList.toggle("bad", Boolean(error));
    const check = data.selfCheck;
    const checkNode = element("self-check-result");
    checkNode.textContent = check
      ? (check.ok ? text.checkOk : text.checkFailed.replace("{detail}", "signature")) +
        "\n" + time(check.at) + " · " + check.ms + " ms"
      : text.notRun;
    checkNode.classList.toggle("good", check?.ok === true);
    checkNode.classList.toggle("bad", check?.ok === false);
    setStatus(text.ready, "ok");
  }

  async function refresh() {
    const button = element("refresh");
    button.disabled = true;
    setStatus(text.loading);
    try {
      render(await api("/api/state"));
    } catch {
      setStatus(text.failed, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function selfCheck() {
    const button = element("self-check");
    button.disabled = true;
    setStatus(text.loading);
    try {
      const result = await api("/api/self-check", { method: "POST" });
      const node = element("self-check-result");
      node.textContent =
        (result.ok ? text.checkOk : text.checkFailed.replace("{detail}", "signature")) +
        "\n" + time(result.at) + " · " + result.ms + " ms";
      node.classList.toggle("good", result.ok === true);
      node.classList.toggle("bad", result.ok !== true);
      await refresh();
    } catch {
      setStatus(text.failed, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function copy() {
    if (!snapshot) return;
    const report = JSON.stringify({ ...snapshot, copiedAt: new Date().toISOString() }, null, 2);
    try {
      await navigator.clipboard.writeText(report);
      setStatus(text.copied, "ok");
    } catch {
      setStatus(text.failed, "error");
    }
  }

  element("refresh").addEventListener("click", refresh);
  element("self-check").addEventListener("click", selfCheck);
  element("copy").addEventListener("click", copy);
  refresh();
})();
