
import sys
import re

FOOTNOTE_PATTERN_FIND = r"\{\{footnotenumber(\d+)\}\}(\d+)\{\{-footnotenumber\d+\}\}"

def perform_footnote_renumbering(editor_text_unicode):
    matches_list = list(re.finditer(FOOTNOTE_PATTERN_FIND, editor_text_unicode))
    num_to_renumber = len(matches_list)
    
    # Process backwards to avoid issues with index changes during replacement
    # Create a list of parts to join later for efficiency
    parts = []
    last_end = len(editor_text_unicode)

    for i in range(num_to_renumber - 1, -1, -1):
        match_object = matches_list[i]
        correct_sequential_number = i + 1
        
        replacement_text = "{{{{footnotenumber{0}}}}}{0}{{{{-footnotenumber{0}}}}}".format(correct_sequential_number)

        start_pos = match_object.start()
        end_pos = match_object.end()

        # Add the text after the current match (or to the end of the string initially)
        parts.append(editor_text_unicode[end_pos:last_end])
        # Add the replacement text
        parts.append(replacement_text)
        # Update last_end to the start of the current match
        last_end = start_pos
    
    # Add any remaining text at the beginning of the original string
    parts.append(editor_text_unicode[0:last_end])
    
    # Join all parts in reverse order to reconstruct the string correctly
    return "".join(reversed(parts))

if __name__ == '__main__':
    editor_text_unicode = sys.stdin.read()
    processed_text = perform_footnote_renumbering(editor_text_unicode)
    sys.stdout.write(processed_text)


