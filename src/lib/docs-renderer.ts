import * as fs from "node:fs";
import * as path from "node:path";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function renderMarkdownToHtml(markdown: string): { html: string; toc: { id: string; title: string; level: number }[] } {
  const lines = markdown.split(/\r?\n/);
  const toc: { id: string; title: string; level: number }[] = [];
  const htmlParts: string[] = [];

  let inTable = false;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        htmlParts.push(`<pre class="bg-muted p-4 rounded-xl text-xs overflow-x-auto my-4 font-mono"><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        if (inList) { htmlParts.push("</ul>"); inList = false; }
        if (inTable) { htmlParts.push("</tbody></table></div>"); inTable = false; }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inTable) { htmlParts.push("</tbody></table></div>"); inTable = false; }
      htmlParts.push('<hr class="my-8 border-border" />');
      continue;
    }

    // Callout alerts
    if (line.startsWith("> [!IMPORTANT]") || line.startsWith("> [!NOTE]")) {
      const alertType = line.includes("IMPORTANT") ? "important" : "note";
      let alertContent = "";
      while (i + 1 < lines.length && lines[i + 1].startsWith(">")) {
        i++;
        alertContent += " " + lines[i].replace(/^>\s*/, "");
      }
      htmlParts.push(`
        <div class="my-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <p class="font-semibold text-xs tracking-wider uppercase">${alertType}</p>
          <p class="mt-1 text-sm leading-relaxed">${escapeHtml(alertContent.trim())}</p>
        </div>
      `);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inTable) { htmlParts.push("</tbody></table></div>"); inTable = false; }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const id = slugify(title);

      if (level <= 3) {
        toc.push({ id, title, level });
      }

      if (level === 1) {
        htmlParts.push(`<h1 id="${id}" class="text-3xl font-extrabold tracking-tight mt-6 mb-4 text-foreground">${escapeHtml(title)}</h1>`);
      } else if (level === 2) {
        htmlParts.push(`<h2 id="${id}" class="text-2xl font-bold tracking-tight mt-8 mb-3 pb-2 border-b border-border text-foreground">${escapeHtml(title)}</h2>`);
      } else if (level === 3) {
        htmlParts.push(`<h3 id="${id}" class="text-xl font-semibold tracking-tight mt-6 mb-2 text-foreground">${escapeHtml(title)}</h3>`);
      } else {
        htmlParts.push(`<h4 id="${id}" class="text-base font-semibold mt-4 mb-2 text-foreground">${escapeHtml(title)}</h4>`);
      }
      continue;
    }

    // Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cols = line.split("|").slice(1, -1).map((c) => c.trim());
      // Check if separator line
      if (cols.every((c) => /^:?-+:?$/.test(c))) {
        continue;
      }
      if (!inTable) {
        if (inList) { htmlParts.push("</ul>"); inList = false; }
        inTable = true;
        htmlParts.push('<div class="my-4 overflow-x-auto rounded-xl border border-border"><table class="w-full text-left text-sm">');
        htmlParts.push('<thead class="bg-muted text-muted-foreground text-xs uppercase font-medium"><tr>');
        cols.forEach((col) => {
          htmlParts.push(`<th class="px-4 py-3 border-b border-border">${escapeHtml(col)}</th>`);
        });
        htmlParts.push('</tr></thead><tbody class="divide-y divide-border">');
      } else {
        htmlParts.push('<tr class="hover:bg-muted/40 transition-colors">');
        cols.forEach((col) => {
          htmlParts.push(`<td class="px-4 py-3">${escapeHtml(col)}</td>`);
        });
        htmlParts.push("</tr>");
      }
      continue;
    } else if (inTable) {
      htmlParts.push("</tbody></table></div>");
      inTable = false;
    }

    // Unordered lists
    const listMatch = line.match(/^(\s*)[*+-]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        htmlParts.push('<ul class="my-3 space-y-1.5 pl-6 list-disc text-sm text-foreground/90">');
      }
      htmlParts.push(`<li>${escapeHtml(listMatch[2])}</li>`);
      continue;
    } else if (inList) {
      htmlParts.push("</ul>");
      inList = false;
    }

    // Numbered lists
    const numListMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numListMatch) {
      htmlParts.push(`<div class="flex gap-2 my-1.5 text-sm"><span class="font-semibold text-primary">•</span><span>${escapeHtml(numListMatch[1])}</span></div>`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      continue;
    }

    // Plain paragraph
    htmlParts.push(`<p class="my-2.5 text-sm leading-relaxed text-foreground/90">${escapeHtml(line)}</p>`);
  }

  if (inTable) htmlParts.push("</tbody></table></div>");
  if (inList) htmlParts.push("</ul>");

  return { html: htmlParts.join("\n"), toc };
}

export function buildDocumentationPage(): string {
  const mdPath = path.join(process.cwd(), "docs", "user-documentation", "wastage-preparation.md");
  const markdown = fs.readFileSync(mdPath, "utf-8");
  const { html, toc } = renderMarkdownToHtml(markdown);

  const tocHtml = toc
    .map(
      (item) => `
      <a href="#${item.id}" class="block py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ${item.level === 3 ? "pl-4 text-[11px]" : "font-medium"}">
        ${escapeHtml(item.title)}
      </a>
    `
    )
    .join("");

  return `
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <!-- Sidebar Navigation / Table of Contents -->
        <aside class="hidden lg:block lg:col-span-1">
          <div class="sticky top-24 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
              Documentation Contents
            </h3>
            <nav class="space-y-1">
              ${tocHtml}
            </nav>
          </div>
        </aside>

        <!-- Main Documentation Content -->
        <main class="lg:col-span-3">
          <article class="prose prose-neutral dark:prose-invert max-w-none rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-sm">
            ${html}
          </article>
        </main>
      </div>
    </div>
  `;
}

