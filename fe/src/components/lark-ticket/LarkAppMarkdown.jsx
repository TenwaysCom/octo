// Small display-only Markdown subset for Wiki answers. Raw HTML stays text;
// links are restricted to web URLs and no remote images are loaded.
function inline(text) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (["https:", "http:"].includes(url.protocol)) return <a key={index} href={url.href} target="_blank" rel="noreferrer">{link[1]}</a>;
      } catch { /* Unsupported links stay plain text. */ }
    }
    return part;
  });
}

export function LarkAppMarkdown({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const blockKey = i;
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={blockKey}><code>{code.join("\n")}</code></pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={blockKey}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h3>); i++;
    } else if (/^\s*([-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i++].replace(pattern, ""))}</li>);
      }
      blocks.push(ordered ? <ol key={blockKey}>{items}</ol> : <ul key={blockKey}>{items}</ul>);
    } else if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || "")) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const header = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) rows.push(cells(lines[i++]));
      blocks.push(<div className="lark-app__table" key={blockKey}><table><thead><tr>{header.map((cell, j) => <th key={j}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
    } else {
      blocks.push(<p key={blockKey}>{inline(line)}</p>); i++;
    }
  }
  return <div className="lark-app__markdown">{blocks}</div>;
}
