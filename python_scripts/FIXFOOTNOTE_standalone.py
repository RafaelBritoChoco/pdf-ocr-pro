
import sys
import re

# Patterns to identify footnote markers and content blocks
FOOTNOTE_MARKER_PATTERN = r"\{\{footnotenumber(\d+)\}\}"
FOOTNOTE_CONTENT_BLOCK_PATTERN = r"\{\{footnote(\d+)\}\}(.*?)\{\{-footnote\d+\}\}"

def process_footnotes(text):
    extracted_footnotes = {}
    text_without_content_blocks = text

    # 1. Extract footnote content blocks and remove them from the main text
    # We iterate over matches and replace them with a unique placeholder to avoid issues with overlapping regex or partial replacements
    # However, for simplicity and direct removal, we'll just replace with empty string for now.
    # A more robust approach might involve a two-pass replacement or careful use of re.sub
    
    # Find all content blocks first
    content_matches = list(re.finditer(FOOTNOTE_CONTENT_BLOCK_PATTERN, text, re.DOTALL))
    
    # Sort matches by their start position in reverse order to avoid index shifting issues during replacement
    content_matches.sort(key=lambda x: x.start(), reverse=True)

    for match in content_matches:
        original_id = int(match.group(1))
        content = match.group(2).strip()
        extracted_footnotes[original_id] = content
        # Replace the matched content block with an empty string in the main text
        text_without_content_blocks = text_without_content_blocks[:match.start()] + text_without_content_blocks[match.end():]

    # 2. Collect and renumber footnote markers remaining in the main text
    # And remove the original markers from the main text, replacing them with just the number
    
    final_main_text_parts = []
    renumbered_marker_map = {}
    current_marker_number = 1
    last_end = 0

    # Iterate through the text that no longer contains content blocks
    for match in re.finditer(FOOTNOTE_MARKER_PATTERN, text_without_content_blocks, re.DOTALL):
        start, end = match.span()
        original_id = int(match.group(1))
        
        # Add the text before the current marker
        final_main_text_parts.append(text_without_content_blocks[last_end:start])
        
        # Add the new renumbered marker (just the number for now, will be handled by FIXFOOTNOTENUMBER)
        final_main_text_parts.append(str(current_marker_number))
        
        # Map the new number to the original ID, useful for sorting extracted footnotes later
        renumbered_marker_map[current_marker_number] = original_id
        
        current_marker_number += 1
        last_end = end
    
    # Add any remaining text after the last marker
    final_main_text_parts.append(text_without_content_blocks[last_end:])
    
    final_main_text = "".join(final_main_text_parts)

    # 3. Append the extracted footnotes at the end of the document
    final_footnotes_section = []
    if extracted_footnotes:
        final_footnotes_section.append("\n\nFOOTNOTES:\n")
        
        # Create a list of (new_number, original_id) pairs from the renumbered_marker_map
        # This ensures footnotes are ordered by their appearance in the main text
        sorted_markers = sorted(renumbered_marker_map.items())
        
        for new_num, original_id in sorted_markers:
            if original_id in extracted_footnotes:
                final_footnotes_section.append(f"{new_num}. {extracted_footnotes[original_id]}\n")

    return final_main_text + "".join(final_footnotes_section)

if __name__ == '__main__':
    input_text = sys.stdin.read()
    output_text = process_footnotes(input_text)
    sys.stdout.write(output_text)


