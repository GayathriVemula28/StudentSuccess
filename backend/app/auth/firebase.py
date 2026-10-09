import os
from threading import Lock
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Student

_bearer = HTTPBearer(auto_error=False)
_app_lock = Lock()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    project_id = os.getenv('FIREBASE_PROJECT_ID', '').strip()
    if not project_id:
        raise HTTPException(status_code=503, detail='Firebase Admin is not configured.')

    with _app_lock:
        try:
            return firebase_admin.get_app()
        except ValueError:
            try:
                credential_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '').strip()
                credential = credentials.Certificate(credential_path) if credential_path else credentials.ApplicationDefault()
                return firebase_admin.initialize_app(credential, {'projectId': project_id})
            except Exception as error:
                raise HTTPException(status_code=503, detail='Firebase Admin credentials could not be initialized.') from error


def get_firebase_claims(
    bearer: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    if bearer is None or bearer.scheme.lower() != 'bearer' or not bearer.credentials.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Bearer token required.',
            headers={'WWW-Authenticate': 'Bearer'},
        )

    try:
        claims = auth.verify_id_token(bearer.credentials, app=_get_firebase_app(), check_revoked=True)
    except auth.ExpiredIdTokenError as error:
        raise HTTPException(status_code=401, detail='Firebase ID token has expired.', headers={'WWW-Authenticate': 'Bearer'}) from error
    except (auth.RevokedIdTokenError, auth.InvalidIdTokenError) as error:
        raise HTTPException(status_code=401, detail='Firebase ID token is invalid or revoked.', headers={'WWW-Authenticate': 'Bearer'}) from error
    except auth.UserDisabledError as error:
        raise HTTPException(status_code=403, detail='Firebase account is disabled.') from error
    except firebase_admin.exceptions.FirebaseError as error:
        raise HTTPException(status_code=503, detail='Firebase token verification is temporarily unavailable.') from error

    uid = claims.get('uid') or claims.get('sub')
    if not uid:
        raise HTTPException(status_code=401, detail='Firebase ID token has no user identity.', headers={'WWW-Authenticate': 'Bearer'})
    claims['uid'] = str(uid)
    return claims


def get_current_student(
    claims: dict[str, Any] = Depends(get_firebase_claims),
    db: Session = Depends(get_db),
) -> Student:
    uid = claims['uid']
    student = db.query(Student).filter(Student.firebase_uid == uid).first()
    if student:
        return student

    email = claims.get('email')
    if not email or claims.get('email_verified') is not True:
        raise HTTPException(status_code=403, detail='Verify your Firebase email before linking a student profile.')

    matches = db.query(Student).filter(func.lower(Student.email) == str(email).strip().lower()).all()
    if not matches:
        raise HTTPException(status_code=404, detail='No provisioned student profile matches this verified Firebase account.')
    if len(matches) != 1:
        raise HTTPException(status_code=409, detail='The verified email matches multiple student profiles; contact an administrator.')

    student = matches[0]
    if student.firebase_uid and student.firebase_uid != uid:
        raise HTTPException(status_code=409, detail='This student profile is already linked to another Firebase account.')

    student.firebase_uid = uid
    try:
        db.commit()
        db.refresh(student)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail='This Firebase account is already linked to another student profile.') from error
    return student


def require_firebase_roles(*roles: str):
    def check(claims: dict[str, Any] = Depends(get_firebase_claims)):
        if claims.get('role', 'student') not in roles:
            raise HTTPException(status_code=403, detail='Access forbidden.')
        return claims

    return check