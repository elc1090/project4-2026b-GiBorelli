# Projeto final

![GIF demonstrando as novas funcionalidades da aplicação web](./GIF.gif)


## Acesso
https://conectablocos.vercel.app/

## Desenvolvedor(a) / Desenvolvedor(es/as)
**Giovana Borelli** - Ciência da Computação

## Proposta
Será continuado o desenvolvimento dos projetos anteriores, mas o desenvolvimento será individual. As novas funcionalidades a serem incluídas serão:
- Login federado;
- Resultados ao rodar as questões mostrados com SweetAlert;
- Criação de turmas (na qual a adição de alunos na turma será feita pelos professores).
Também buscarei realizar testes com usuários. 
Tecnologias: utilizarei as mesmas tecnologias já utilizadas. No back-end: Python (FastAPI); no banco de dados: PostGresSQL (Render); para o front-end: HTML, CSS, JavaScript e Blockly; e para o deploy: Vercel + Render.

## Desenvolvimento

### Processo



### Trechos de código
Gostaria de destacar esse primeiro trecho de código, porque .
```

```

O segundo trecho de código foi separado para destacar a integração com cadastro do Google. Demonstra-se a seção que verifica se o login do usuário está correto e, se sim, cria token para ele. Além disso, mostra-se o cabeçalho da seção para iniciar com o google, em que é necessário já enviar se o usuário será Professor ou Estudante.

```
@router.post("/auth/login", response_model=TokenResponse)
async def login_user(data: UsuarioLogin, db: Session = Depends(get_db)):
    user = db.scalar(
        select(Usuario).where(Usuario.email == data.email)
    )
    if (
        user is None
        or not user.has_password
        or not verify_password(data.senha, user.senha_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos.", headers={"WWW-Authenticate": "Bearer"})

    return create_user_token_response(user)


@router.get("/auth/google/start")
async def start_google_auth( tipo_usuario: Literal["professor", "estudante"] | None = None, ):

. . .

```

O terceiro e último trecho está relacionado com os alertas que foram modificados com SweetAlert.

```
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
  
. . .

  window.AppAlerts = { alert, confirm, requestPassword };
})();  
```

## Tecnologias

### Linguagens e afins
- Back-end: Python (com FastAPI)
- Banco de Dados: PostgreSQL
- Linguagens Front-end: HTML, CSS, JavaScript e Blockly
- Deploy: Vercel + Render


### Ambiente de desenvolvimento
- Python 3.11
- Banco de Dados PostgreSQL
- VS Code
- Git e Github
- Github Copilot Chat

## Referências e créditos
- Render Web Services: https://render.com/docs/web-services
- SweetAlert (usage e theme): https://sweetalert2.github.io/#usage
- Configuração da Conexão com OAuth do Google: https://developers.google.com/identity/protocols/oauth2/web-server?hl=pt-br


---
Projeto entregue para a disciplina de [Desenvolvimento de Software para a Web](http://github.com/andreainfufsm/elc1090-2026b) em 2026b