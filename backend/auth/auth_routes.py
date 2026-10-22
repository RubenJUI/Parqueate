from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from auth.auth import authenticate_user, create_access_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES
from database.database import get_db
from schema.auth_schema import Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), conn=Depends(get_db)):
    """El campo `username` del formulario corresponde al correo del usuario."""
    usuario = authenticate_user(conn, form_data.username, form_data.password)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not usuario["estado"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta cuenta está desactivada")

    access_token = create_access_token(
        data={"sub": usuario["correo"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}
