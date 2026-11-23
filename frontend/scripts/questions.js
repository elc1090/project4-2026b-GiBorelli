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

