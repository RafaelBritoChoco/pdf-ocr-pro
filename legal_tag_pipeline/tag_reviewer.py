from __future__ import annotations
import re
from typing import List
from .models import ReviewIssue, IssueType, IssueSeverity, ReviewResult

ARTICLE_RE = re.compile(r"\bArt\.\s*\d+[ºo]?", re.IGNORECASE)
PARAGRAPH_RE = re.compile(r"§\s*\d+º?")
TAG_OPEN_RE = re.compile(r"<([a-zA-Z_]+)>")
TAG_CLOSE_RE = re.compile(r"</([a-zA-Z_]+)>")

class TagReviewer:
    def review(self, content: str) -> ReviewResult:
        issues: List[ReviewIssue] = []
        issues.extend(self._check_balanced_tags(content))
        issues.extend(self._check_hierarchy(content))
        issues.extend(self._check_formatting(content))
        issues.extend(self._check_missing(content))
        return ReviewResult(issues=issues)

    def _check_balanced_tags(self, content: str) -> List[ReviewIssue]:
        issues: List[ReviewIssue] = []
        stack = []
        for match in re.finditer(r"</?([a-zA-Z_]+)>", content):
            tag = match.group(1)
            if match.group(0).startswith("</"):
                if not stack or stack[-1] != tag:
                    issues.append(ReviewIssue(
                        issue_type=IssueType.MALFORMED,
                        severity=IssueSeverity.CRITICAL,
                        message=f"Tag de fechamento fora de ordem: {tag}",
                        snippet=content[max(0, match.start()-30):match.end()+30],
                        suggestion=f"Verifique ordem de fechamento da tag '{tag}'",
                        confidence=0.85
                    ))
                else:
                    stack.pop()
            else:
                stack.append(tag)
        for leftover in stack:
            issues.append(ReviewIssue(
                issue_type=IssueType.MALFORMED,
                severity=IssueSeverity.MAJOR,
                message=f"Tag aberta não fechada: {leftover}",
                snippet=leftover,
                suggestion=f"Adicionar </{leftover}>",
                confidence=0.8
            ))
        return issues

    def _check_hierarchy(self, content: str) -> List[ReviewIssue]:
        issues: List[ReviewIssue] = []
        first_article = content.find('<article>')
        first_paragraph = content.find('<paragraph>')
        if first_paragraph != -1 and (first_article == -1 or first_paragraph < first_article):
            issues.append(ReviewIssue(
                issue_type=IssueType.HIERARCHY,
                severity=IssueSeverity.MAJOR,
                message="Parágrafo aparece antes de qualquer artigo",
                snippet=content[max(0, first_paragraph-20):first_paragraph+40],
                suggestion="Reposicionar <paragraph> dentro ou após um <article>",
                confidence=0.7
            ))
        return issues

    def _check_formatting(self, content: str) -> List[ReviewIssue]:
        issues: List[ReviewIssue] = []
        for m in re.finditer(r"Art\s+\d+", content):
            issues.append(ReviewIssue(
                issue_type=IssueType.FORMATTING,
                severity=IssueSeverity.MINOR,
                message="Artigo sem ponto ou ordinal (esperado 'Art. 1º')",
                snippet=content[m.start():m.end()+10],
                suggestion="Usar padrão 'Art. 1º'",
                confidence=0.65
            ))
        return issues

    def _check_missing(self, content: str) -> List[ReviewIssue]:
        issues: List[ReviewIssue] = []
        for m in ARTICLE_RE.finditer(content):
            window = content[max(0, m.start()-15):m.start()]
            if '<article>' not in window:
                issues.append(ReviewIssue(
                    issue_type=IssueType.MISSING,
                    severity=IssueSeverity.MINOR,
                    message="Possível artigo sem tag <article>",
                    snippet=content[m.start():m.end()+25],
                    suggestion="Encapsular em <article> ... </article>",
                    confidence=0.6
                ))
        return issues


def review_content(content: str) -> ReviewResult:
    return TagReviewer().review(content)
