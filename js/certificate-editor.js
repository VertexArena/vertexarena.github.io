import { sources, fonts, readTemplate, renderCertificate, pngBlob, pdfBlob, downloadBlob } from './certificate-renderer.js';
const options = (items, value, h) => Object.entries(items).map(([key, label]) => `<option value="${h(key)}" ${key === value ? 'selected' : ''}>${h(label)}</option>`).join('');
export function editorView({ c, template: t, settings, rounds, h, types }) {
  const locked = settings?.enabled;
  return `<div class="page certificate-page certificate-editor-page"><a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/certificates"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All templates</a><header class="certificate-editor-head"><div><span class="eyebrow">Certificate studio / layout editor</span><h1>${h(t.name)}</h1><p>${locked ? 'Release is active. Pause it in the studio to edit this template.' : 'Drag fields on the artwork. Resize with the corner handle; arrow keys move the selected field.'}</p></div><div><span data-save-state>${t.ready ? 'Ready template' : 'Draft template'}</span><button class="button primary" data-save-certificate ${locked ? 'disabled' : ''}>Save layout</button></div></header><p class="form-status" role="status" data-editor-status></p><div class="certificate-editor-grid"><section class="certificate-workbench" aria-label="Certificate artwork"><div class="certificate-toolbar"><label class="field"><span>Dynamic field</span><select data-add-source>${options(sources, 'participant_name', h)}</select></label><button class="button secondary" data-add-field ${locked ? 'disabled' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add field</button><label class="field certificate-sample"><span>Preview name</span><select data-sample-name><option value="sample">Alex Morgan</option><option value="organiser">Your full name</option></select></label><button class="button text" data-refresh-sample>New sample</button></div><div class="certificate-canvas-wrap"><div class="certificate-stage" style="aspect-ratio:${t.width}/${t.height}" data-certificate-stage><canvas role="img" aria-label="Certificate layout preview"></canvas><div class="certificate-field-overlays"></div></div></div><div class="certificate-canvas-footer"><span>${t.width} × ${t.height} px · ${t.layout.length} fields</span><button class="button text" data-toggle-outlines>Hide field outlines</button></div><div class="certificate-preview-controls"><button class="button secondary" data-editor-export="png">Download sample image</button><button class="button secondary" data-editor-export="pdf">Download sample PDF</button></div><p class="certificate-help">Text wraps and fits inside its box. Preview and downloads use the same typography and placement. Blank values remain blank on real certificates.</p></section><aside class="certificate-inspector"><section><span class="eyebrow">Selected field</span><h2>Text &amp; placement.</h2><div data-field-inspector></div></section><section><h2>Fields.</h2><div class="certificate-layers" data-certificate-layers></div></section><section><h2>Award settings.</h2><form data-template-settings><fieldset ${locked ? 'disabled' : ''}><label class="field"><span>Template name</span><input name="name" value="${h(t.name)}" maxlength="100" required></label><label class="field"><span>Award title</span><input name="award_title" value="${h(t.award_title)}" maxlength="160" required></label><label class="field"><span>Eligibility</span><select name="template_type">${options(types, t.template_type, h)}</select></label><label class="field"><span>Result round</span><select name="round_id"><option value="">Latest matching published round</option>${rounds.map(r => `<option value="${r.id}" ${t.round_id === r.id ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select></label><label class="field" data-custom-tag ${t.template_type !== 'custom_tag' ? 'hidden' : ''}><span>Required eligibility tag</span><input name="required_tag" value="${h(t.required_tag || 'finalist')}" pattern="[a-z0-9_]{1,50}" maxlength="50"><small>Use a saved result tag, such as top_30, finalist or winner.</small></label><div class="certificate-control-pair" data-placement-range ${t.template_type !== 'placement' ? 'hidden' : ''}><label class="field"><span>First placement</span><input name="placement_min" type="number" min="1" max="1000000" value="${t.placement_min || 1}"></label><label class="field"><span>Last placement</span><input name="placement_max" type="number" min="1" max="1000000" value="${t.placement_max || 3}"></label></div><label class="certificate-ready"><input type="checkbox" name="ready" ${t.ready ? 'checked' : ''}><span>Ready for release<small>Requires a participant full name field.</small></span></label><label class="field"><span>Replace artwork</span><input type="file" data-replace-artwork accept="image/png,image/jpeg,image/webp"><small>Positions scale to the new image. Save to keep the replacement.</small></label></fieldset></form></section></aside></div></div>`;
}
export function bindEditor({ c, template, settings, rounds, organisation, organiserName, h, client, result, uploadImage, message }) {
  const t = structuredClone(template), locked = !!settings?.enabled;
  const stage = document.querySelector('[data-certificate-stage]'), canvas = stage.querySelector('canvas'), overlays = stage.querySelector('.certificate-field-overlays');
  const inspector = document.querySelector('[data-field-inspector]'), layers = document.querySelector('[data-certificate-layers]'), status = document.querySelector('[data-editor-status]'), form = document.querySelector('[data-template-settings]'), save = document.querySelector('[data-save-certificate]');
  let selected = t.layout[0]?.id, dirty = false, busy = false, disposed = false, decoded, renderRevision = 0, drag = null, outlines = true, sampleIndex = 0, pendingPath = null, originalPath = t.storage_path;
  const setBusy = value => { busy = value; document.querySelector('.certificate-editor-grid')?.toggleAttribute('inert', value); save.disabled = value || locked; };
  const controller = new AbortController(), on = (node, event, handler) => node?.addEventListener(event, handler, { signal: controller.signal });
  const chosen = () => t.layout.find(f => f.id === selected);
  const mark = () => { dirty = true; document.querySelector('[data-save-state]').textContent = 'Unsaved changes'; };
  const sample = () => ({ participant_name: document.querySelector('[data-sample-name]').value === 'organiser' ? organiserName : 'Alex Morgan', team_name: 'Team Horizon', competition_name: c.name, organisation_name: organisation?.name || '', category: c.categories?.[sampleIndex % c.categories.length] || '', placement: String(sampleIndex % 3 + 1), round: rounds.find(r => r.id === t.round_id)?.name || rounds.at(-1)?.name || '', award_title: t.award_title, issue_date: new Date().toISOString().slice(0,10) });
  function drawBoxes() {
    overlays.hidden = !outlines;
    overlays.innerHTML = t.layout.map(f => `<div class="certificate-field-box ${selected === f.id ? 'selected' : ''}" data-field-id="${f.id}" tabindex="0" role="group" aria-current="${selected === f.id}" aria-label="${h(sources[f.source])}; arrow keys move, Shift moves ten pixels" style="left:${f.x / t.width * 100}%;top:${f.y / t.height * 100}%;width:${f.width / t.width * 100}%;height:${f.height / t.height * 100}%"><span>${h(sources[f.source])}</span>${selected === f.id && !locked ? '<button type="button" class="certificate-resize" aria-label="Resize selected field" title="Drag to resize; press Enter for size controls"></button>' : ''}</div>`).join('');
    layers.innerHTML = t.layout.length ? t.layout.map(f => `<button class="certificate-layer ${selected === f.id ? 'selected' : ''}" data-select-field="${f.id}" aria-pressed="${selected === f.id}"><i class="fa-solid fa-font" aria-hidden="true"></i>${h(sources[f.source])}</button>`).join('') : '<p>Add a dynamic field to start your layout.</p>';
    document.querySelector('.certificate-canvas-footer span').textContent = `${t.width} × ${t.height} px · ${t.layout.length} fields`;
  }
  async function draw() {
    drawBoxes(); if (!decoded) return;
    const revision = ++renderRevision, offscreen = document.createElement('canvas');
    await renderCertificate(offscreen, decoded.image, structuredClone(t), sample());
    if (disposed || revision !== renderRevision) return;
    canvas.width = t.width; canvas.height = t.height; canvas.getContext('2d').drawImage(offscreen, 0, 0);
  }
  function controls() {
    const f = chosen();
    if (!f) { inspector.innerHTML = '<p>Choose a field on the artwork or add one above.</p>'; return; }
    inspector.innerHTML = `<fieldset ${locked ? 'disabled' : ''}><label class="field"><span>Value source</span><select data-prop="source">${options(sources, f.source, h)}</select></label><label class="field"><span>Font</span><select data-prop="font">${options(Object.fromEntries(fonts.map(name => [name, name])), f.font, h)}</select></label><div class="certificate-control-pair"><label class="field"><span>Font size (px)</span><input data-prop="size" type="number" min="8" max="240" step="1" value="${f.size}"></label><label class="field"><span>Colour</span><input data-prop="colour" type="color" value="${h(f.colour)}"></label></div><div class="certificate-control-pair"><label class="field"><span>Alignment</span><select data-prop="align">${options({left:'Left',center:'Centre',right:'Right'}, f.align, h)}</select></label><label class="field"><span>Weight</span><select data-prop="weight">${options({400:'Regular',700:'Bold'}, String(f.weight), h)}</select></label></div>${[['x','Left (px)'],['y','Top (px)'],['width','Width (px)'],['height','Height (px)']].map(([key,label],i) => `${i % 2 === 0 ? '<div class="certificate-control-pair">' : ''}<label class="field"><span>${label}</span><input data-prop="${key}" type="number" min="${['width','height'].includes(key) ? 10 : 0}" step="1" value="${Math.round(f[key])}"></label>${i % 2 === 1 ? '</div>' : ''}`).join('')}<button class="button text" data-remove-field>Remove field</button></fieldset>`;
  }
  function clamp(f) {
    f.size = Math.max(8, Math.min(240, f.size)); f.width = Math.max(10, Math.min(t.width, f.width)); f.height = Math.max(10, Math.min(t.height, f.height));
    f.x = Math.max(0, Math.min(t.width - f.width, f.x)); f.y = Math.max(0, Math.min(t.height - f.height, f.y));
  }
  on(inspector, 'change', event => {
    const key = event.target.dataset.prop, f = chosen(); if (!key || !f || locked) return;
    if (event.target.type === 'number' && !event.target.checkValidity()) { controls(); return; }
    f[key] = ['x','y','width','height','size','weight'].includes(key) ? Number(event.target.value) : event.target.value;
    clamp(f); mark(); controls(); draw();
  });
  on(inspector, 'click', event => { if (event.target.closest('[data-remove-field]') && !locked) { t.layout = t.layout.filter(f => f.id !== selected); selected = t.layout[0]?.id; mark(); controls(); draw(); } });
  on(layers, 'click', event => { const button = event.target.closest('[data-select-field]'); if (button) { selected = button.dataset.selectField; controls(); drawBoxes(); } });
  on(document.querySelector('[data-add-field]'), 'click', () => {
    if (locked) return; if (t.layout.length >= 30) { message(status, 'Use up to 30 fields per template.', true); return; }
    const f = { id: crypto.randomUUID(), source: document.querySelector('[data-add-source]').value, x: Math.round(t.width * .15), y: Math.round(t.height * (.35 + Math.min(t.layout.length, 5) * .08)), width: Math.round(t.width * .7), height: Math.round(t.height * .1), size: Math.max(8, Math.min(240, Math.round(t.width / 30))), font: 'Geist', weight: 400, colour: '#0f172a', align: 'center' };
    clamp(f); t.layout.push(f); selected = f.id; mark(); controls(); draw();
  });
  on(stage, 'pointerdown', event => {
    const box = event.target.closest('[data-field-id]'); if (!box) return;
    selected = box.dataset.fieldId; controls(); if (locked) { drawBoxes(); return; }
    event.preventDefault(); const f = chosen(), rect = stage.getBoundingClientRect();
    drag = { pointer: event.pointerId, resize: !!event.target.closest('.certificate-resize'), x: event.clientX, y: event.clientY, initial: { ...f }, sx: t.width / rect.width, sy: t.height / rect.height };
    stage.setPointerCapture(event.pointerId); drawBoxes();
  });
  on(stage, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const f = chosen(), dx = Math.round((event.clientX - drag.x) * drag.sx), dy = Math.round((event.clientY - drag.y) * drag.sy);
    if (drag.resize) { f.width = Math.max(10, Math.min(t.width - f.x, drag.initial.width + dx)); f.height = Math.max(10, Math.min(t.height - f.y, drag.initial.height + dy)); }
    else { f.x = drag.initial.x + dx; f.y = drag.initial.y + dy; clamp(f); }
    mark(); draw();
  });
  const endDrag = () => { if (drag) { drag = null; controls(); } };
  on(stage, 'pointerup', endDrag); on(stage, 'pointercancel', endDrag);
  on(stage, 'keydown', event => {
    const box = event.target.closest('[data-field-id]'); if (!box || locked || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key)) return;
    event.preventDefault(); selected = box.dataset.fieldId;
    if (event.target.closest('.certificate-resize') && ['Enter',' '].includes(event.key)) { controls(); inspector.querySelector('[data-prop=width]')?.focus(); return; }
    const f = chosen(), delta = event.shiftKey ? 10 : 1;
    if (event.key.startsWith('Arrow')) { if (event.key === 'ArrowLeft') f.x -= delta; if (event.key === 'ArrowRight') f.x += delta; if (event.key === 'ArrowUp') f.y -= delta; if (event.key === 'ArrowDown') f.y += delta; clamp(f); mark(); }
    controls(); draw(); stage.querySelector(`[data-field-id="${selected}"]`)?.focus({ preventScroll: true });
  });
  on(form, 'submit', event => event.preventDefault());
  on(form, 'input', event => {
    if (!event.target.name || locked) return;
    const key = event.target.name;
    t[key] = event.target.type === 'checkbox' ? event.target.checked : ['placement_min','placement_max'].includes(key) ? Number(event.target.value) : key === 'round_id' ? event.target.value || null : event.target.value;
    form.querySelector('[data-custom-tag]').hidden = t.template_type !== 'custom_tag'; form.querySelector('[data-placement-range]').hidden = t.template_type !== 'placement';
    mark(); draw();
  });
  on(document.querySelector('[data-sample-name]'), 'change', draw);
  on(document.querySelector('[data-refresh-sample]'), 'click', () => { sampleIndex = Math.floor(Math.random() * 1000); draw(); });
  on(document.querySelector('[data-toggle-outlines]'), 'click', event => { outlines = !outlines; event.currentTarget.textContent = outlines ? 'Hide field outlines' : 'Show field outlines'; drawBoxes(); });
  on(document.querySelector('[data-replace-artwork]'), 'change', async event => {
    const file = event.target.files[0]; if (!file || locked) return;
    setBusy(true); let image;
    try {
      message(status, 'Uploading replacement artwork…'); image = await uploadImage(file, c.id, t.id);
      const next = await readTemplate(await result(client.storage.from('certificate-templates').download(image.storage_path)));
      if (disposed) { next.dispose(); await client.storage.from('certificate-templates').remove([image.storage_path]); return; }
      const sx = image.width / t.width, sy = image.height / t.height;
      t.layout.forEach(f => { f.x = Math.round(f.x * sx); f.y = Math.round(f.y * sy); f.width = Math.round(f.width * sx); f.height = Math.round(f.height * sy); f.size = Math.max(8, Math.min(240, Math.round(f.size * sx))); });
      if (pendingPath) await result(client.storage.from('certificate-templates').remove([pendingPath]));
      pendingPath = image.storage_path; Object.assign(t, image); t.layout.forEach(clamp); decoded?.dispose(); decoded = next;
      stage.style.aspectRatio = `${t.width}/${t.height}`; mark(); controls(); await draw(); message(status, 'Artwork replaced. Save layout to keep it.');
    } catch (error) { if (image && pendingPath !== image.storage_path) await client.storage.from('certificate-templates').remove([image.storage_path]); message(status, error.message, true); }
    finally { setBusy(false); }
  });
  on(save, 'click', async () => {
    if (locked || busy || !form.reportValidity()) return; setBusy(true);
    try {
      const saved = await result(client.rpc('save_certificate_template', { target_competition_id: c.id, target_template_id: t.id, details: t, expected_version: t.version }));
      Object.assign(t, saved); dirty = false; document.querySelector('[data-save-state]').textContent = t.ready ? 'Ready template' : 'Draft template';
      document.querySelector('.certificate-editor-head h1').textContent = t.name;
      if (pendingPath) { const old = originalPath; originalPath = pendingPath; pendingPath = null; await result(client.storage.from('certificate-templates').remove([old])); }
      message(status, 'Layout saved.');
    } catch (error) { message(status, error.message, true); }
    finally { setBusy(false); }
  });
  document.querySelectorAll('[data-editor-export]').forEach(button => on(button, 'click', async () => {
    if (!decoded) return; button.disabled = true;
    try { const output = document.createElement('canvas'); await renderCertificate(output, decoded.image, t, sample()); const format = button.dataset.editorExport; downloadBlob(format === 'pdf' ? await pdfBlob(output) : await pngBlob(output), `sample-certificate.${format}`); message(status, 'Sample downloaded.'); }
    catch (error) { message(status, error.message, true); } finally { button.disabled = false; }
  }));
  const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  controls(); drawBoxes(); message(status, 'Loading artwork…');
  result(client.storage.from('certificate-templates').download(t.storage_path)).then(readTemplate).then(async image => {
    if (disposed) { image.dispose(); return; } decoded = image; await draw(); message(status, 'Artwork ready.');
  }).catch(error => message(status, error.message, true));
  return {
    canLeave: () => { if (busy) { message(status, 'Wait for the upload or save to finish.'); return false; } return !dirty || confirm('Discard unsaved certificate changes?'); },
    dispose: () => { disposed = true; controller.abort(); decoded?.dispose(); removeEventListener('beforeunload', beforeUnload); if (pendingPath) client.storage.from('certificate-templates').remove([pendingPath]); }
  };
}
