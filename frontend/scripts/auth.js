async function cadastrarUsuario(event) {
  event.preventDefault();
  enviarCadastroBtn.disabled = true;
  cadastroStatus.textContent = 'Cadastrando...';
  const formData = new FormData(formCadastro);
  const payload = {
    nome: formData.get('nome').trim(),
    email: formData.get('email').trim(),
    senha: formData.get('senha'),
    tipo_usuario: formData.get('tipo_usuario')
  };

  try {
    const response = await fetch(`${apiUrl}/auth/cadastrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        getAuthApiErrorMessage(
          response,
          result.detail,
          'Não foi possível concluir o cadastro.'
        )
      );
    }
    showLogin(payload.email, 'Cadastro realizado. Entre com seu e-mail e senha.');
  } catch (error) {
    cadastroStatus.textContent = error.message;
    console.error('Erro ao cadastrar usuário:', error);
  } finally {
    enviarCadastroBtn.disabled = false;
  }
}

async function entrarUsuario(event) {
  event.preventDefault();
  enviarLoginBtn.disabled = true;
  loginStatus.textContent = 'Verificando acesso...';
  const payload = {
    email: $('login-email').value.trim(),
    senha: $('login-senha').value
  };

  try {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        getAuthApiErrorMessage(
          response,
          result.detail,
          'Não foi possível entrar.'
        )
      );
    }
    await startUserSession(result);
    formLogin.reset();
  } catch (error) {
    loginStatus.textContent = error.message;
    console.error('Erro ao fazer login:', error);
  } finally {
    enviarLoginBtn.disabled = false;
  }
}

async function startUserSession(result) {
  setToken(result.access_token);
  currentUser = result.usuario;
  updateHeader();
  showHome();
  await carregarQuestoes();
}

function initializeGoogleSignIn() {
  const createGoogleButton = (container, isRegistration) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'google-oauth-btn';
    button.textContent = isRegistration ? 'Cadastrar com Google' : 'Entrar com Google';
    button.addEventListener('click', async () => {
      const params = new URLSearchParams();
      if (isRegistration) {
        const selectedType = new FormData(formCadastro).get('tipo_usuario');
        if (selectedType !== 'professor' && selectedType !== 'estudante') return;
        const typeLabel = selectedType === 'professor' ? 'Professor' : 'Aluno';
        const confirmed = await confirmTypeAccount({
          title: 'Confirmar tipo de conta',
          text: `O tipo selecionado para seu cadastro é ${typeLabel}. Deseja continuar?`,
          confirmButtonText: 'Continuar com Google',
          cancelButtonText: 'Alterar tipo'
        });
        if (!confirmed) return;
        params.set(
          'tipo_usuario',
          selectedType
        );
      }
      const query = params.toString();
      window.location.assign(
        `${apiUrl}/auth/google/start${query ? `?${query}` : ''}`
      );
    });
    container.replaceChildren(button);
  };

  createGoogleButton(googleCadastroBtn, true);
  createGoogleButton(googleLoginBtn, false);
}

function consumeGoogleAuthRedirect() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('google_access_token');
  const error = params.get('google_error');
  if (!token && !error) return null;

  window.history.replaceState(
    null,
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
  if (token) setToken(token);

  const messages = {
    cancelled: 'O acesso com Google foi cancelado.',
    state: 'A solicitação Google expirou ou não pôde ser validada. Tente novamente.',
    exchange: 'Não foi possível trocar o código com o Google. Tente novamente.',
    credential: 'O Google não retornou uma credencial válida. Tente novamente.',
    register: 'Esta conta ainda não está cadastrada. Escolha Cadastro e selecione Aluno ou Professor.',
    account: 'Não foi possível vincular esta conta Google. Entre em contato com o suporte.'
  };
  return error ? (messages[error] || 'Não foi possível entrar com o Google.') : null;
}

