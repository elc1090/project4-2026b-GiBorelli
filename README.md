# Projeto final

![Substitua a imagem ao lado por um GIF/WEBP animado mostrando seu projeto](./moho_follow_through2.gif "GIF animado do projeto. Imagem temporária de Moho Animation https://moho.lostmarble.com/products/moho-pro-special-halls-head-college")


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

<Indique se é uma continuação de projeto anterior ou uma nova aplicação, explicando o contraste/avanço em relação aos projetos anteriores>

## Desenvolvimento

### Processo



### Trechos de código
Gostaria de destacar esse primeiro trecho de código, porque .
```
 
```

O segundo trecho de código foi separado para destacar . Demonstra-se .

```

```

O terceiro e último trecho está relacionado com .

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
- 


---
Projeto entregue para a disciplina de [Desenvolvimento de Software para a Web](http://github.com/andreainfufsm/elc1090-2026b) em 2026b