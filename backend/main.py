import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
import unicodedata
from typing import Any

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import SessionLocal, get_db, init_db
from models import Questao, Tentativa, Usuario
from schemas import GoogleAuthRequest, QuestaoCreate, QuestaoImport, QuestaoUpdate, SenhaConfirmacao, TentativaCreate, UsuarioCreate, UsuarioLogin, UsuarioResponse, UsuarioUpdate, TokenResponse
from security import create_access_token, decode_access_token, generate_hash, verify_password

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_questions()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security_scheme = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme), db: Session = Depends(get_db)) -> Usuario:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.", headers={"WWW-Authenticate": "Bearer"})
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.", headers={"WWW-Authenticate": "Bearer"})

    user = db.scalar(select(Usuario).where(Usuario.id == int(user_id)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado.", headers={"WWW-Authenticate": "Bearer"})
    return user


async def require_professor(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.tipo_usuario != "professor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: apenas professores podem realizar esta operação.",
        )
    return current_user


def verify_google_credential(credential: str) -> dict[str, Any]:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O login Google ainda não foi configurado no servidor.",
        )
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A credencial do Google é inválida ou expirou.",
        ) from error
    except GoogleAuthError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível verificar a credencial com o Google.",
        ) from error

    if claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Confirme seu e-mail na conta Google antes de continuar.",
        )
    if not all(
        isinstance(claims.get(key), str) and claims[key].strip()
        for key in ("sub", "email", "name")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A conta Google não forneceu nome, e-mail ou identificador válidos.",
        )
    return dict(claims)


def create_user_token_response(user: Usuario) -> dict[str, Any]:
    access_token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "nome": user.nome,
        "tipo_usuario": user.tipo_usuario,
    })
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": user,
    }


def normalize_code(code: str) -> str:
    return "\n".join(line.strip() for line in code.strip().splitlines() if line.strip())


def normalize_question_id(title: str) -> str:
    without_accents = "".join(character
        for character in unicodedata.normalize("NFD", title)
        if not unicodedata.combining(character)
    )
    return "".join(without_accents.lower().split())


def normalize_workspace(value: Any) -> Any:
    variable_names = {}
    if isinstance(value, dict):
        variable_names = {
            variable["id"]: variable["name"]
            for variable in value.get("variables", [])
            if isinstance(variable, dict)
            and isinstance(variable.get("id"), str)
            and isinstance(variable.get("name"), str)
        }

    def normalize(item: Any, item_key: str | None = None) -> Any:
        if isinstance(item, dict):
            normalized = {}
            for item_name, item_value in sorted(item.items()):
                if item_name == "id" and isinstance(item_value, str):
                    variable_name = variable_names.get(item_value)
                    if variable_name is not None:
                        normalized["variable"] = variable_name
                    continue
                if item_name in {"id", "x", "y"}:
                    continue
                normalized[item_name] = normalize(item_value, item_name)
            return normalized
        if isinstance(item, list):
            items = [normalize(child) for child in item]
            if item_key == "variables":
                return sorted(items, key=lambda child: json.dumps(child, sort_keys=True))
            return items
        return item

    return normalize(value)


class OutputEvaluationError(ValueError):
    pass


def evaluate_workspace_output(workspace_json: dict[str, Any] | None) -> dict[str, Any]:
    if not workspace_json:
        raise OutputEvaluationError("O espaço de blocos não está disponível.")

    block_state = workspace_json.get("blocks", {})
    top_blocks = block_state.get("blocks", [])
    if not isinstance(top_blocks, list):
        raise OutputEvaluationError("O espaço de blocos tem formato inválido.")

    variables = {
        variable["id"]: variable["name"]
        for variable in workspace_json.get("variables", [])
        if isinstance(variable, dict)
        and isinstance(variable.get("id"), str)
        and isinstance(variable.get("name"), str)
    }
    values: dict[str, Any] = {}
    output_lines: list[str] = []
    executed_steps = 0
    step_limit = 50_000
    loop_limit = 10_000
    has_print = False

    def field(block: dict[str, Any], name: str, default: Any = None) -> Any:
        return block.get("fields", {}).get(name, default)

    def input_block(block: dict[str, Any], name: str) -> dict[str, Any] | None:
        connection = block.get("inputs", {}).get(name)
        if not isinstance(connection, dict):
            return None
        child = connection.get("block") or connection.get("shadow")
        return child if isinstance(child, dict) else None

    def variable_name(block: dict[str, Any]) -> str:
        reference = field(block, "VAR")
        variable_id = reference.get("id") if isinstance(reference, dict) else reference
        name = variables.get(variable_id)
        if name is None:
            raise OutputEvaluationError("Um bloco usa uma variável não definida.")
        return name

    def evaluate_value(block: dict[str, Any] | None, depth: int = 0) -> Any:
        if block is None:
            return None
        if depth > 100:
            raise OutputEvaluationError("A estrutura dos blocos é profunda demais.")

        block_type = block.get("type")
        if block_type == "math_number":
            value = float(field(block, "NUM", 0))
            return int(value) if value.is_integer() else value
        if block_type == "text":
            return str(field(block, "TEXT", ""))
        if block_type == "logic_boolean":
            return field(block, "BOOL") == "TRUE"
        if block_type == "variables_get":
            return values.get(variable_name(block))
        if block_type == "math_arithmetic":
            left = evaluate_value(input_block(block, "A"), depth + 1)
            right = evaluate_value(input_block(block, "B"), depth + 1)
            operation = field(block, "OP")
            operations = {
                "ADD": lambda: left + right,
                "MINUS": lambda: left - right,
                "MULTIPLY": lambda: left * right,
                "DIVIDE": lambda: left / right,
                "POWER": lambda: left ** right,
            }
            if operation not in operations:
                raise OutputEvaluationError("Operação matemática não suportada.")
            return operations[operation]()
        if block_type == "logic_compare":
            left = evaluate_value(input_block(block, "A"), depth + 1)
            right = evaluate_value(input_block(block, "B"), depth + 1)
            operation = field(block, "OP")
            operations = {
                "EQ": lambda: left == right,
                "NEQ": lambda: left != right,
                "LT": lambda: left < right,
                "LTE": lambda: left <= right,
                "GT": lambda: left > right,
                "GTE": lambda: left >= right,
            }
            if operation not in operations:
                raise OutputEvaluationError("Operação de comparação não suportada.")
            return operations[operation]()
        if block_type == "logic_operation":
            left = bool(evaluate_value(input_block(block, "A"), depth + 1))
            right = bool(evaluate_value(input_block(block, "B"), depth + 1))
            operation = field(block, "OP")
            if operation == "AND":
                return left and right
            if operation == "OR":
                return left or right
            raise OutputEvaluationError("Operação lógica não suportada.")
        raise OutputEvaluationError("A saída usa um bloco que não pode ser interpretado.")

    def python_string(value: Any) -> str:
        if value is True:
            return "Verdadeiro"
        if value is False:
            return "Falso"
        if value is None:
            return "None"
        return str(value)

    def execute_chain(block: dict[str, Any] | None, depth: int = 0) -> None:
        nonlocal executed_steps, has_print
        if depth > 100:
            raise OutputEvaluationError("A estrutura dos blocos é profunda demais.")
        current = block
        while current:
            executed_steps += 1
            if executed_steps > step_limit:
                raise OutputEvaluationError("A execução excedeu o limite de blocos.")
            if current.get("disabled"):
                current = current.get("next", {}).get("block")
                continue

            block_type = current.get("type")
            if block_type == "variables_set":
                values[variable_name(current)] = evaluate_value(input_block(current, "VALUE"))
            elif block_type == "text_print":
                has_print = True
                output_lines.append(
                    python_string(evaluate_value(input_block(current, "TEXT")))
                )
            elif block_type == "controls_if":
                branch = 0
                matched = False
                while f"IF{branch}" in current.get("inputs", {}):
                    if evaluate_value(input_block(current, f"IF{branch}")):
                        execute_chain(input_block(current, f"DO{branch}"), depth + 1)
                        matched = True
                        break
                    branch += 1
                if not matched and "ELSE" in current.get("inputs", {}):
                    execute_chain(input_block(current, "ELSE"), depth + 1)
            elif block_type == "controls_for":
                name = variable_name(current)
                start = evaluate_value(input_block(current, "FROM"))
                stop = evaluate_value(input_block(current, "TO"))
                step = evaluate_value(input_block(current, "BY"))
                if not all(isinstance(value, (int, float)) for value in (start, stop, step)):
                    raise OutputEvaluationError("O laço precisa de limites numéricos.")
                if step == 0:
                    raise OutputEvaluationError("O passo do laço não pode ser zero.")
                current_value = start
                iterations = 0
                condition = (
                    (lambda: current_value <= stop)
                    if step > 0
                    else (lambda: current_value >= stop)
                )
                while condition():
                    iterations += 1
                    if iterations > loop_limit:
                        raise OutputEvaluationError("O laço excedeu o limite de iterações.")
                    values[name] = current_value
                    execute_chain(input_block(current, "DO"), depth + 1)
                    current_value += step
            else:
                raise OutputEvaluationError("A execução contém um bloco não suportado.")
            current = current.get("next", {}).get("block")

    try:
        for top_block in top_blocks:
            if top_block.get("type") in {
                "math_number",
                "math_arithmetic",
                "text",
                "logic_compare",
                "logic_operation",
                "logic_boolean",
                "variables_get",
            }:
                evaluate_value(top_block)
            else:
                execute_chain(top_block)
    except OutputEvaluationError:
        raise
    except (ArithmeticError, TypeError, ValueError, OverflowError) as error:
        raise OutputEvaluationError(
            "Não foi possível calcular a saída: verifique os valores e operações dos blocos."
        ) from error

    return {"lines": output_lines, "has_output": has_print}


def public_question(question: Questao) -> dict[str, Any]:
    return {
        "id_questao": question.id_questao,
        "titulo": question.titulo,
        "enunciado": question.enunciado,
        "tipo_questao": question.tipo_questao,
    }


def save_question(data: QuestaoCreate, db: Session) -> Questao:
    question = db.scalar(
        select(Questao).where(Questao.id_questao == data.id_questao.strip())
    )
    if question is None:
        question = Questao(id_questao=data.id_questao.strip())
        db.add(question)

    question.titulo = data.titulo.strip()
    question.enunciado = data.enunciado.strip()
    question.tipo_questao = data.tipo_questao
    question.codigo_esperado = data.codigo_esperado
    question.blocos_esperados = data.blocos_esperados
    return question


def seed_questions() -> None:
    seed_path = Path(__file__).with_name("questoes.json")
    if not seed_path.exists():
        return

    seed = QuestaoImport.model_validate_json(seed_path.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        for question_data in seed.questoes:
            existing = db.scalar(
                select(Questao).where(
                    Questao.id_questao == question_data.id_questao
                )
            )
            if existing is None:
                save_question(question_data, db)
            else:
                if not existing.titulo:
                    existing.titulo = question_data.titulo
                if not existing.enunciado:
                    existing.enunciado = question_data.enunciado
                if not existing.codigo_esperado:
                    existing.codigo_esperado = question_data.codigo_esperado
                if not existing.blocos_esperados:
                    existing.blocos_esperados = question_data.blocos_esperados
                    existing.codigo_esperado = question_data.codigo_esperado
        db.commit()


@app.post("/run-blocks")
async def run_blockly_logic(data: TentativaCreate, db: Session = Depends(get_db)):
    try:
        nome = data.nome.strip()
        tentativa = db.scalar(
            select(Tentativa).where(
                Tentativa.nome == nome,
                Tentativa.id_questao == data.id_questao,
            )
        )

        if tentativa:
            tentativa.n_tentativas += 1
            tentativa.code = data.code
            tentativa.workspace_json = data.workspace_json
        else:
            tentativa = Tentativa(
                nome=nome,
                id_questao=data.id_questao,
                n_tentativas=1,
                code=data.code,
                workspace_json=data.workspace_json,
            )
            db.add(tentativa)

        db.commit()
        db.refresh(tentativa)

        question = db.scalar(
            select(Questao).where(Questao.id_questao == data.id_questao)
        )
        if question and question.tipo_questao == "aberta":
            correta = bool(
                data.workspace_json
                and question.blocos_esperados
                and normalize_workspace(data.workspace_json)
                == normalize_workspace(question.blocos_esperados)
            )
        else:
            correta = bool(
                question
                and question.codigo_esperado
                and normalize_code(data.code)
                == normalize_code(question.codigo_esperado)
            )

        output_result = None
        output_error = None
        if data.workspace_json:
            try:
                output_result = evaluate_workspace_output(data.workspace_json)
            except OutputEvaluationError as error:
                output_error = str(error)

        expected_output_result = None
        expected_output_error = None
        if question and question.blocos_esperados:
            try:
                expected_output_result = evaluate_workspace_output(
                    question.blocos_esperados
                )
            except OutputEvaluationError as error:
                expected_output_error = str(error)

        if question is None:
            mensagem = "Tentativa salva, mas esta questão não está cadastrada."
        elif correta:
            mensagem = "Resposta correta."
        else:
            mensagem = "Resposta diferente do esperado."

        return {
            "status": "success",
            "message": mensagem,
            "correta": correta,
            "questao_cadastrada": question is not None,
            "nome": tentativa.nome,
            "id_questao": tentativa.id_questao,
            "n_tentativas": tentativa.n_tentativas,
            "received_code": data.code,
            "tentativa_id": tentativa.id,
            "output_lines": output_result["lines"] if output_result else None,
            "has_output": output_result["has_output"] if output_result else False,
            "output_error": output_error,
            "expected_output_lines": (
                expected_output_result["lines"] if expected_output_result else None
            ),
            "expected_has_output": (
                expected_output_result["has_output"]
                if expected_output_result
                else False
            ),
            "expected_output_error": expected_output_error,
        }
    except Exception:
        db.rollback()
        raise


@app.get("/tentativas")
async def list_attempts(
    nome: str | None = None,
    id_questao: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(Tentativa).order_by(Tentativa.id_questao)
    if nome:
        query = query.where(Tentativa.nome == nome)
    if id_questao:
        query = query.where(Tentativa.id_questao == id_questao)

    tentativas = db.scalars(query).all()
    return [
        {
            "id": tentativa.id,
            "nome": tentativa.nome,
            "id_questao": tentativa.id_questao,
            "n_tentativas": tentativa.n_tentativas,
            "code": tentativa.code,
            "workspace_json": tentativa.workspace_json,
            "criado_em": tentativa.criado_em,
        }
        for tentativa in tentativas
    ]


@app.get("/questoes")
async def list_questions(db: Session = Depends(get_db)):
    questions = db.scalars(select(Questao).order_by(Questao.id)).all()
    return [public_question(question) for question in questions]


@app.post("/questoes")
async def create_question(data: QuestaoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(require_professor)):
    question_id = normalize_question_id(data.titulo)
    if not question_id or data.id_questao != question_id:
        raise HTTPException(
            status_code=422,
            detail="O identificador da questão deve ser gerado a partir do título.",
        )

    existing = db.scalar(
        select(Questao).where(Questao.id_questao == question_id)
    )
    if existing is not None or any(
        normalize_question_id(question.titulo) == question_id
        for question in db.scalars(select(Questao)).all()
    ):
        raise HTTPException(
            status_code=409,
            detail="Esse título não pode ser usado, ele já existe. Insira outro título e tente novamente.",
        )
    if data.tipo_questao == "fechada" and not data.blocos_esperados:
        raise HTTPException(
            status_code=422,
            detail="Questões fechadas precisam de blocos_esperados para reconstruir a resposta.",
        )

    question = save_question(data, db)
    db.commit()
    db.refresh(question)
    return {"status": "success", "id_questao": question.id_questao}


@app.post("/questoes/importar")
async def import_questions(
    data: QuestaoImport,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_professor),
):
    ids = [question.id_questao.strip() for question in data.questoes]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="O arquivo contém ids_questao duplicados.")
    if any(
        question.tipo_questao == "fechada" and not question.blocos_esperados
        for question in data.questoes
    ):
        raise HTTPException(
            status_code=422,
            detail="Questões fechadas precisam de blocos_esperados para reconstruir a resposta.",
        )

    questions = [save_question(question, db) for question in data.questoes]
    db.commit()
    return {
        "status": "success",
        "quantidade": len(questions),
        "ids_questao": [question.id_questao for question in questions],
    }


@app.get("/questoes/{id_questao}")
async def get_question(
    id_questao: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    question = db.scalar(
        select(Questao).where(Questao.id_questao == id_questao)
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")
    return {
        **public_question(question),
        "codigo_esperado": question.codigo_esperado,
        "blocos_esperados": question.blocos_esperados,
    }


@app.put("/questoes/{id_questao}")
async def update_question(
    id_questao: str,
    data: QuestaoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    question = db.scalar(
        select(Questao).where(Questao.id_questao == id_questao)
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")

    if any(
        other.id_questao != id_questao
        and normalize_question_id(other.titulo) == normalize_question_id(data.titulo)
        for other in db.scalars(select(Questao)).all()
    ):
        raise HTTPException(
            status_code=409,
            detail="Esse título não pode ser usado, ele já existe. Insira outro título e tente novamente.",
        )
    if not data.blocos_esperados:
        raise HTTPException(
            status_code=422,
            detail="Monte a resposta esperada no Blockly antes de salvar.",
        )
    if question.tipo_questao == "fechada" and not data.codigo_esperado:
        raise HTTPException(
            status_code=422,
            detail="Questões fechadas precisam de codigo_esperado.",
        )

    question.titulo = data.titulo
    question.enunciado = data.enunciado
    question.codigo_esperado = data.codigo_esperado
    question.blocos_esperados = data.blocos_esperados
    db.commit()
    return {"status": "success", "id_questao": question.id_questao}


@app.delete("/questoes/{id_questao}")
async def delete_question(
    id_questao: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    question = db.scalar(
        select(Questao).where(Questao.id_questao == id_questao)
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")
    db.execute(
        delete(Tentativa).where(Tentativa.id_questao == id_questao)
    )
    db.delete(question)
    db.commit()
    return {"status": "success", "id_questao": id_questao}


@app.post("/auth/cadastrar", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def register_user(data: UsuarioCreate, db: Session = Depends(get_db)):
    existing_user = db.scalar(
        select(Usuario).where(Usuario.email == data.email)
    )
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esse e-mail já está em uso. Tente fazer login ou use outro e-mail.")

    hashed_password = generate_hash(data.senha)
    new_user = Usuario(nome=data.nome, email=data.email, senha_hash=hashed_password, tipo_usuario=data.tipo_usuario)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/auth/login", response_model=TokenResponse)
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


@app.post("/auth/google", response_model=TokenResponse)
async def authenticate_google(
    data: GoogleAuthRequest,
    db: Session = Depends(get_db),
):
    claims = verify_google_credential(data.credential)
    google_sub = claims["sub"]
    email = claims["email"].strip().lower()
    user = db.scalar(select(Usuario).where(Usuario.google_sub == google_sub))

    if user is None:
        user = db.scalar(
            select(Usuario).where(func.lower(Usuario.email) == email)
        )
        if user is not None and user.google_sub not in (None, google_sub):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este e-mail já está vinculado a outra conta Google.",
            )
        if user is None:
            if data.tipo_usuario is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conta não encontrada. Selecione Cadastro e escolha Aluno ou Professor.",
                )
            user = Usuario(
                nome=claims["name"].strip(),
                email=email,
                senha_hash=generate_hash(secrets.token_urlsafe(32)),
                has_password=False,
                google_sub=google_sub,
                tipo_usuario=data.tipo_usuario,
            )
            db.add(user)
        else:
            user.google_sub = google_sub

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível vincular esta conta Google. Tente entrar novamente.",
        ) from error

    return create_user_token_response(user)


@app.get("/auth/me", response_model=UsuarioResponse)
async def get_my_profile(current_user: Usuario = Depends(get_current_user)):
    return current_user


@app.put("/auth/me", response_model=UsuarioResponse)
async def update_my_profile(
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    email_owner = db.scalar(
        select(Usuario).where(
            Usuario.email == data.email,
            Usuario.id != current_user.id,
        )
    )
    if email_owner is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esse e-mail já está em uso. Use outro e-mail.",
        )

    current_user.nome = data.nome
    current_user.email = data.email
    if data.senha:
        current_user.senha_hash = generate_hash(data.senha)
        current_user.has_password = True
    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/auth/me")
async def delete_my_profile(
    data: SenhaConfirmacao,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.has_password and (
        data.senha is None
        or not verify_password(data.senha, current_user.senha_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A senha atual está incorreta.",
        )
    if not current_user.has_password and not current_user.google_sub:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não foi possível confirmar a autenticação desta conta.",
        )
    db.delete(current_user)
    db.commit()
    return {"status": "success"}


@app.get("/usuarios/alunos")
async def list_students(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    students = db.scalars(
        select(Usuario)
        .where(Usuario.tipo_usuario == "estudante")
        .order_by(Usuario.nome, Usuario.email)
    ).all()
    return [
        {"id_aluno": student.id, "nome": student.nome, "email": student.email}
        for student in students
    ]


@app.get("/usuarios/alunos/{id_aluno}")
async def get_student(
    id_aluno: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    student = db.scalar(
        select(Usuario).where(
            Usuario.id == id_aluno,
            Usuario.tipo_usuario == "estudante",
        )
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")
    return {"id_aluno": student.id, "nome": student.nome, "email": student.email}


@app.put("/usuarios/alunos/{id_aluno}", response_model=UsuarioResponse)
async def update_student(
    id_aluno: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    student = db.scalar(
        select(Usuario).where(
            Usuario.id == id_aluno,
            Usuario.tipo_usuario == "estudante",
        )
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")

    email_owner = db.scalar(
        select(Usuario).where(
            Usuario.email == data.email,
            Usuario.id != student.id,
        )
    )
    if email_owner is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esse e-mail já está em uso. Use outro e-mail.",
        )

    student.nome = data.nome
    student.email = data.email
    if data.senha:
        student.senha_hash = generate_hash(data.senha)
        student.has_password = True
    db.commit()
    db.refresh(student)
    return student


@app.delete("/usuarios/alunos/{id_aluno}")
async def delete_student(
    id_aluno: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_professor),
):
    student = db.scalar(
        select(Usuario).where(
            Usuario.id == id_aluno,
            Usuario.tipo_usuario == "estudante",
        )
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")
    db.delete(student)
    db.commit()
    return {"status": "success", "id_aluno": id_aluno}
