from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
from .models import ProcessResult, QualityStatus
from .tag_reviewer import TagReviewer
from .llm_corrector import LLMCorrector
from .llm_client import GeminiClient, FakeLLMClient, LLMClient
from .final_validator import FinalValidator

@dataclass
class ProcessorConfig:
    api_key: Optional[str] = None
    max_correction_iterations: int = 3
    auto_accept_minor_issues: bool = True
    model_name: str = "gemini-1.5-flash"

class GeminiFastProcessor:
    def __init__(self, config: ProcessorConfig):
        self.config = config
        self.reviewer = TagReviewer()
        if config.api_key:
            try:
                self.client: LLMClient = GeminiClient(config.api_key, config.model_name)
            except Exception:
                self.client = FakeLLMClient()
        else:
            self.client = FakeLLMClient()
        self.corrector = LLMCorrector(self.client)
        self.validator = FinalValidator()

    def process_document(self, content: str) -> ProcessResult:
        current = content
        iterations = 0
        last_review = self.reviewer.review(current)
        last_validation = self.validator.assess(last_review)
        # Loop somente se ainda não aceitável
        while iterations < self.config.max_correction_iterations:
            if last_validation.status in (QualityStatus.PERFECT, QualityStatus.EXCELLENT):
                break
            if last_validation.status == QualityStatus.WARNING and self.config.auto_accept_minor_issues:
                break
            corrected = self.corrector.correct(current, last_review)
            if corrected.strip() == current.strip():
                # Nenhuma mudança -> parar
                break
            current = corrected
            iterations += 1
            last_review = self.reviewer.review(current)
            last_validation = self.validator.assess(last_review)

        success = last_validation.status in (QualityStatus.PERFECT, QualityStatus.EXCELLENT) or (
            last_validation.status == QualityStatus.WARNING and self.config.auto_accept_minor_issues
        )

        return ProcessResult(
            success=success,
            final_content=current,
            review_result=last_review,
            validation_result=last_validation,
            iterations=iterations,
            metadata={"accepted_status": last_validation.status}
        )

def create_processor(api_key: Optional[str] = None, **kwargs: object) -> GeminiFastProcessor:
    # kwargs repassado diretamente; rely on dataclass to validate keys
    config = ProcessorConfig(api_key=api_key, **kwargs)  # type: ignore[arg-type]
    return GeminiFastProcessor(config)

def quick_process(content: str, api_key: Optional[str] = None) -> ProcessResult:
    processor = create_processor(api_key=api_key)
    return processor.process_document(content)
