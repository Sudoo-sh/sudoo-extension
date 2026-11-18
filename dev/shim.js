// Development only (never packaged): stands in for the chrome.* APIs so the popup and the settings page can be
// opened as ordinary pages from the mock panel (npm run preview), for checking the design and taking screenshots.
// Query: ?lang=ar&tab=https://acme-retail-main.demo.sudoo.sh/odoo&empty=1
(() => {
  const params = new URLSearchParams(location.search);
  const memory = (seed) => {
    const data = { ...seed };
    return {
      async get(keys) {
        if (keys === null || keys === undefined) return { ...data };
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      async set(items) {
        Object.assign(data, structuredClone(items));
      },
      async remove(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      },
    };
  };
  const panels = params.has("empty")
    ? []
    : [{ id: "mock", label: "Acme server", origin: location.origin, addedAt: Date.now() }];
  const noop = { addListener() {} };
  window.chrome = {
    storage: {
      local: memory({ panels, settings: { locale: params.get("lang") ?? "en" } }),
      session: memory({
        secrets: { mock: { token: "sudoo_mock_0123456789abcdef", secret: "mock-signing-secret-for-local-tests" } },
      }),
    },
    permissions: { contains: async () => true, request: async () => true, remove: async () => true },
    tabs: { query: async () => [{ url: params.get("tab") ?? "https://github.com/" }], create: async () => ({}) },
    i18n: { getUILanguage: () => params.get("lang") ?? "en" },
    runtime: { id: "dev", sendMessage: async () => ({ ok: true }), openOptionsPage: async () => {}, getURL: (p) => p, onMessage: noop },
  };
})();
