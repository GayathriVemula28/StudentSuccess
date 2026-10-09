from pydantic import BaseModel, Field
from typing import Optional, List


class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = None


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: Optional[str] = None
    year: Optional[str] = None


class StudentOut(BaseModel):
    id: str
    name: str
    email: str
    department: str
    year: str
    academic_score: float
    attendance: float
    lms: float
    placement: float
    skills: float
    success_score: float
    risk_level: str
    risk_score: float
    cgpa: float
    semester: str


class SuccessScoreOut(BaseModel):
    student_id: str
    score: float
    risk_level: str
    explanation: str
    breakdown: dict


class RiskOut(BaseModel):
    student_id: str
    risk_level: str
    risk_score: float
    factors: List[str]
    action: str


class RecommendationOut(BaseModel):
    student_id: str
    recommendations: List[str]


class UploadResponse(BaseModel):
    uploaded: int
    rows_processed: int
    duplicates_skipped: int
    message: str
    errors: List[str] = Field(default_factory=list)
