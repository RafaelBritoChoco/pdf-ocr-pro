import { FootnoteAnalysisResult } from "../types";

/**
 * Processa o texto enriquecido com tags da IA e aplica a formatação final.
 * @param enrichedText Texto com tags estruturais (<h>, <p>, <li>, <fn>).
 * @returns O texto final formatado.
 */
export function postProcessFinalText(enrichedText: string): { formattedText: string, footnoteAnalysis: FootnoteAnalysisResult } {
  let currentText = enrichedText;

  // 1. Extrair e formatar notas de rodapé
  const { textWithoutFootnotes, footnotes, footnoteAnalysis } = extractAndFormatFootnotes(currentText);
  currentText = textWithoutFootnotes;

  // 2. Juntar parágrafos e adicionar quebras de linha
  currentText = joinParagraphs(currentText);

  // 3. Remover tags restantes e limpar espaços
  currentText = currentText.replace(/<h>|<\/h>|<li>|<\/li>|<p>|<\/p>/g, "").trim();

  return { formattedText: currentText, footnoteAnalysis };
}

function extractAndFormatFootnotes(text: string): { textWithoutFootnotes: string, footnotes: string[], footnoteAnalysis: FootnoteAnalysisResult } {
  const footnoteRegex = /<fn>([\s\S]*?)<\/fn>/g;
  const extractedFootnotes: string[] = [];
  let textWithoutFootnotes = text;
  let match;
  let footnoteCount = 0;

  // Extrair e substituir tags <fn> por marcadores temporários
  while ((match = footnoteRegex.exec(textWithoutFootnotes)) !== null) {
    const originalFootnoteContent = match[1];
    footnoteCount++;
    extractedFootnotes.push(originalFootnoteContent);
    // Substituir a tag <fn> por um marcador que será formatado depois
    textWithoutFootnotes = textWithoutFootnotes.replace(match[0], `{{footnotenumber${footnoteCount}}}`);
  }

  // Formatar e renumerar as notas de rodapé extraídas
  const formattedFootnotes = formatAndRenumberFootnotes(extractedFootnotes);

  // Adicionar as notas de rodapé formatadas ao final do documento
  if (formattedFootnotes.length > 0) {
    textWithoutFootnotes += "\n\n--- FOOTNOTES ---\n\n" + formattedFootnotes.join("\n");
  }

  const footnoteAnalysis: FootnoteAnalysisResult = {
    count: footnoteCount,
    pages: [] // A análise de página para footnotes é feita em usePdfProcessor
  };

  return { textWithoutFootnotes, footnotes: extractedFootnotes, footnoteAnalysis };
}

function joinParagraphs(text: string): string {
  // Divide o texto em blocos baseados nas tags estruturais
  const blocks = text.split(/(<h>.*?<\/h>)|(<li>.*?<\/li>)|(<p>.*?<\/p>)/g).filter(Boolean);
  let result = [];

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    if (!block) continue;

    // Se for um parágrafo, extrai o conteúdo e o adiciona
    if (block.startsWith("<p>") && block.endsWith("</p>")) {
      result.push(block.replace(/<p>|<\/p>/g, "").trim());
      // Adiciona uma quebra de linha dupla entre parágrafos
      if (i < blocks.length - 1 && blocks[i+1] && blocks[i+1].startsWith("<p>")) {
        result.push("\n\n");
      }
    } else if (block.startsWith("<li>") && block.endsWith("</li>")) {
      result.push(block.replace(/<li>|<\/li>/g, "").trim());
      // Adiciona uma quebra de linha simples entre itens de lista
      if (i < blocks.length - 1 && blocks[i+1] && blocks[i+1].startsWith("<li>")) {
        result.push("\n");
      }
    } else if (block.startsWith("<h>") && block.endsWith("</h>")) { // Generic <h> tag
      result.push(block.replace(/<h>|<\/h>/g, "").trim());
      result.push("\n\n"); // Quebra de linha dupla após cabeçalhos
    }
  }
  return result.join("");
}

function formatAndRenumberFootnotes(footnotes: string[]): string[] {
  return footnotes.map((fn, index) => {
    const footnoteNumber = index + 1;
    // Remove o marcador original da nota de rodapé se existir no início
    const cleanedFn = fn.replace(/^\s*\d+\s*|\s*\*\s*|\s*\[\d+\]\s*|\s*\(\d+\)\s*|\s*[a-zA-Z]\s*/, "").trim();
    return `{{footnote${footnoteNumber}}} ${cleanedFn} {{-footnote${footnoteNumber}}}`;
  });
}


