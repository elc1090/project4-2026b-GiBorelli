async function initializeApp() {
  const googleError = consumeGoogleAuthRedirect();
  await checkSession();
  updateHeader();
  if (currentUser) {
    showHome();
  } else if (googleError) {
    showLogin('', googleError);
  } else {
    showWelcome();
  }
  await carregarQuestoes();
}

initializeGoogleSignIn();
initializeApp();
