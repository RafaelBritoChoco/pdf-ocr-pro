from legal_tag_pipeline import quick_process

def test_quick_process_no_api_key():
    text = "Art 1 Texto exemplo sem tag\n§ 1º Parágrafo isolado"
    result = quick_process(text)
    assert result.final_content
    assert result.review_result.error_count >= 0
