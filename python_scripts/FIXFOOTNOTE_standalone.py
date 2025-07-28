
import sys
import re

FOOTNOTE_TAG_PATTERN = r"\{\{footnotenumber(\d+)\}\}(.*?)\{\{-footnotenumber\d+\}\}"
FOOTNOTE_CONTENT_PATTERN = r"\{\{footnote(\d+)\}\}(.*?)\{\{-footnote\d+\}\}"

def process_footnotes(text):
    # Extract footnote contents and their original tags
    footnote_contents = {}
    text_without_contents = text

    # First, extract and remove the content blocks
    for match in re.finditer(FOOTNOTE_CONTENT_PATTERN, text, re.DOTALL):
        original_tag_num = int(match.group(1))
        content = match.group(2).strip()
        footnote_contents[original_tag_num] = content
        # Replace the entire content block with an empty string
        text_without_contents = text_without_contents.replace(match.group(0), "")

    # Now, renumber and collect the tags that remain in the main text
    # And remove the original tags from the main text
    renumbered_tags = {}
    current_tag_num = 1
    main_text_parts = []
    last_end = 0

    for match in re.finditer(FOOTNOTE_TAG_PATTERN, text_without_contents, re.DOTALL):
        start, end = match.span()
        main_text_parts.append(text_without_contents[last_end:start])
        
        original_tag_num = int(match.group(1))
        renumbered_tags[current_tag_num] = original_tag_num # Map new number to old number
        main_text_parts.append(f"{{{{footnotenumber{current_tag_num}}}}}")
        current_tag_num += 1
        last_end = end
    main_text_parts.append(text_without_contents[last_end:])
    
    final_main_text = "".join(main_text_parts)

    # Reconstruct footnotes at the end, sorted by their new sequential number
    final_footnotes = []
    if footnote_contents:
        final_footnotes.append("\n\nFOOTNOTES:\n")
        # Sort renumbered_tags by new_num to get them in order
        sorted_renumbered_tags = sorted(renumbered_tags.items())
        for new_num, old_num in sorted_renumbered_tags:
            if old_num in footnote_contents:
                final_footnotes.append(f"{new_num}. {footnote_contents[old_num]}\n")

    return final_main_text + "".join(final_footnotes)

if __name__ == '__main__':
    input_text = sys.stdin.read()
    output_text = process_footnotes(input_text)
    sys.stdout.write(output_text)


