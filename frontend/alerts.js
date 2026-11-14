(function () {
  function alert(options) {
    const config = {
      theme: 'auto',
      confirmButtonText: 'Entendi',
      ...options
    };
    if (!window.Swal) {
      window.alert(config.text || config.title || 'Ocorreu um erro.');
      return Promise.resolve({ isConfirmed: true });
    }
    return window.Swal.fire(config);
  }

  function confirm(options) {
    if (!window.Swal) {
      return Promise.resolve(window.confirm(options.text || options.title));
    }
    return window.Swal.fire({
      theme: 'auto',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      ...options
    }).then((result) => result.isConfirmed);
  }

  function requestPassword(options) {
    if (!window.Swal) {
      const password = window.prompt(options.text || options.title);
      return Promise.resolve(password ? { isConfirmed: true, value: password } : { isConfirmed: false });
    }
    return window.Swal.fire({
      theme: 'auto',
      icon: 'warning',
      input: 'password',
      inputPlaceholder: 'Senha atual',
      inputAttributes: { autocomplete: 'current-password' },
      inputValidator: (value) => value ? undefined : 'Informe sua senha atual.',
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText || 'Excluir conta',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      ...options
    });
  }

  window.AppAlerts = { alert, confirm, requestPassword };
})();
