from pathlib import Path
from typing import Any
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Questao
from schemas import QuestaoCreate, QuestaoImport


def normalize_question_id(title: str) -> str:
    without_accents = "".join(character
        for character in unicodedata.normalize("NFD", title)
        if not unicodedata.combining(character)
    )
    return "".join(without_accents.lower().split())


def collect_block_types(workspace_json: dict[str, Any] | None) -> set[str]:
    if not isinstance(workspace_json, dict):
        return set()

    block_state = workspace_json.get("blocks")
    if not isinstance(block_state, dict):
        return set()
    top_blocks = block_state.get("blocks")
    if not isinstance(top_blocks, list):
        return set()

    block_types: set[str] = set()
    pending = list(top_blocks)
    while pending:
        block = pending.pop()
        if not isinstance(block, dict) or block.get("disabled"):
            continue

        block_type = block.get("type")
        if isinstance(block_type, str):
            block_types.add(block_type)

        inputs = block.get("inputs")
        if isinstance(inputs, dict):
            for connection in inputs.values():
                if not isinstance(connection, dict):
                    continue
                pending.extend(
                    child
                    for child in (connection.get("block"), connection.get("shadow"))
                    if isinstance(child, dict)
                )

        next_connection = block.get("next")
        if isinstance(next_connection, dict):
            next_block = next_connection.get("block")
            if isinstance(next_block, dict):
                pending.append(next_block)

    return block_types


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
    expression_results: list[Any] = []
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
                expression_results.append(evaluate_value(top_block))
            else:
                execute_chain(top_block)
    except OutputEvaluationError:
        raise
    except (ArithmeticError, TypeError, ValueError, OverflowError) as error:
        raise OutputEvaluationError(
            "Não foi possível calcular a saída: verifique os valores e operações dos blocos."
        ) from error

    if has_print:
        result_lines = output_lines
    elif expression_results:
        result_lines = [python_string(value) for value in expression_results]
    else:
        result_lines = [
            f"{name} = {python_string(value)}"
            for name, value in sorted(values.items())
        ]

    return {
        "lines": output_lines,
        "has_output": has_print,
        "result_lines": result_lines,
        "has_result": bool(result_lines),
    }


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
    seed_directory = Path(__file__).resolve().parent.parent / "modelos_questoes"
    seed_paths = (
        seed_directory / "fechadas.json",
        seed_directory / "abertas.json",
    )
    missing_paths = [path for path in seed_paths if not path.is_file()]
    if missing_paths:
        missing = ", ".join(str(path) for path in missing_paths)
        raise FileNotFoundError(f"Arquivos de questões não encontrados: {missing}")

    questions = []
    for seed_path in seed_paths:
        seed = QuestaoImport.model_validate_json(
            seed_path.read_text(encoding="utf-8")
        )
        questions.extend(seed.questoes)

    question_ids = [question.id_questao.strip() for question in questions]
    if len(question_ids) != len(set(question_ids)):
        raise ValueError("Os arquivos de questões contêm ids_questao duplicados.")

    with SessionLocal() as db:
        for question_data in questions:
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
                existing.tipo_questao = question_data.tipo_questao
        db.commit()
