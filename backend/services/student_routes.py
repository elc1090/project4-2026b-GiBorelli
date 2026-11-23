from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from services.auth_dependencies import require_professor
from database import get_db
from models import Usuario
from schemas import UsuarioResponse, UsuarioUpdate
from security import generate_hash

router = APIRouter()

@router.get("/usuarios/alunos")
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


@router.get("/usuarios/alunos/{id_aluno}")
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


@router.put("/usuarios/alunos/{id_aluno}", response_model=UsuarioResponse)
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


@router.delete("/usuarios/alunos/{id_aluno}")
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
