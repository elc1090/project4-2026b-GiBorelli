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
const googleCadastroBtn = $('google-cadastro-btn');
const googleLoginBtn = $('google-login-btn');

const apiUrl = window.AppApi.baseUrl;
const { alert: showAlert, confirm: confirmAction, requestPassword, confirmTypeAccount } = window.AppAlerts;
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
  estatisticasBtn.classList.toggle('hidden', !isLoggedIn || currentUser.tipo_usuario !== 'estudante');
  perfilAlunoBtn.classList.toggle('hidden', !isLoggedIn || currentUser.tipo_usuario !== 'estudante');
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
