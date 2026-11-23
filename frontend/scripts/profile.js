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

  let senha = null;
  if (currentUser.has_password) {
    const result = await requestPassword({
      title: 'Excluir sua conta?',
      text: 'Esta ação não pode ser desfeita. Confirme com sua senha atual.',
      confirmButtonText: 'Excluir conta'
    });
    if (!result.isConfirmed) return;
    senha = result.value;
  } else {
    const confirmed = await confirmAction({
      title: 'Excluir sua conta?',
      text: 'Esta ação não pode ser desfeita. Confirme para excluir sua conta Google.',
      confirmButtonText: 'Excluir conta'
    });
    if (!confirmed) return;
  }

  try {
    await window.AppApi.request('/auth/me', {
      method: 'DELETE',
      body: { senha }
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

