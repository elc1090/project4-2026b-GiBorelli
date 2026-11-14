(function () {
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocal =
    localHosts.has(window.location.hostname) || window.location.protocol === 'file:';
  const baseUrl = isLocal
    ? 'http://127.0.0.1:8000'
    : 'https://conectablocos-giborelli.onrender.com';

  function headers(authenticated = true) {
    const result = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (authenticated && token) {
      result.Authorization = `Bearer ${token}`;
    }
    return result;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: headers(options.authenticated !== false),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = result.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join('\n')
          : 'Não foi possível concluir a solicitação.';
      throw new Error(message);
    }
    return result;
  }

  window.AppApi = { baseUrl, headers, request };
})();
