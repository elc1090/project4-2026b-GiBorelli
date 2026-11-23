from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from services.auth_dependencies import require_professor
from database import get_db
from models import Questao, Tentativa, Usuario
from services.question_service import (
    OutputEvaluationError,
    collect_block_types,
    evaluate_workspace_output,
    normalize_question_id,
    public_question,
    save_question,
)
from schemas import QuestaoCreate, QuestaoImport, QuestaoUpdate, TentativaCreate

router = APIRouter()


def validate_answer_configuration(
    question_type: str,
    expected_code: str | None,
    expected_workspace: dict | None,
) -> None:
    if not expected_workspace:
        raise HTTPException(
            status_code=422,
            detail="Monte a resposta esperada no Blockly antes de salvar.",
        )

    if question_type == "aberta":
        if not collect_block_types(expected_workspace):
            raise HTTPException(
                status_code=422,
                detail="Adicione ao menos um tipo de bloco.",
            )
        return

    if question_type != "fechada":
        raise HTTPException(
            status_code=422,
            detail="O tipo da questão deve ser 'aberta' ou 'fechada'.",
        )

    if not expected_code:
        raise HTTPException(
            status_code=422,
            detail="Questões fechadas precisam de codigo_esperado.",
        )
    try:
        expected_output = evaluate_workspace_output(expected_workspace)
    except OutputEvaluationError as error:
        raise HTTPException(
            status_code=422,
            detail=f"A resposta esperada não pode ser executada: {error}",
        ) from error
    if not expected_output["has_result"]:
        raise HTTPException(
            status_code=422,
            detail=(
                "A resposta esperada precisa produzir uma saída, uma expressão "
                "calculável ou um valor de variável."
            ),
        )


@router.post("/run-blocks")
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

        output_result = None
        output_error = None
        if data.workspace_json:
            try:
                output_result = evaluate_workspace_output(data.workspace_json)
            except OutputEvaluationError as error:
                output_error = str(error)

        expected_output_result = None
        expected_output_error = None
        if (
            question
            and question.tipo_questao == "fechada"
            and question.blocos_esperados
        ):
            try:
                expected_output_result = evaluate_workspace_output(
                    question.blocos_esperados
                )
            except OutputEvaluationError as error:
                expected_output_error = str(error)

        required_block_types = []
        missing_required_block_types = []
        correta = False
        if question and question.tipo_questao == "aberta":
            required_block_types = sorted(
                collect_block_types(question.blocos_esperados)
            )
            student_block_types = collect_block_types(data.workspace_json)
            missing_required_block_types = sorted(
                set(required_block_types) - student_block_types
            )
            correta = bool(required_block_types) and not missing_required_block_types
        elif (
            question
            and question.tipo_questao == "fechada"
            and output_result
            and output_result["has_result"]
            and expected_output_result
            and expected_output_result["has_result"]
        ):
            correta = (
                output_result["result_lines"]
                == expected_output_result["result_lines"]
            )

        if question is None:
            mensagem = "Tentativa salva, mas esta questão não está cadastrada."
        elif question.tipo_questao == "aberta" and not required_block_types:
            mensagem = "Esta questão aberta não possui blocos obrigatórios cadastrados."
        elif missing_required_block_types:
            missing = ", ".join(missing_required_block_types)
            mensagem = f"Resposta incompleta. Blocos obrigatórios ausentes: {missing}."
        elif correta:
            mensagem = "Resposta correta."
        elif question.tipo_questao == "fechada" and expected_output_error:
            mensagem = "Não foi possível calcular a saída esperada desta questão."
        elif question.tipo_questao == "fechada" and expected_output_result is None:
            mensagem = "Esta questão fechada não possui uma resposta esperada calculável."
        elif question.tipo_questao == "fechada" and not expected_output_result["has_result"]:
            mensagem = "A resposta esperada não possui uma saída ou resultado calculável."
        elif question.tipo_questao == "fechada" and output_error:
            mensagem = "Não foi possível calcular a resposta do programa."
        elif (
            question.tipo_questao == "fechada"
            and (not output_result or not output_result["has_result"])
        ):
            mensagem = "O programa não produziu saída nem resultado calculável."
        else:
            mensagem = "O resultado do programa não corresponde à resposta esperada."

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
            "result_lines": (
                output_result["result_lines"] if output_result else None
            ),
            "has_result": output_result["has_result"] if output_result else False,
            "output_error": output_error,
            "required_block_types": required_block_types,
            "missing_required_block_types": missing_required_block_types,
            "expected_output_lines": (
                expected_output_result["lines"] if expected_output_result else None
            ),
            "expected_has_output": (
                expected_output_result["has_output"]
                if expected_output_result
                else False
            ),
            "expected_result_lines": (
                expected_output_result["result_lines"]
                if expected_output_result
                else None
            ),
            "expected_has_result": (
                expected_output_result["has_result"]
                if expected_output_result
                else False
            ),
            "expected_output_error": expected_output_error,
        }
    except Exception:
        db.rollback()
        raise


@router.get("/tentativas")
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


@router.get("/questoes")
async def list_questions(db: Session = Depends(get_db)):
    questions = db.scalars(select(Questao).order_by(Questao.id)).all()
    return [public_question(question) for question in questions]


@router.post("/questoes")
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
    validate_answer_configuration(
        data.tipo_questao,
        data.codigo_esperado,
        data.blocos_esperados,
    )

    question = save_question(data, db)
    db.commit()
    db.refresh(question)
    return {"status": "success", "id_questao": question.id_questao}


@router.post("/questoes/importar")
async def import_questions(
    data: QuestaoImport,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_professor),
):
    ids = [question.id_questao.strip() for question in data.questoes]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="O arquivo contém ids_questao duplicados.")
    for question in data.questoes:
        validate_answer_configuration(
            question.tipo_questao,
            question.codigo_esperado,
            question.blocos_esperados,
        )

    questions = [save_question(question, db) for question in data.questoes]
    db.commit()
    return {
        "status": "success",
        "quantidade": len(questions),
        "ids_questao": [question.id_questao for question in questions],
    }


@router.get("/questoes/{id_questao}")
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


@router.put("/questoes/{id_questao}")
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
    validate_answer_configuration(
        question.tipo_questao,
        data.codigo_esperado,
        data.blocos_esperados,
    )

    question.titulo = data.titulo
    question.enunciado = data.enunciado
    question.codigo_esperado = data.codigo_esperado
    question.blocos_esperados = data.blocos_esperados
    db.commit()
    return {"status": "success", "id_questao": question.id_questao}


@router.delete("/questoes/{id_questao}")
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
