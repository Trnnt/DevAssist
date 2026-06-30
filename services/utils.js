/**
 * Utility Helpers
 * Shared utility functions for security, string parsing, and DOM safety.
 */

/**
 * Escapes special HTML characters to prevent XSS (Cross-Site Scripting).
 * @param {string} str - The unsanitized string.
 * @returns {string} The escaped safe HTML string.
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses simple markdown (bold, italic, lists) into safe DOM nodes.
 * Completely eliminates innerHTML usage for AI outputs.
 * Supports:
 * - Double newlines (\n\n) as paragraph blocks
 * - Bullet points (e.g., "•", "-") as list items
 * - Numbered points (e.g., "1.") as numbered items
 * - Bold text (**text**)
 * - Italic text (*text*)
 *
 * @param {string} markdown - Raw markdown text
 * @returns {DocumentFragment} Safe document fragment
 */
export function parseMarkdownToDOM(markdown) {
  const fragment = document.createDocumentFragment();
  if (!markdown) return fragment;

  // Extract code blocks to prevent them from being mangled by block splitting
  const codeBlocks = [];
  let processedMarkdown = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ id, language, code });
    return `\n\n${id}\n\n`;
  });

  // Split into blocks by double newlines or single newlines that separate list items
  const blocks = processedMarkdown.split(/\n\n/);

  blocks.forEach((block) => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return;

    // Check if it's a code block placeholder
    const blockMatch = trimmedBlock.match(/^__CODE_BLOCK_(\d+)__$/);
    if (blockMatch) {
      const codeData = codeBlocks[blockMatch[1]];
      if (codeData.language && codeData.language.toLowerCase() === 'mermaid') {
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = codeData.code.trim();
        fragment.appendChild(div);
      } else {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        if (codeData.language) {
          code.className = `language-${codeData.language}`;
        }
        code.textContent = codeData.code.trim();
        pre.appendChild(code);
        fragment.appendChild(pre);
      }
      return;
    }

    // Check if the block consists of multiple list items separated by single newlines
    const lines = trimmedBlock.split('\n');
    const isBulletList = lines.every(line => /^[•\-*]\s/.test(line.trim()));
    const isNumList = lines.every(line => /^\d+\.\s/.test(line.trim()));

    if (isBulletList) {
      const ul = document.createElement('ul');
      ul.className = 'ai-list';
      lines.forEach((line) => {
        const li = document.createElement('li');
        const content = line.trim().replace(/^[•\-*]\s/, '');
        parseInlineElements(content, li);
        ul.appendChild(li);
      });
      fragment.appendChild(ul);
    } else if (isNumList) {
      const ol = document.createElement('ol');
      ol.className = 'ai-list ai-num-list';
      lines.forEach((line) => {
        const li = document.createElement('li');
        const match = line.trim().match(/^(\d+)\.\s(.*)/);
        if (match) {
          li.setAttribute('value', match[1]);
          parseInlineElements(match[2], li);
        } else {
          parseInlineElements(line.trim(), li);
        }
        ol.appendChild(li);
      });
      fragment.appendChild(ol);
    } else {
      // Regular paragraph or mixed lines
      const p = document.createElement('p');
      p.className = 'ai-paragraph';
      
      // Process single newlines inside a paragraph as line breaks
      lines.forEach((line, index) => {
        if (index > 0) {
          p.appendChild(document.createElement('br'));
        }
        // Check if individual line looks like a list item (mixed paragraph + lists fallback)
        const trimmedLine = line.trim();
        if (/^[•\-*]\s/.test(trimmedLine)) {
          const span = document.createElement('span');
          span.className = 'ai-bullet';
          span.textContent = '• ';
          p.appendChild(span);
          parseInlineElements(trimmedLine.replace(/^[•\-*]\s/, ''), p);
        } else if (/^\d+\.\s/.test(trimmedLine)) {
          const match = trimmedLine.match(/^(\d+\.)\s(.*)/);
          const span = document.createElement('span');
          span.className = 'ai-num';
          span.textContent = match ? match[1] + ' ' : '';
          p.appendChild(span);
          parseInlineElements(match ? match[2] : trimmedLine, p);
        } else {
          parseInlineElements(line, p);
        }
      });
      fragment.appendChild(p);
    }
  });

  return fragment;
}

/**
 * Tokenizes and parses inline elements (**bold**, *italic*) and appends them to parent.
 * @param {string} text - Plain text containing markdown inline tokens
 * @param {HTMLElement} parentElement - Target parent node
 */
function parseInlineElements(text, parentElement) {
  // Regex to find bold (**text**) and italic (*text*)
  // We tokenize the string by splitting and matching
  const tokenRegex = /(\*\*.*?\*\*|\*.*?\*)/g;
  const parts = text.split(tokenRegex);

  parts.forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parentElement.appendChild(strong);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      const em = document.createElement('em');
      em.textContent = part.slice(1, -1);
      parentElement.appendChild(em);
    } else if (part) {
      parentElement.appendChild(document.createTextNode(part));
    }
  });
}

/**
 * Animates a numeric count-up on an element.
 * @param {HTMLElement} element - Target element
 * @param {number} target - Target value
 * @param {number} duration - Duration in ms
 */
export function animateCountUp(element, target, duration = 200) {
  if (!element || isNaN(target)) return;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out quad formula
    const easeProgress = progress * (2 - progress);
    const currentValue = Math.floor(start + (target - start) * easeProgress);
    
    element.textContent = currentValue.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}
