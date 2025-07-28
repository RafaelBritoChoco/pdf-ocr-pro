
import sys
import re

# ======================
# CONSTANTS & KEYWORDS & TYPES
# ======================
HEADING_KEYWORDS_UPPER_CANONICAL = [
    u"PART", u"BOOK", u"ANNEX", u"APPENDIX", u"SCHEDULE", u"PREAMBLE", u"CHAPTER", u"DIVISION", u"SUBPART",
    u"PARTE", u"LIBRO", u"ANEXO", u"APÉNDICE", u"PREÁMBULO", u"CAPÍTULO", u"DIVISIÓN", u"SUBPARTE",
    u"PARTE", u"LIVRO", u"ANEXO", u"APÊNDICE", u"PREÂMBULO", u"CAPÍTULO", u"DIVISÃO", u"SUBPARTE",
    u"PARTIE", u"LIVRE", u"ANNEXE", u"APPENDICE", u"PRÉAMBULE", u"CHAPITRE", u"DIVISION", u"SOUS-PARTIE",
    u"TEIL", u"BUCH", u"ANHANG", u"ANLAGE", u"KAPITEL", u"UNTERTEIL",
]
HEADING_KEYWORDS_TITLE_CANONICAL = [
    u"Title", u"Section", u"Subsection", u"Article", u"Clause", u"Regulation", u"Rule", u"Order", u"Paragraph",
    u"Título", u"Sección", u"Subsección", u"Artículo", u"Cláusula", u"Reglamento", u"Regla", u"Orden", u"Párrafo", u"Apartado",
    u"Título", u"Secção", u"Seção", u"Subsecção", u"Subseção", u"Artigo", u"Cláusula", u"Regulamento", u"Regra", u"Ordem", u"Parágrafo", u"Art.",
    u"Titre", u"Section", u"Sous-section", u"Article", u"Clause", u"Règlement", u"Règle", u"Ordonnance", u"Paragraphe",
    u"Titel", u"Abschnitt", u"Unterabschnitt", u"Artikel", u"Klausel", u"Regelung", u"Verordnung", u"Regel", u"Anordnung", u"Paragraph", u"Absatz"
]
EXTRA_KEYWORDS_EITHER_CASE = [
    u"SECTION", u"ARTICLE", u"TITLE", u"TÍTULO", u"SECCIÓN", u"SECÇÃO", u"ARTÍCULO", u"ARTIGO",
    u"Chapter", u"Division"
]
DETECT_KEYWORDS_UPPER = set(k.lower() for k in HEADING_KEYWORDS_UPPER_CANONICAL + EXTRA_KEYWORDS_EITHER_CASE)
DETECT_KEYWORDS_TITLE = set(k.lower() for k in HEADING_KEYWORDS_TITLE_CANONICAL + EXTRA_KEYWORDS_EITHER_CASE)
ALL_DETECT_KEYWORDS = DETECT_KEYWORDS_UPPER.union(DETECT_KEYWORDS_TITLE)
AMBIGUOUS_TITLE_KEYWORDS = {u'rule', u'order', u'paragraph', u'clause', u'regulation'}

PREAMBLE_INTRO_PHRASES=[u"Members,"]
PREAMBLE_CLAUSE_STARTERS=[
    u"Noting", u"Considering", u"Recognizing", u"Recognising", u"Recalling", u"Desiring",
    u"Affirming", u"Having carried out", u"Striving", u"Believing", u"Whereas",
    u"The Governments of", u"The Parties",
    u"Conscious of", u"Mindful of", u"Reaffirming"
]
TRANSITIONAL_PHRASES=[
    u"Hereby agree as follows:", u"Have agreed as follows:", u"The Parties hereby agree as follows:",
    u"Agree as follows:", u"Adopt the following provisions:"
]
DETECT_TRANSITIONAL_PHRASES_LOWER=set(p.lower() for p in TRANSITIONAL_PHRASES)

# --- Line Types ---
LT_PREAMBLE_HEAD = u"PREAMBLE_HEAD"; LT_PREAMBLE_INTRO = u"PREAMBLE_INTRO"; LT_PREAMBLE_CLAUSE = u"PREAMBLE_CLAUSE"
LT_TRANSITIONAL = u"TRANSITIONAL"; LT_HEADING_UPPER = u"HEADING_UPPER"; LT_HEADING_TITLE = u"HEADING_TITLE"
LT_HEADING_DESC = u"HEADING_DESC"; LT_NUMBERED_PARA_HEAD = u"NUMBERED_PARA_HEAD"; LT_ENUM_MARKER = u"ENUM_MARKER"
LT_NUM_MARKER = u"NUM_MARKER"; LT_ENUM_ITEM = u"ENUM_ITEM"; LT_NUMBERED_ITEM = u"NUMBERED_ITEM"
LT_FOOTNOTE_BLOCK = u"FOOTNOTE_BLOCK"; LT_ENDS_COLON = u"ENDS_COLON"; LT_REGULAR = u"REGULAR"
LT_BLANK = u"BLANK"; LT_CONSUMED = u"CONSUMED"; LT_UNKNOWN = u"UNKNOWN";
LT_SPLIT_MARKER_PARENT = u"SPLIT_MARKER_PARENT"

# Types considered major structural elements that would prevent merging a previous line as a title
MAJOR_STRUCTURAL_TYPES = {
    LT_HEADING_UPPER, LT_HEADING_TITLE, LT_PREAMBLE_HEAD, LT_TRANSITIONAL,
    LT_SPLIT_MARKER_PARENT
}


# --- Compiled Regex ---
RE_FOOTNOTE_BLOCK=re.compile(r'^\s*\d+\s+["“].*',re.UNICODE)
RE_NUMBERED_ITEM=re.compile(r'^\s*(?:\d+(?:\.\d+)*\.|\(\d+\))\s+\S+',re.UNICODE)
RE_NUM_MARKER=re.compile(r'^\s*(?:\d+(?:\.\d+)*\.|\(\d+\))\s*$',re.UNICODE)
RE_NUMBERED_PARA_HEAD_MARKER=re.compile(r'^\s*(?:\d+|[IVXLCDM]+)\.\s*$',re.IGNORECASE|re.UNICODE)
RE_ENUM_ITEM=re.compile(r"""
    ^\s*(?: \([a-zA-Z]{1,2}\) | \([ivxlcdm]+\) | \([IVXLCDM]+\) |
             [a-zA-Z]{1,2}\. | [ivxlcdm]+\. | [IVXLCDM]+\. )\s+\S+
    """,re.VERBOSE|re.IGNORECASE|re.UNICODE)
RE_ENUM_MARKER=re.compile(r"""
    ^\s*(?: \([a-zA-Z]{1,2}\) | \([ivxlcdm]+\) | \([IVXLCDM]+\) |
             [a-zA-Z]{1,2}\. | [ivxlcdm]+\. | [IVXLCDM]+\. )\s*$
    """,re.VERBOSE|re.IGNORECASE|re.UNICODE)
RE_FIND_FIRST_ID_PATTERN=re.compile(r"""
    ( \d+(?:\.\d+)* | [IVXLCDM]+ | [A-Z] )
    (?=[\s\.:\-]|$)
    """,re.IGNORECASE|re.UNICODE|re.VERBOSE)
RE_ITEM_MARKER_START=re.compile(r'^\s*(\(?[a-zA-Z0-9]+\)|[a-zA-Z]{1,2}\.|[ivxlcdm]+\.|[IVXLCDM]+\.|\d+\.)',re.IGNORECASE|re.UNICODE)
RE_SPLIT_NUMBER_ENUM=re.compile(r"""
    ^           # Start of line
    \s*         # Optional leading space
    ( \d+\. )   # Group 1: Number marker (e.g., "6.")
    \s+         # One or more spaces BETWEEN markers
    ( \( [a-zA-Z]{1,2} \) ) # Group 2: Enum marker (e.g., "(a)")
    \s+         # One or more spaces AFTER enum marker
    ( .* )      # Group 3: The rest of the line (content)
    $           # End of line
    """, re.VERBOSE | re.UNICODE | re.IGNORECASE)
RE_HEADING_ONLY_KEY_ID = re.compile(r"""
    ^                 # Start of line
    \s*               # Optional leading space
    ([a-zA-ZÁÉÍÓÚÑÜÇÀÂÊÎÔÛÄËÏÖÜáéíóúñüçàâêîôûäëïöü]+) # Keyword (Group 1)
    \s+               # Space(s)
    ([0-9IVXLCDM]+     # ID: number or Roman (Group 2)
     (?:\.[0-9]+)*)   # Optional sub-numbers like .1 .2
    (?:\s*[:.\-–]?\s*$) # Optional space, colon, dot, hyphen, en-dash, then end of line
    """, re.VERBOSE | re.UNICODE | re.IGNORECASE)

# Regex to detect standalone numbers (potential page numbers)
RE_STANDALONE_NUMBER = re.compile(r'^\s*\d+\s*$')


# ======================
# HELPER FUNCTIONS
# ======================
def is_pure_number(line):
    return bool(re.match(r'^[0-9]+$', line.strip()))

def format_heading_text(original_line, line_type):
    return original_line.strip()

def ensure_blank_lines_before(output_list, n):
    can_add_initial = not output_list
    while output_list and output_list[-1].strip() == u"": output_list.pop()
    if output_list or (can_add_initial and n > 0):
         for _ in range(n): output_list.append(u"")

def heading_contains_only_keyword_and_id(heading_text):
    return bool(RE_HEADING_ONLY_KEY_ID.match(heading_text.strip()))

def identify_line_type(line, previous_line_type=None):
    stripped = line.strip(); lower_stripped = stripped.lower()
    if not stripped: return LT_BLANK
    
    # Check for standalone numbers (page numbers) and classify them as BLANK
    if RE_STANDALONE_NUMBER.match(stripped): return LT_BLANK

    if lower_stripped == u"preamble": return LT_PREAMBLE_HEAD
    for phrase in PREAMBLE_INTRO_PHRASES:
        if stripped == phrase: return LT_PREAMBLE_INTRO
    if lower_stripped in DETECT_TRANSITIONAL_PHRASES_LOWER: return LT_TRANSITIONAL
    is_preamble_context = previous_line_type in [LT_PREAMBLE_HEAD, LT_PREAMBLE_INTRO, LT_PREAMBLE_CLAUSE]
    if is_preamble_context:
        for word in PREAMBLE_CLAUSE_STARTERS:
            if stripped.startswith(word + u" ") and not RE_ENUM_ITEM.match(stripped) and not RE_NUMBERED_ITEM.match(stripped) :
                 first_word_lower_check = stripped.split(None, 1)[0].lower()
                 if first_word_lower_check not in ALL_DETECT_KEYWORDS: return LT_PREAMBLE_CLAUSE
    parts = stripped.split(None, 1); first_word_lower = parts[0].lower() if parts else ""
    heading_type = None; longest_keyword_match = 0
    if first_word_lower in ALL_DETECT_KEYWORDS:
        best_kw_lower = ""
        for kw_lower in ALL_DETECT_KEYWORDS:
            if lower_stripped.startswith(kw_lower):
                kw_len = len(kw_lower)
                if len(stripped) == kw_len or stripped[kw_len:kw_len+1].isspace() or stripped[kw_len:kw_len+1] == u'-':
                     if kw_len > longest_keyword_match:
                         longest_keyword_match = kw_len
                         best_kw_lower = kw_lower
        if best_kw_lower:
             if best_kw_lower in DETECT_KEYWORDS_UPPER: heading_type = LT_HEADING_UPPER
             elif best_kw_lower in DETECT_KEYWORDS_TITLE: heading_type = LT_HEADING_TITLE
             else: heading_type = LT_HEADING_TITLE
    if heading_type:
        looks_like_item = RE_ENUM_ITEM.match(stripped) or RE_NUMBERED_ITEM.match(stripped)
        is_short_keyword = longest_keyword_match <= 2
        if looks_like_item and is_short_keyword: heading_type = None
        elif first_word_lower in AMBIGUOUS_TITLE_KEYWORDS:
            if not (RE_HEADING_ONLY_KEY_ID.match(stripped) or stripped.lower() == first_word_lower):
                heading_type = None
    if heading_type: return heading_type
    if RE_ENUM_MARKER.match(stripped): return LT_ENUM_MARKER
    if RE_NUMBERED_PARA_HEAD_MARKER.match(stripped): return LT_NUMBERED_PARA_HEAD
    if RE_NUM_MARKER.match(stripped): return LT_NUM_MARKER
    if RE_FOOTNOTE_BLOCK.match(stripped): return LT_FOOTNOTE_BLOCK
    if RE_ENUM_ITEM.match(stripped): return LT_ENUM_ITEM
    if RE_NUMBERED_ITEM.match(stripped): return LT_NUMBERED_ITEM
    if stripped.endswith(u':'): return LT_ENDS_COLON
    if is_preamble_context:
         potential_marker = stripped.split(None,1)[0] + '.' if stripped else ''
         if not RE_NUMBERED_PARA_HEAD_MARKER.match(potential_marker): return LT_PREAMBLE_CLAUSE
    return LT_REGULAR

def process_text_alignment(raw_text):
    raw_lines_unicode = raw_text.splitlines()

    processed_lines_data = []
    last_line_type_identified = None
    for i, line in enumerate(raw_lines_unicode):
        # Removed is_pure_number check here as it's now handled by identify_line_type
        stripped_line = line.strip()
        if not stripped_line: continue
        split_match = RE_SPLIT_NUMBER_ENUM.match(stripped_line)
        if split_match:
            num_marker = split_match.group(1).strip()
            enum_marker = split_match.group(2).strip()
            content = split_match.group(3).strip()
            num_info = {'text': num_marker, 'type': LT_SPLIT_MARKER_PARENT, 'original_index': i, 'merged_into_prev': False, 'consumes_next': False, 'is_heading': False, 'was_split': True}
            processed_lines_data.append(num_info)
            last_line_type_identified = num_info['type']
            enum_text = enum_marker + u" " + content
            enum_info = {'text': enum_text, 'type': LT_ENUM_ITEM, 'original_index': i, 'merged_into_prev': False, 'consumes_next': False, 'is_heading': False, 'was_split': True}
            processed_lines_data.append(enum_info)
            last_line_type_identified = enum_info['type']
            continue
        line_type = identify_line_type(line, last_line_type_identified)
        # If it's a blank line (which now includes standalone numbers), skip adding it to processed_lines_data
        if line_type == LT_BLANK: continue
        processed_text = stripped_line
        processed_lines_data.append({'text': processed_text, 'type': line_type, 'original_index': i, 'merged_into_prev': False, 'consumes_next': False, 'is_heading': line_type in [LT_HEADING_UPPER, LT_HEADING_TITLE], 'was_split': False})
        last_line_type_identified = line_type

    line_count = len(processed_lines_data)
    i = 0
    while i < line_count:
        current_info = processed_lines_data[i]
        if current_info['merged_into_prev']: i += 1; continue
        mergeable_marker_types = [LT_ENUM_MARKER, LT_NUM_MARKER, LT_NUMBERED_PARA_HEAD]
        if current_info['type'] in mergeable_marker_types and current_info['type'] != LT_SPLIT_MARKER_PARENT:
            next_text_info = None; next_line_index = -1
            for j in range(i + 1, line_count):
                if not processed_lines_data[j]['merged_into_prev']: next_line_index = j; break
            if next_line_index != -1:
                potential_next = processed_lines_data[next_line_index]
                non_merge_types = {LT_HEADING_UPPER, LT_HEADING_TITLE, LT_PREAMBLE_HEAD, LT_PREAMBLE_INTRO, LT_PREAMBLE_CLAUSE, LT_TRANSITIONAL, LT_NUMBERED_PARA_HEAD, LT_ENUM_MARKER, LT_NUM_MARKER, LT_ENUM_ITEM, LT_NUMBERED_ITEM, LT_FOOTNOTE_BLOCK, LT_SPLIT_MARKER_PARENT}
                if potential_next['type'] not in non_merge_types:
                     merge_text_candidate = potential_next['text']
                     if merge_text_candidate: next_text_info = potential_next
            if next_text_info:
                 merge_text = next_text_info['text']
                 current_info['text'] = current_info['text'] + u" " + merge_text
                 if current_info['type'] == LT_ENUM_MARKER: current_info['type'] = LT_ENUM_ITEM
                 elif current_info['type'] in [LT_NUM_MARKER, LT_NUMBERED_PARA_HEAD]: current_info['type'] = LT_NUMBERED_ITEM
                 next_text_info['merged_into_prev'] = True; current_info['consumes_next'] = True
                 i += 1
        i += 1

    i = 0
    while i < line_count:
         current_info = processed_lines_data[i]

         if current_info['merged_into_prev'] or not current_info['is_heading']:
             i += 1; continue

         if not heading_contains_only_keyword_and_id(current_info['text']):
             i += 1; continue

         potential_desc_index = -1
         for j in range(i + 1, line_count):
             if not processed_lines_data[j]['merged_into_prev']:
                 potential_desc_index = j
                 break

         if potential_desc_index == -1:
             i += 1; continue

         potential_desc_info = processed_lines_data[potential_desc_index]
         potential_desc_text = potential_desc_info['text']

         if not potential_desc_text or \
            RE_ITEM_MARKER_START.match(potential_desc_text) or \
            potential_desc_text.split(None, 1)[0].lower() in ALL_DETECT_KEYWORDS:
              i += 1; continue

         after_desc_index = -1
         for j in range(potential_desc_index + 1, line_count):
             if not processed_lines_data[j]['merged_into_prev']:
                 after_desc_index = j
                 break

         should_merge = True
         if after_desc_index == -1:
              should_merge = False
         else:
              after_desc_info = processed_lines_data[after_desc_index]
              if after_desc_info['type'] in MAJOR_STRUCTURAL_TYPES:
                   should_merge = False

         if should_merge:
             if potential_desc_info['type'] == LT_REGULAR or potential_desc_info['type'] == LT_ENDS_COLON:
                 current_info['text'] += u" " + potential_desc_text
                 potential_desc_info['merged_into_prev'] = True
                 current_info['consumes_next'] = True
                 i += 1

         i += 1

    output_lines = []
    last_output_type = None
    for i, line_info in enumerate(processed_lines_data):
        if line_info['merged_into_prev']: continue

        current_type = line_info['type']
        text_to_add = line_info['text']

        if current_type == LT_BLANK:
            if last_output_type != LT_BLANK:
                output_lines.append(u"")
        elif current_type == LT_PREAMBLE_HEAD:
            ensure_blank_lines_before(output_lines, 2)
            output_lines.append(text_to_add.upper())
        elif current_type == LT_TRANSITIONAL:
            ensure_blank_lines_before(output_lines, 2)
            output_lines.append(text_to_add)
        elif current_type == LT_HEADING_UPPER:
            ensure_blank_lines_before(output_lines, 2)
            output_lines.append(text_to_add.upper())
        elif current_type == LT_HEADING_TITLE:
            ensure_blank_lines_before(output_lines, 2)
            output_lines.append(text_to_add)
        elif current_type == LT_NUMBERED_PARA_HEAD:
            ensure_blank_lines_before(output_lines, 1)
            output_lines.append(text_to_add)
        elif current_type == LT_ENUM_MARKER or current_type == LT_NUM_MARKER:
            output_lines.append(text_to_add)
        elif current_type == LT_FOOTNOTE_BLOCK:
            ensure_blank_lines_before(output_lines, 2)
            output_lines.append(text_to_add)
        elif current_type == LT_SPLIT_MARKER_PARENT:
            output_lines.append(text_to_add)
        else:
            output_lines.append(text_to_add)
        last_output_type = current_type

    return u"\n".join(output_lines)

if __name__ == '__main__':
    raw_text = sys.stdin.read()
    processed_text = process_text_alignment(raw_text)
    sys.stdout.write(processed_text)


