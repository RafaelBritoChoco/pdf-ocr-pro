// FILE: src/services/textProcessor.ts - COMPLETE AND CORRECTED CONTENT

import type { FootnoteAnalysisResult } from '../types';

export function processStructuredText(taggedText: string): { finalText: string; footnoteAnalysis: FootnoteAnalysisResult } {
    console.log('[textProcessor] Stage 3: Deterministic processing of tagged text...');

    const { textWithoutFootnotes, footnotes } = extractFootnotes(taggedText);
    const structuredBody = applyStructuralFormatting(textWithoutFootnotes);
    const { finalBody, finalFootnotes, count } = formatAndRenumberFootnotes(structuredBody, footnotes);

    const finalText = `${finalBody}\n\n${finalFootnotes}`.trim();
    const footnoteAnalysis: FootnoteAnalysisResult = { count, pages: [] };

    return { finalText, footnoteAnalysis };
}

function extractFootnotes(text: string): { textWithoutFootnotes: string; footnotes: string[] } {
    const footnotes: string[] = [];
    const footnoteRegex = /<fn>([\s\S]*?)<\/fn>/g;

    const textWithoutFootnotes = text.replace(footnoteRegex, (match, footnoteContent) => {
        footnotes.push(footnoteContent.trim());
        return `__FOOTNOTE_REF_${footnotes.length}__`;
    });

    return { textWithoutFootnotes, footnotes };
}

function applyStructuralFormatting(taggedBody: string): string {
    const blocks = taggedBody.match(/<h>[\s\S]*?<\/h>|<li>[\s\S]*?<\/li>|<p>[\s\S]*?<\/p>/g) || [];

    return blocks.map(block => {
        return block.replace(/<\/?(h|li|p)>/g, '').replace(/\n/g, ' ').trim();
    }).join('\n\n');
}

function formatAndRenumberFootnotes(bodyText: string, footnotes: string[]): { finalBody: string; finalFootnotes: string; count: number } {
    if (footnotes.length === 0) {
        return { finalBody: bodyText, finalFootnotes: '', count: 0 };
    }
    let tempBody = bodyText;
    const finalFootnotes: string[] = [];

    footnotes.forEach((content, index) => {
        const newNumber = index + 1;
        const originalMarkerMatch = content.match(/^([\[\(]?\d{1,3}[\]\)]?|[¹²³⁴⁵⁶⁷⁸⁹⁰]+)/);
        const originalMarker = originalMarkerMatch ? originalMarkerMatch[0] : `[${newNumber}]`;

        const refTag = `{{footnotenumber${newNumber}}}${originalMarker}{{-footnotenumber${newNumber}}}`;
        const defTag = `{{footnote${newNumber}}}${content}{{-footnote${newNumber}}}`;

        tempBody = tempBody.replace(`__FOOTNOTE_REF_${newNumber}__`, refTag);
        finalFootnotes.push(defTag);
    });

    return {
        finalBody: tempBody,
        finalFootnotes: finalFootnotes.join('\n'),
        count: finalFootnotes.length
    };
}

