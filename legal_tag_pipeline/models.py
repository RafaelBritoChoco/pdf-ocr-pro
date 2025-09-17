from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Any, Dict

class IssueSeverity(str, Enum):
    MINOR = "minor"
    MAJOR = "major"
    CRITICAL = "critical"

class IssueType(str, Enum):
    HIERARCHY = "hierarchy"
    FORMATTING = "formatting"
    MISSING = "missing"
    MALFORMED = "malformed"
    INCOMPATIBLE = "incompatible"
    ORPHAN = "orphan"
    OTHER = "other"

@dataclass
class ReviewIssue:
    issue_type: IssueType
    severity: IssueSeverity
    message: str
    snippet: str
    suggestion: Optional[str] = None
    confidence: float = 0.6

class QualityStatus(str, Enum):
    PERFECT = "perfect"
    EXCELLENT = "excellent"
    WARNING = "warning"
    CRITICAL = "critical"

@dataclass
class ReviewResult:
    issues: List[ReviewIssue] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        return len(self.issues)

@dataclass
class ValidationResult:
    status: QualityStatus
    score: float
    recommendations: List[str] = field(default_factory=list)

@dataclass
class ProcessResult:
    success: bool
    final_content: str
    review_result: ReviewResult
    validation_result: ValidationResult
    iterations: int
    metadata: Dict[str, Any] = field(default_factory=dict)
