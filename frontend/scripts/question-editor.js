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
      ? question.tipo_questao === 'aberta'
        ? 'Os tipos de blocos presentes são obrigatórios; outros blocos e valores são aceitos.'
        : 'A saída produzida por este programa será a resposta esperada.'
      : 'Esta questão ainda não possui uma configuração de resposta salva.';

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
    tipo_questao: $('novo-tipo-questao').value,
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
    const evaluatedLines = resultado.has_output
      ? resultado.output_lines
      : resultado.result_lines;
    const outputContent = resultado.has_result
      ? `<h3>${resultado.has_output ? 'Saída do seu programa' : 'Resultado avaliado'}</h3><pre>${escapeHtml((evaluatedLines || []).join('\n'))}</pre>`
      : resultado.output_error
        ? `<p>${escapeHtml(resultado.output_error)}</p>`
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

