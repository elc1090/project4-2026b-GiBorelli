const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Números e Texto',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_print' }
      ]
    },
    {
      kind: 'category',
      name: 'Variáveis',
      contents: [
        { kind: 'block', type: 'variables_set' },
        { kind: 'block', type: 'variables_get' }
      ]
    },
    {
      kind: 'category',
      name: 'Comparação',
      contents: [
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_boolean' }
      ]
    },
    {
      kind: 'category',
      name: 'Condicional',
      contents: [
        { kind: 'block', type: 'controls_if' }
      ]
    },
    {
      kind: 'category',
      name: 'Repetição',
      contents: [
        { kind: 'block', type: 'controls_for' }
      ]
    }
  ]
};

function initWorkspace() {
  if (workspace) return;

  workspace = Blockly.inject('blockly-edit', {
    toolbox,
    move: { scrollbars: true, drag: true, wheel: true }
  });
}

function initAuthorWorkspace() {
  if (authorWorkspace) return;

  authorWorkspace = Blockly.inject('blockly-author', {
    toolbox,
    move: { scrollbars: true, drag: true, wheel: true }
  });
}

function initEditWorkspace() {
  if (editWorkspace) return;

  editWorkspace = Blockly.inject('blockly-edit-author', {
    toolbox,
    move: { scrollbars: true, drag: true, wheel: true }
  });
}

let workspace = null;
let authorWorkspace = null;
let editWorkspace = null;
let currentQuestionId = null;
let currentEditingQuestionId = null;
const questionStates = {};

const $ = (id) => document.getElementById(id);
const cadastroBtn = $('cadastro-btn');
const loginBtn = $('login-btn');
const estatisticasBtn = $('estatisticas-btn');
const perfilAlunoBtn = $('perfil-aluno-btn');
const perfilProfessorBtn = $('perfil-professor-btn');
const logoutBtn = $('logout-btn');
const inicioBtn = $('inicio-btn');
const welcomeView = $('welcome-view');
const homeView = $('home-view');
const registerView = $('register-view');
const loginView = $('login-view');
const questionView = $('question-view');
const createQuestionView = $('create-question-view');
const editQuestionView = $('edit-question-view');
const editProfileView = $('edit-profile-view');
const statisticsView = $('statistics-view');
const managementPanel = $('management-panel');
const studentQuestionsSection = $('student-questions-section');
const perfilUsuario = $('perfil-usuario');
const tituloDashboard = $('titulo-dashboard');
const listaQuestoes = $('lista-questoes');
const listaQuestoesProfessor = $('lista-questoes-professor');
const listaAlunos = $('lista-alunos');
const questoesCadastradasDetails = $('questoes-cadastradas-details');
const alunosCadastradosDetails = $('alunos-cadastrados-details');
const listaEstatisticas = $('lista-estatisticas');
const nomeEstatisticas = $('nome-estatisticas');
const tituloQuestao = $('titulo-questao');
const enunciadoQuestao = $('enunciado-questao');
const voltarHomeBtn = $('voltar-home-btn');
const executarBtn = $('executar-btn');
const novaQuestaoBtn = $('nova-questao-btn');
const arquivoQuestoes = $('arquivo-questoes');
const importacaoStatus = $('importacao-status');
const formNovaQuestao = $('form-nova-questao');
const cancelarNovaQuestaoBtn = $('cancelar-nova-questao-btn');
const formEditarQuestao = $('form-editar-questao');
const cancelarEditarQuestaoBtn = $('cancelar-editar-questao-btn');
const excluirEditarQuestaoBtn = $('excluir-editar-questao-btn');
const formEditarPerfil = $('form-editar-perfil');
const cancelarEditarPerfilBtn = $('cancelar-editar-perfil-btn');
const excluirPerfilBtn = $('excluir-perfil-btn');
const formCadastro = $('form-cadastro');
const formLogin = $('form-login');
const cadastroStatus = $('cadastro-status');
const loginStatus = $('login-status');
const enviarCadastroBtn = $('enviar-cadastro-btn');
const enviarLoginBtn = $('enviar-login-btn');

const apiUrl = window.AppApi.baseUrl;
const { alert: showAlert, confirm: confirmAction, requestPassword } = window.AppAlerts;
let questions = [];
let currentUser = null;
let profileEditTarget = null;
const portugueseCollator = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true
});

function getToken() {
  return localStorage.getItem('token');
}

function isProfessor() {
  return Boolean(currentUser && currentUser.tipo_usuario === 'professor');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

function getAuthHeaders() {
  return window.AppApi.headers();
}

async function checkSession() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    return null;
  }
  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: getAuthHeaders()
    });
    if (response.ok) {
      currentUser = await response.json();
    } else {
      currentUser = null;
      setToken(null);
    }
  } catch (error) {
    console.error('Erro ao verificar sessão:', error);
    currentUser = null;
  }
  return currentUser;
}

function updateHeader() {
  const isLoggedIn = Boolean(currentUser);
  const isProfessor = isLoggedIn && currentUser.tipo_usuario === 'professor';
  cadastroBtn.classList.toggle('hidden', isLoggedIn);
  loginBtn.classList.toggle('hidden', isLoggedIn);
  estatisticasBtn.classList.toggle(
    'hidden',
    !isLoggedIn || currentUser.tipo_usuario !== 'estudante'
  );
  perfilAlunoBtn.classList.toggle(
    'hidden',
    !isLoggedIn || currentUser.tipo_usuario !== 'estudante'
  );
  perfilProfessorBtn.classList.toggle('hidden', !isProfessor);
  logoutBtn.classList.toggle('hidden', !isLoggedIn);
  managementPanel.classList.toggle('hidden', !isProfessor);
  studentQuestionsSection.classList.toggle('hidden', isProfessor);
  if (isLoggedIn) {
    perfilUsuario.textContent = `${currentUser.nome} · ${
      isProfessor ? 'Professor' : 'Aluno'
    }`;
    tituloDashboard.textContent = isProfessor
      ? 'Painel do professor'
      : 'Questões para responder';
  }
}

function hideViews() {
  [
    welcomeView,
    homeView,
    registerView,
    loginView,
    questionView,
    createQuestionView,
    editQuestionView,
    editProfileView,
    statisticsView
  ].forEach((view) => view.classList.add('hidden'));
}

function logout() {
  setToken(null);
  currentUser = null;
  updateHeader();
  showWelcome();
}

function normalizeQuestionId(title) {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '');
}

function scrollToPageStart() {
  window.scrollTo(0, 0);
}

function getApiErrorMessage(detail, fallback) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join('\n');
  }
  return fallback;
}

function getAuthApiErrorMessage(response, detail, fallback) {
  if (response.status === 404) {
    return `A API em ${apiUrl} não possui esta rota de autenticação. Atualize o deploy do backend ou confirme a URL da API.`;
  }
  return getApiErrorMessage(detail, fallback);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderQuestionList() {
  listaQuestoes.replaceChildren();
  if (questions.length === 0) {
    listaQuestoes.textContent = 'Nenhuma questão cadastrada.';
    return;
  }

  questions.forEach((question) => {
    const card = document.createElement('article');
    card.className = 'questao-card';
    card.dataset.questionId = question.id_questao;

    const heading = document.createElement('h3');
    heading.textContent = question.titulo;
    const statement = document.createElement('p');
    statement.textContent = question.enunciado;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Abrir questão';

    card.append(heading, statement, openButton);
    listaQuestoes.append(card);
  });
}

function createIconActionButton(label, imagePath, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-action-btn';
  button.setAttribute('aria-label', label);
  const image = document.createElement('img');
  image.src = imagePath;
  image.alt = '';
  button.append(image);
  button.addEventListener('click', onClick);
  return button;
}

function renderProfessorQuestionList() {
  listaQuestoesProfessor.replaceChildren();
  if (questions.length === 0) {
    listaQuestoesProfessor.textContent = 'Nenhuma questão cadastrada.';
    return;
  }

  questions.forEach((question) => {
    const item = document.createElement('article');
    item.className = 'management-question-item';
    item.dataset.questionId = question.id_questao;

    const heading = document.createElement('h3');
    heading.textContent = question.titulo;
    const statement = document.createElement('p');
    statement.textContent = question.enunciado;

    const actions = document.createElement('div');
    actions.className = 'question-management-actions';

    const editButton = createIconActionButton(
      `Editar ${question.titulo}`,
      'img/editar.png',
      () => abrirEdicaoQuestao(question.id_questao)
    );
    const deleteButton = createIconActionButton(
      `Excluir ${question.titulo}`,
      'img/excluir.png',
      () => excluirQuestao(question.id_questao)
    );
    actions.append(editButton, deleteButton);
    item.append(heading, statement, actions);
    listaQuestoesProfessor.append(item);
  });
}

async function carregarQuestoes() {
  listaQuestoes.textContent = 'Carregando questões...';
  listaQuestoesProfessor.textContent = 'Carregando questões...';
  try {
    const response = await fetch(`${apiUrl}/questoes`);
    if (!response.ok) throw new Error('Não foi possível carregar as questões.');
    questions = (await response.json()).sort((left, right) =>
      portugueseCollator.compare(left.titulo, right.titulo)
    );
    renderQuestionList();
    renderProfessorQuestionList();
  } catch (error) {
    listaQuestoes.textContent = 'Não foi possível carregar as questões.';
    listaQuestoesProfessor.textContent = 'Não foi possível carregar as questões.';
    console.error('Erro ao carregar as questões:', error);
  }
}

async function carregarAlunos() {
  if (!currentUser || currentUser.tipo_usuario !== 'professor') return;

  listaAlunos.textContent = 'Carregando alunos...';
  try {
    const result = (await window.AppApi.request('/usuarios/alunos')).sort((left, right) =>
      portugueseCollator.compare(left.nome, right.nome)
    );

    listaAlunos.replaceChildren();
    if (result.length === 0) {
      listaAlunos.textContent = 'Nenhum aluno cadastrado.';
      return;
    }

    result.forEach((student) => {
      const item = document.createElement('article');
      item.className = 'student-item';
      item.dataset.studentId = student.id_aluno;
      const name = document.createElement('strong');
      name.textContent = student.nome;
      const email = document.createElement('span');
      email.textContent = student.email;

      const actions = document.createElement('div');
      actions.className = 'question-management-actions';

      const editButton = createIconActionButton(
        `Editar ${student.nome}`,
        'img/editar.png',
        () => abrirEdicaoAluno(student.id_aluno)
      );
      const deleteButton = createIconActionButton(
        `Excluir ${student.nome}`,
        'img/excluir.png',
        () => excluirAluno(student.id_aluno, student.nome)
      );
      actions.append(editButton, deleteButton);
      item.append(name, email, actions);
      listaAlunos.append(item);
    });
  } catch (error) {
    listaAlunos.textContent = `Não foi possível carregar os alunos: ${error.message}`;
    console.error('Erro ao carregar alunos:', error);
  }
}

async function abrirEdicaoAluno(alunoId) {
  if (!isProfessor()) return;

  try {
    const student = await window.AppApi.request(
      `/usuarios/alunos/${encodeURIComponent(alunoId)}`
    );
    openProfileEditor(student, { kind: 'student', id: student.id_aluno });
  } catch (error) {
    showAlert({ icon: 'error', title: 'Não foi possível abrir o perfil', text: error.message });
    console.error('Erro ao carregar aluno para edição:', error);
  }
}

async function excluirAluno(alunoId, nome) {
  if (!isProfessor()) return;
  const confirmed = await confirmAction({
    title: 'Excluir aluno?',
    text: `A conta de ${nome} será excluída. Esta ação não pode ser desfeita.`,
    confirmButtonText: 'Excluir aluno',
    confirmButtonColor: '#b42318'
  });
  if (!confirmed) return;

  try {
    await window.AppApi.request(
      `/usuarios/alunos/${encodeURIComponent(alunoId)}`,
      { method: 'DELETE' }
    );
    if (profileEditTarget?.kind === 'student' && profileEditTarget.id === alunoId) {
      profileEditTarget = null;
      showHome();
    }
    await carregarAlunos();
    await showAlert({
      icon: 'success',
      title: 'Aluno excluído',
      text: 'A conta foi excluída com sucesso.'
    });
  } catch (error) {
    await showAlert({ icon: 'error', title: 'Não foi possível excluir o aluno', text: error.message });
  }
}

function openProfileEditor(user, target) {
  profileEditTarget = target;
  $('perfil-edicao-tipo').textContent = target.kind === 'self'
    ? 'Minha conta'
    : 'Perfil do aluno';
  $('perfil-edicao-titulo').textContent = target.kind === 'self'
    ? 'Editar meu perfil'
    : 'Editar perfil do aluno';
  $('perfil-edicao-nome').value = user.nome;
  $('perfil-edicao-email').value = user.email;
  $('perfil-edicao-senha').value = '';
  $('perfil-edicao-status').textContent = '';
  excluirPerfilBtn.textContent = target.kind === 'self'
    ? 'Excluir conta'
    : 'Excluir aluno';
  document.body.classList.remove('auth-screen');
  hideViews();
  editProfileView.classList.remove('hidden');
  voltarHomeBtn.classList.remove('hidden');
  scrollToPageStart();
}

function editarPerfilProfessor() {
  if (!isProfessor()) return;
  openProfileEditor(currentUser, { kind: 'self' });
}

function editarPerfilAluno() {
  if (!currentUser || currentUser.tipo_usuario !== 'estudante') return;
  openProfileEditor(currentUser, { kind: 'self' });
}

async function salvarPerfil(event) {
  event.preventDefault();
  if (!profileEditTarget) return;

  const payload = {
    nome: $('perfil-edicao-nome').value.trim(),
    email: $('perfil-edicao-email').value.trim(),
    senha: $('perfil-edicao-senha').value || null
  };
  const isSelf = profileEditTarget.kind === 'self';
  const path = isSelf
    ? '/auth/me'
    : `/usuarios/alunos/${encodeURIComponent(profileEditTarget.id)}`;

  try {
    const updatedUser = await window.AppApi.request(path, {
      method: 'PUT',
      body: payload
    });
    if (isSelf) currentUser = updatedUser;
    profileEditTarget = null;
    if (isSelf) updateHeader();
    else await carregarAlunos();
    showHome();
    await showAlert({
      icon: 'success',
      title: 'Perfil atualizado',
      text: 'As alterações foram salvas com sucesso.'
    });
  } catch (error) {
    $('perfil-edicao-status').textContent = error.message;
    console.error('Erro ao atualizar perfil:', error);
  }
}

async function excluirPerfil() {
  if (!profileEditTarget) return;
  const isSelf = profileEditTarget.kind === 'self';
  if (!isSelf) {
    await excluirAluno(profileEditTarget.id, $('perfil-edicao-nome').value);
    return;
  }

  const result = await requestPassword({
    title: 'Excluir sua conta?',
    text: 'Esta ação não pode ser desfeita. Confirme com sua senha atual.',
    confirmButtonText: 'Excluir conta'
  });
  if (!result.isConfirmed) return;

  try {
    await window.AppApi.request('/auth/me', {
      method: 'DELETE',
      body: { senha: result.value }
    });
    profileEditTarget = null;
    logout();
    await showAlert({
      icon: 'success',
      title: 'Conta excluída',
      text: 'Sua conta foi excluída.'
    });
  } catch (error) {
    await showAlert({ icon: 'error', title: 'Não foi possível excluir', text: error.message });
  }
}

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

async function importarQuestoesJson(event) {
  if (!currentUser || currentUser.tipo_usuario !== 'professor') return;
  const file = event.target.files[0];
  if (!file) return;

  importacaoStatus.textContent = 'Importando questões...';
  try {
    const payload = JSON.parse(await file.text());
    const response = await fetch(`${apiUrl}/questoes/importar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(result.detail, 'Não foi possível importar o arquivo.')
      );
    }
    importacaoStatus.textContent = `${result.quantidade} questão(ões) importada(s).`;
    await carregarQuestoes();
  } catch (error) {
    importacaoStatus.textContent = `Falha na importação: ${error.message}`;
    console.error('Erro ao importar questões:', error);
  } finally {
    arquivoQuestoes.value = '';
  }
}

async function abrirEdicaoQuestao(questionId) {
  if (!isProfessor()) return;

  try {
    const response = await fetch(
      `${apiUrl}/questoes/${encodeURIComponent(questionId)}`,
      { headers: getAuthHeaders() }
    );
    const question = await response.json();
    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(question.detail, 'Não foi possível carregar a questão.')
      );
    }

    currentEditingQuestionId = question.id_questao;
    $('editar-titulo-questao').value = question.titulo;
    $('editar-enunciado-questao').value = question.enunciado;
    const workspaceStatus = $('editar-workspace-status');
    workspaceStatus.textContent = question.blocos_esperados
      ? ''
      : 'Esta questão ainda não possui uma resposta em blocos salva. Monte a resposta esperada no Blockly.';

    document.body.classList.remove('auth-screen');
    hideViews();
    editQuestionView.classList.remove('hidden');
    voltarHomeBtn.classList.remove('hidden');
    initEditWorkspace();
    editWorkspace.clear();
    if (question.blocos_esperados) {
      Blockly.serialization.workspaces.load(question.blocos_esperados, editWorkspace);
    }
    setTimeout(() => Blockly.svgResize(editWorkspace), 0);
    scrollToPageStart();
  } catch (error) {
    showAlert({ icon: 'error', title: 'Não foi possível carregar a questão', text: error.message });
    console.error('Erro ao carregar questão para edição:', error);
  }
}

async function excluirQuestao(questionId) {
  if (!isProfessor()) return;
  const question = questions.find((item) => item.id_questao === questionId);
  const title = question ? question.titulo : questionId;
  const confirmed = await confirmAction({
    title: 'Excluir questão?',
    text: `Deseja excluir a questão "${title}"?`,
    confirmButtonText: 'Excluir',
    confirmButtonColor: '#b42318'
  });
  if (!confirmed) return;

  try {
    const response = await fetch(
      `${apiUrl}/questoes/${encodeURIComponent(questionId)}`,
      { method: 'DELETE', headers: getAuthHeaders() }
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(result.detail, 'Não foi possível excluir a questão.')
      );
    }

    if (currentEditingQuestionId === questionId) {
      currentEditingQuestionId = null;
      showHome();
    }
    await carregarQuestoes();
  } catch (error) {
    showAlert({ icon: 'error', title: 'Não foi possível excluir a questão', text: error.message });
    console.error('Erro ao excluir questão:', error);
  }
}

async function salvarEdicaoQuestao(event) {
  event.preventDefault();
  if (!editWorkspace || !currentEditingQuestionId || !isProfessor()) return;

  const titulo = $('editar-titulo-questao').value.trim();
  const idQuestao = currentEditingQuestionId;
  if (
    questions.some((question) =>
      question.id_questao !== idQuestao
      && normalizeQuestionId(question.titulo) === normalizeQuestionId(titulo)
    )
  ) {
    showAlert({ icon: 'warning', title: 'Título já utilizado', text: 'Escolha outro título para a questão.' });
    return;
  }

  const blocosEsperados = Blockly.serialization.workspaces.save(editWorkspace);
  if (!blocosEsperados.blocks?.blocks?.length) {
    showAlert({ icon: 'warning', title: 'Resposta esperada vazia', text: 'Monte a resposta esperada no Blockly antes de salvar.' });
    return;
  }

  const payload = {
    titulo,
    enunciado: $('editar-enunciado-questao').value.trim(),
    codigo_esperado: Blockly.Python.workspaceToCode(editWorkspace),
    blocos_esperados: blocosEsperados
  };

  try {
    const response = await fetch(
      `${apiUrl}/questoes/${encodeURIComponent(idQuestao)}`,
      {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      }
    );
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        showAlert({ icon: 'warning', title: 'Título já utilizado', text: 'Escolha outro título para a questão.' });
        return;
      }
      throw new Error(
        getApiErrorMessage(result.detail, 'Não foi possível salvar as alterações.')
      );
    }

    currentEditingQuestionId = null;
    await carregarQuestoes();
    showHome();
  } catch (error) {
    showAlert({ icon: 'error', title: 'Não foi possível salvar as alterações', text: error.message });
    console.error('Erro ao editar a questão:', error);
  }
}

async function salvarNovaQuestao(event) {
  event.preventDefault();
  if (!authorWorkspace || !currentUser || currentUser.tipo_usuario !== 'professor') return;

  const titulo = $('novo-titulo-questao').value.trim();
  const idQuestao = normalizeQuestionId(titulo);
  if (!idQuestao) {
    showAlert({ icon: 'warning', title: 'Título inválido', text: 'Informe um título que gere um identificador válido.' });
    return;
  }
  if (questions.some((question) => normalizeQuestionId(question.titulo) === idQuestao)) {
    showAlert({ icon: 'warning', title: 'Título já utilizado', text: 'Escolha outro título para a questão.' });
    return;
  }

  const blocosEsperados = Blockly.serialization.workspaces.save(authorWorkspace);
  if (!blocosEsperados.blocks?.blocks?.length) {
    showAlert({ icon: 'warning', title: 'Resposta esperada vazia', text: 'Monte a resposta esperada no Blockly antes de salvar.' });
    return;
  }

  const payload = {
    id_questao: idQuestao,
    titulo,
    enunciado: $('novo-enunciado-questao').value.trim(),
    tipo_questao: 'aberta',
    codigo_esperado: Blockly.Python.workspaceToCode(authorWorkspace),
    blocos_esperados: blocosEsperados
  };

  try {
    const response = await fetch(`${apiUrl}/questoes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        showAlert({ icon: 'warning', title: 'Título já utilizado', text: 'Escolha outro título para a questão.' });
        return;
      }
      throw new Error(
        getApiErrorMessage(result.detail, 'Não foi possível salvar a questão.')
      );
    }
    formNovaQuestao.reset();
    authorWorkspace.clear();
    await carregarQuestoes();
    showHome();
    importacaoStatus.textContent = `Questão ${result.id_questao} adicionada.`;
  } catch (error) {
    showAlert({ icon: 'error', title: 'Não foi possível salvar a questão', text: error.message });
    console.error('Erro ao salvar a questão:', error);
  }
}

async function enviaFastAPI() {
  if (
    !workspace ||
    !currentQuestionId ||
    !currentUser ||
    currentUser.tipo_usuario !== 'estudante'
  ) return;

  const nome = currentUser.nome;
  const code = Blockly.Python.workspaceToCode(workspace);
  const workspaceJson = Blockly.serialization.workspaces.save(workspace);

  try {
    const resposta = await fetch(`${apiUrl}/run-blocks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        nome,
        id_questao: currentQuestionId,
        n_tentativas: 1,
        code,
        workspace_json: workspaceJson
      })
    });

    const resultado = await resposta.json();
    if (!resposta.ok) {
      throw new Error(
        getApiErrorMessage(resultado.detail, 'Não foi possível enviar a resposta.')
      );
    }
    const showExpectedOutput = resultado.correta && resultado.expected_has_output;
    const showStudentOutput = !resultado.correta && resultado.has_output;
    const outputLines = showExpectedOutput
      ? resultado.expected_output_lines : resultado.output_lines;
    const outputError = showExpectedOutput
      ? resultado.expected_output_error : resultado.output_error;
    const outputTitle = showExpectedOutput
      ? 'Saída correta da questão' : 'Saída do seu programa';
    const outputContent = showExpectedOutput || showStudentOutput
      ? `<h3>${outputTitle}</h3><pre>${escapeHtml((outputLines || []).join('\n'))}</pre>`
      : outputError
        ? `<p>${escapeHtml(outputError)}</p>`
        : '';
    showAlert({
      icon: resultado.correta ? 'success' : 'info',
      title: resultado.correta ? 'Resposta correta' : 'Resposta registrada',
      html: `<p>${escapeHtml(resultado.message)}</p>${outputContent}`
    });
  } catch (e) {
    console.error('Erro ao enviar os dados ao FastAPI:', e);
    showAlert({ icon: 'error', title: 'Não foi possível enviar a resposta', text: e.message });
  }
}

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
    setToken(result.access_token);
    currentUser = result.usuario;
    updateHeader();
    formLogin.reset();
    showHome();
    await carregarQuestoes();
  } catch (error) {
    loginStatus.textContent = error.message;
    console.error('Erro ao fazer login:', error);
  } finally {
    enviarLoginBtn.disabled = false;
  }
}

async function initializeApp() {
  await checkSession();
  updateHeader();
  if (currentUser) showHome();
  else showWelcome();
  await carregarQuestoes();
}

initializeApp();