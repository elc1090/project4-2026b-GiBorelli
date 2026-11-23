function saveCurrentQuestionState() {
  if (!currentQuestionId || !workspace) return;

  questionStates[currentQuestionId] = Blockly.serialization.workspaces.save(workspace);
}

function loadQuestionState(questionId) {
  if (!workspace) return;

  const savedState = questionStates[questionId];
  workspace.clear();

  if (savedState) {
    Blockly.serialization.workspaces.load(savedState, workspace);
  }
}

function showHome() {
  document.body.classList.remove('auth-screen');
  if (!currentUser) {
    showWelcome();
    return;
  }
  hideViews();
  homeView.classList.remove('hidden');
  voltarHomeBtn.classList.add('hidden');
  updateHeader();
  scrollToPageStart();
}

function showWelcome() {
  document.body.classList.remove('auth-screen');
  hideViews();
  welcomeView.classList.remove('hidden');
  voltarHomeBtn.classList.add('hidden');
  scrollToPageStart();
}

function showAuthView(view) {
  document.body.classList.add('auth-screen');
  hideViews();
  view.classList.remove('hidden');
  voltarHomeBtn.classList.add('hidden');
  scrollToPageStart();
}

function showRegister() {
  cadastroStatus.textContent = '';
  formCadastro.reset();
  showAuthView(registerView);
}

function showLogin(email = '', message = '') {
  formLogin.reset();
  $('login-email').value = email;
  loginStatus.textContent = message;
  showAuthView(loginView);
}

function showStatistics() {
  document.body.classList.remove('auth-screen');
  if (!currentUser) {
    showWelcome();
    return;
  }
  if (currentUser.tipo_usuario !== 'estudante') return;

  const nome = currentUser.nome;
  saveCurrentQuestionState();
  hideViews();
  statisticsView.classList.remove('hidden');
  voltarHomeBtn.classList.remove('hidden');
  nomeEstatisticas.textContent = `Tentativas de ${nome}`;
  carregarEstatisticas(nome);
  scrollToPageStart();
}

async function carregarEstatisticas(nome) {
  listaEstatisticas.innerHTML = '<p>Carregando estatísticas...</p>';

  try {
    const resposta = await fetch(
      `${apiUrl}/tentativas?nome=${encodeURIComponent(nome)}`
    );

    if (!resposta.ok) throw new Error('Não foi possível consultar as tentativas.');

    const tentativas = await resposta.json();
    const questionById = Object.fromEntries(
      questions.map((question) => [question.id_questao, question])
    );

    if (tentativas.length === 0) {
      listaEstatisticas.innerHTML = '<p>Nenhuma questão tentada ainda.</p>';
      return;
    }

    listaEstatisticas.replaceChildren();
    tentativas
      .map((tentativa) => {
        const question = questionById[tentativa.id_questao];
        const item = document.createElement('div');
        item.className = 'estatistica-item';
        const title = document.createElement('span');
        title.textContent = question ? question.titulo : tentativa.id_questao;
        const count = document.createElement('strong');
        count.textContent = `${tentativa.n_tentativas} ${
          tentativa.n_tentativas === 1 ? 'tentativa' : 'tentativas'
        }`;
        item.append(title, count);
        return item;
      })
      .forEach((item) => listaEstatisticas.append(item));
  } catch (error) {
    listaEstatisticas.innerHTML = '<p>Não foi possível carregar as estatísticas.</p>';
    console.error('Erro ao consultar as estatísticas:', error);
  }
}

function showQuestion(questionId) {
  document.body.classList.remove('auth-screen');
  if (!currentUser || currentUser.tipo_usuario !== 'estudante') return;
  saveCurrentQuestionState();
  const question = questions.find((item) => item.id_questao === questionId);

  if (!question) return;

  currentQuestionId = question.id_questao;
  tituloQuestao.textContent = question.titulo;
  enunciadoQuestao.textContent = question.enunciado;

  hideViews();
  questionView.classList.remove('hidden');
  voltarHomeBtn.classList.remove('hidden');

  document.querySelectorAll('.questao-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.questionId === question.id_questao);
  });

  initWorkspace();
  loadQuestionState(questionId);

  setTimeout(() => {
    if (workspace) {
      Blockly.svgResize(workspace);
    }
  }, 0);
  scrollToPageStart();
}

listaQuestoes.addEventListener('click', (event) => {
  const card = event.target.closest('.questao-card');
  if (!card) return;

  showQuestion(card.dataset.questionId);
});

voltarHomeBtn.addEventListener('click', () => {
  saveCurrentQuestionState();
  showHome();
});

cadastroBtn.addEventListener('click', showRegister);
loginBtn.addEventListener('click', () => showLogin());
logoutBtn.addEventListener('click', logout);
inicioBtn.addEventListener('click', () => {
  if (currentUser) showHome();
  else showWelcome();
});
estatisticasBtn.addEventListener('click', showStatistics);
perfilAlunoBtn.addEventListener('click', editarPerfilAluno);
perfilProfessorBtn.addEventListener('click', editarPerfilProfessor);
formEditarPerfil.addEventListener('submit', salvarPerfil);
cancelarEditarPerfilBtn.addEventListener('click', () => {
  profileEditTarget = null;
  showHome();
});
excluirPerfilBtn.addEventListener('click', excluirPerfil);
questoesCadastradasDetails.addEventListener('toggle', () => {
  if (questoesCadastradasDetails.open) carregarQuestoes();
});
alunosCadastradosDetails.addEventListener('toggle', () => {
  if (alunosCadastradosDetails.open) carregarAlunos();
});
novaQuestaoBtn.addEventListener('click', () => {
  if (!isProfessor()) return;
  document.body.classList.remove('auth-screen');
  saveCurrentQuestionState();
  hideViews();
  createQuestionView.classList.remove('hidden');
  voltarHomeBtn.classList.remove('hidden');
  formNovaQuestao.reset();
  initAuthorWorkspace();
  authorWorkspace.clear();
  setTimeout(() => Blockly.svgResize(authorWorkspace), 0);
  scrollToPageStart();
});

cancelarNovaQuestaoBtn.addEventListener('click', showHome);
cancelarEditarQuestaoBtn.addEventListener('click', () => {
  currentEditingQuestionId = null;
  showHome();
});
excluirEditarQuestaoBtn.addEventListener('click', () => {
  if (currentEditingQuestionId) excluirQuestao(currentEditingQuestionId);
});

document.querySelectorAll('[data-auth-view="welcome"]').forEach((button) => {
  button.addEventListener('click', showWelcome);
});
formCadastro.addEventListener('submit', cadastrarUsuario);
formLogin.addEventListener('submit', entrarUsuario);
arquivoQuestoes.addEventListener('change', importarQuestoesJson);
formNovaQuestao.addEventListener('submit', salvarNovaQuestao);
formEditarQuestao.addEventListener('submit', salvarEdicaoQuestao);

executarBtn.addEventListener('click', enviaFastAPI);

