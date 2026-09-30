export const sources = { participant_name: 'Participant full name', team_name: 'Team name', competition_name: 'Competition name', organisation_name: 'Organisation name', category: 'Category', placement: 'Placement', round: 'Round', award_title: 'Award title', issue_date: 'Issue date' };
export const fonts = ['Geist', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
export async function readTemplate(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth < 100 || image.naturalHeight < 100 || image.naturalWidth > 6000 || image.naturalHeight > 6000 || image.naturalWidth * image.naturalHeight > 16000000) throw new Error('Use an image 100–6000 pixels per side, with at most 16 million pixels.');
    return { image, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
// Every output shares this renderer. Long values wrap and shrink within the field box.
export async function renderCertificate(canvas, image, template, values) {
  await Promise.all(template.layout.map(f => document.fonts.load(`${f.weight} ${f.size}px "${f.font}"`)));
  canvas.width = template.width; canvas.height = template.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const field of template.layout) {
    const text = String(values[field.source] || ''); let size = field.size, lines;
    const wrap = () => {
      ctx.font = `${field.weight} ${size}px "${field.font}"`;
      const rows = []; let line = '';
      for (const word of text.split(/\s+/)) {
        if (ctx.measureText(word).width > field.width) {
          if (line) { rows.push(line); line = ''; }
          for (const char of word) { if (ctx.measureText(line + char).width > field.width && line) { rows.push(line); line = ''; } line += char; }
        } else if (line && ctx.measureText(`${line} ${word}`).width > field.width) { rows.push(line); line = word; }
        else line += `${line ? ' ' : ''}${word}`;
      }
      if (line) rows.push(line); return rows;
    };
    do { lines = wrap(); if (lines.length * size * 1.2 <= field.height) break; size -= 1; } while (size >= 1);
    ctx.save(); ctx.beginPath(); ctx.rect(field.x, field.y, field.width, field.height); ctx.clip();
    ctx.fillStyle = field.colour; ctx.textAlign = field.align; ctx.textBaseline = 'middle';
    const x = field.x + (field.align === 'center' ? field.width / 2 : field.align === 'right' ? field.width : 0);
    const y = field.y + (field.height - lines.length * size * 1.2) / 2 + size * .6;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.2)); ctx.restore();
  }
  return canvas;
}
export const pngBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image generation failed.')), 'image/png'));
let pdfLibrary;
export async function pdfBlob(canvas) {
  pdfLibrary ||= import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm').catch(error => { pdfLibrary = null; throw new Error(`PDF library could not load. Check your connection and retry. ${error.message}`); });
  const { PDFDocument } = await pdfLibrary;
  const document = await PDFDocument.create();
  const image = await document.embedPng(await (await pngBlob(canvas)).arrayBuffer());
  const page = document.addPage([canvas.width * .75, canvas.height * .75]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return new Blob([await document.save()], { type: 'application/pdf' });
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
