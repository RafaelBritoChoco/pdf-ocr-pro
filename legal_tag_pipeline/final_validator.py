from __future__ import annotations
from .models import ReviewResult, ValidationResult, QualityStatus

class FinalValidator:
    def assess(self, review: ReviewResult) -> ValidationResult:
        count = review.error_count
        if count == 0:
            return ValidationResult(status=QualityStatus.PERFECT, score=100.0)
        if count <= 2:
            return ValidationResult(status=QualityStatus.EXCELLENT, score=max(70.0, 95 - (count * 5)))
        if count <= 5:
            recs = ["Revisar formatação e hierarquia"]
            return ValidationResult(status=QualityStatus.WARNING, score=max(40.0, 85 - (count * 7)), recommendations=recs)
        recs = ["Reprocessar documento com OCR melhor", "Verificar fechamento de tags"]
        return ValidationResult(status=QualityStatus.CRITICAL, score=max(10.0, 60 - (count * 4)), recommendations=recs)


def validate_review(review: ReviewResult) -> ValidationResult:
    return FinalValidator().assess(review)
