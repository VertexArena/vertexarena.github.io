const types = { participation: 'Participation', top_100: 'Top 100', finalist: 'Finalist', winner: 'Overall winner', category_winner: 'Category winner', custom_tag: 'Custom eligibility tag', placement: 'Placement range' };
export function createCertificates({ client, state, escapeHtml: h, navigate, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const managerPath = slug => `/organiser/competition/${slug}/certificates`;
  const message = (node, text, error = false) => { if (!node?.isConnected) return; node.textContent = text; node.dataset.state = error ? 'error' : 'success'; };
  const options = (items, value) => Object.entries(items).map(([key, label]) => `<option value="${h(key)}" ${key === value ? 'selected' : ''}>${h(label)}</option>`).join('');
  let active, editor, editorModule, disposed = false, epoch = 0;
  const back = c => `<a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)} workspace</a>`;
  const status = '<p class="form-status" role="status" data-certificate-status></p>';
  async function resolve(path) {
    const manager = path.match(/^\/organiser\/competition\/([a-z0-9-]+)\/certificates(?:\/([0-9a-f-]{36}))?$/);
    const participant = path.match(/^\/competition\/([a-z0-9-]+)\/certificates$/);
    if (!manager && !participant) return undefined;
    if (!state.session) return { protected: true };
    const c = await result(client.from('competitions').select('id,name,slug,categories,organisation_id,certificates_available_at,status').eq('slug', (manager || participant)[1]).maybeSingle());
    if (!c) return null;
    disposed = false;
    try {
      if (manager) {
        if (!await result(client.rpc('can_manage_competition', { target_competition_id: c.id }))) throw new Error('Only competition organisers can manage certificates.');
        const [templates, settings, rounds] = await Promise.all([
          result(client.from('certificate_templates').select('*').eq('competition_id', c.id).order('updated_at')),
          result(client.from('competition_certificate_settings').select('*').eq('competition_id', c.id).maybeSingle()),
          result(client.from('competition_rounds').select('id,name,sequence,judging_state,leaderboard_state').eq('competition_id', c.id).order('sequence'))
        ]);
        active = { c, templates, settings, rounds, manager: true };
        if (manager[2]) {
          const template = templates.find(t => t.id === manager[2]); if (!template) return null;
          const organisation = c.organisation_id ? await result(client.from('organisations').select('name').eq('id', c.organisation_id).maybeSingle()) : null;
          editorModule ||= await import('./certificate-editor.js');
          active.template = template; active.organisation = organisation;
          return { title: `${template.name} editor - Vertex`, content: editorModule.editorView({ ...active, organiserName: state.profile.full_name, h, types }) };
        }
        const final = rounds.at(-1), enabled = !!settings?.enabled;
        const canRelease = final?.judging_state === 'finalised' && final.leaderboard_state === 'published' && templates.some(t => t.ready) && (!c.certificates_available_at || Date.parse(c.certificates_available_at) <= Date.now()) && c.status === 'published';
        return { title: 'Certificate studio - Vertex', content: `<div class="page certificate-page">${back(c)}<header class="page-head compact-head"><span class="eyebrow">Awards / certificate studio</span><h1>Make recognition personal.</h1><p>Place dynamic fields on your artwork. Each eligible participant receives a certificate with their full name.</p></header><section class="certificate-release"><div><span class="eyebrow">Participant access</span><h2>${enabled ? 'Certificates released.' : 'Release is paused.'}</h2><p>${enabled ? 'Eligible participants can preview and download their awards. Pause to edit templates.' : 'Publish final results and finish at least one template before releasing certificates.'}${c.certificates_available_at ? ` Availability date: ${h(new Date(c.certificates_available_at).toLocaleString())}.` : ''}</p></div><button class="button ${enabled ? 'secondary' : 'primary'}" data-certificate-release="${!enabled}" ${!enabled && !canRelease ? 'disabled' : ''}>${enabled ? 'Pause release' : 'Release certificates'}</button></section>${status}<div class="certificate-studio-grid"><section><div class="certificate-section-head"><h2>Templates.</h2><span>${templates.length} saved</span></div><div class="certificate-template-list">${templates.length ? templates.map(t => `<article class="certificate-template-card" data-template-id="${h(t.id)}"><span class="certificate-template-symbol"><i class="fa-solid fa-certificate" aria-hidden="true"></i></span><div><span class="eyebrow">${h(types[t.template_type])} · ${t.ready ? 'Ready' : 'Draft'}</span><h3>${h(t.name)}</h3><p>${h(t.award_title)} · ${t.width} × ${t.height} px · ${t.layout.length} fields</p></div><div class="certificate-card-actions"><a class="button secondary" data-link href="${managerPath(c.slug)}/${t.id}">${enabled ? 'View layout' : 'Edit layout'}</a><button class="button text" data-delete-template="${t.id}" ${enabled ? 'disabled' : ''} aria-label="Delete ${h(t.name)}">Delete</button></div></article>`).join('') : '<div class="certificate-empty"><h3>Your first award starts here.</h3><p>Upload certificate artwork, then add the participant name and competition details.</p></div>'}</div></section><aside class="certificate-upload-panel"><span class="eyebrow">New template</span><h2>Bring your artwork.</h2><p>PNG, JPEG or WebP. Up to 10 MB; 100–6000 pixels per side, at most 16 million pixels.</p><form data-certificate-upload><label class="field"><span>Template name</span><input name="name" required maxlength="100" placeholder="Participation certificate" ${enabled ? 'disabled' : ''}></label><label class="field"><span>Award title</span><input name="award_title" required maxlength="160" placeholder="Certificate of participation" ${enabled ? 'disabled' : ''}></label><label class="field"><span>Eligibility</span><select name="template_type" ${enabled ? 'disabled' : ''}>${options(types, 'participation')}</select></label><label class="field"><span>Template image</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp" required ${enabled ? 'disabled' : ''}></label><button class="button primary" type="submit" ${enabled ? 'disabled' : ''}>Upload and edit <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><p class="form-status" role="status"></p></form></aside></div></div>` };
      }
      const data = await result(client.rpc('my_competition_certificates', { target_competition_id: c.id }));
      active = { c, manager: false };
      return { title: `Certificates - ${c.name}`, content: `<div class="page certificate-page"><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><header class="page-head compact-head"><span class="eyebrow">Your awards</span><h1>A record of your work.</h1><p>Certificates use your full name: <strong>${h(state.profile.full_name)}</strong>. Eligible awards are based on your registration and published results.</p></header>${status}<div class="certificate-awards">${data.templates.length ? data.templates.map(t => `<article class="certificate-award" data-award="${h(t.id)}"><span class="certificate-template-symbol"><i class="fa-solid fa-award" aria-hidden="true"></i></span><span class="eyebrow">${h(types[t.template_type])}</span><h2>${h(t.award_title)}</h2><p>${h(t.name)}</p><div class="certificate-download-actions"><button class="button secondary" data-certificate-preview="${t.id}">Preview</button><button class="button primary" data-certificate-download="${t.id}" data-format="png">Download image</button><button class="button secondary" data-certificate-download="${t.id}" data-format="pdf">Download PDF</button></div></article>`).join('') : `<section class="certificate-empty"><i class="fa-solid fa-certificate" aria-hidden="true"></i><h2>${data.released ? 'No eligible awards yet.' : 'Certificates are not released yet.'}</h2><p>${data.released ? 'No released template matches your registration or published result.' : 'The organiser enables certificate access after final results are published.'}</p></section>`}</div><section class="certificate-preview-panel" hidden aria-label="Certificate preview"><h2>Your certificate.</h2><canvas aria-label="Personalised certificate preview" role="img"></canvas><button class="button secondary" data-close-certificate-preview>Close preview</button></section></div>` };
    } catch (error) { active = null; return { title: 'Certificates unavailable - Vertex', content: `<div class="page notice-page"><h1>Certificates unavailable.</h1><p>${h(error.message)}</p><a class="button secondary" data-link href="/competition/${h(c.slug)}">Back to competition</a></div>` }; }
  }
  async function uploadImage(file, compId, templateId) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10485760) throw new Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
    const { readTemplate } = await import('./certificate-renderer.js');
    const decoded = await readTemplate(file), width = decoded.image.naturalWidth, height = decoded.image.naturalHeight; decoded.dispose();
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
    const storage_path = `${compId}/${templateId}/${crypto.randomUUID()}.${extension}`;
    await result(client.storage.from('certificate-templates').upload(storage_path, file, { contentType: file.type, upsert: false }));
    return { storage_path, width, height };
  }
  function bind() {
    if (!document.querySelector('.certificate-page')) return;
    disposed = false;
    if (active?.template) {
      editor = editorModule.bindEditor({ ...active, organiserName: state.profile.full_name, h, client, result, uploadImage, types, message, navigate, managerPath });
      return;
    }
    const statusNode = document.querySelector('[data-certificate-status]');
    document.querySelector('[data-certificate-release]')?.addEventListener('click', async event => {
      const button = event.currentTarget, enabled = button.dataset.certificateRelease === 'true';
      if (enabled && !confirm('Release eligible certificates to participants?')) return;
      button.disabled = true;
      try { await result(client.rpc('set_certificate_release', { target_competition_id: active.c.id, enable_release: enabled })); await refresh(); }
      catch (error) { message(statusNode, error.message, true); button.disabled = false; }
    });
    document.querySelector('[data-certificate-upload]')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form), button = form.querySelector('button'), node = form.querySelector('.form-status');
      const comp = active.c, revision = epoch;
      button.disabled = true; let image;
      try {
        const id = crypto.randomUUID(); message(node, 'Uploading artwork…'); image = await uploadImage(data.get('image'), comp.id, id);
        await result(client.rpc('save_certificate_template', { target_competition_id: comp.id, target_template_id: id, details: { ...image, name: data.get('name'), award_title: data.get('award_title'), template_type: data.get('template_type'), required_tag: 'finalist', placement_min: 1, placement_max: 3, round_id: null, layout: [], ready: false } }));
        if (revision === epoch) navigate(`${managerPath(comp.slug)}/${id}`);
      } catch (error) { if (image) await client.storage.from('certificate-templates').remove([image.storage_path]); message(node, error.message, true); button.disabled = false; }
    });
    document.querySelectorAll('[data-delete-template]').forEach(button => { let pendingDelete; button.addEventListener('click', async () => {
      if (!confirm('Delete this template and its artwork?')) return;
      button.disabled = true;
      try { pendingDelete ||= await result(client.rpc('delete_certificate_template', { target_template_id: button.dataset.deleteTemplate })); await result(client.storage.from('certificate-templates').remove([pendingDelete])); await refresh(); }
      catch (error) { message(statusNode, pendingDelete ? `Template deleted. Artwork cleanup failed: ${error.message}. Click Retry cleanup.` : error.message, true); if (pendingDelete) button.textContent = 'Retry cleanup'; button.disabled = false; }
    }); });
    document.querySelector('[data-close-certificate-preview]')?.addEventListener('click', () => { document.querySelector('.certificate-preview-panel').hidden = true; });
    document.querySelectorAll('[data-certificate-download], [data-certificate-preview]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.certificateDownload || button.dataset.certificatePreview;
      const comp = active.c, revision = epoch;
      const controls = document.querySelectorAll(`[data-award="${id}"] button`); controls.forEach(b => b.disabled = true); let decoded;
      try {
        message(statusNode, 'Preparing your certificate…');
        const data = await result(client.rpc('certificate_download_data', { target_template_id: id }));
        const renderer = await import('./certificate-renderer.js');
        decoded = await renderer.readTemplate(await result(client.storage.from('certificate-templates').download(data.storage_path)));
        if (disposed || revision !== epoch) return;
        const preview = !button.dataset.certificateDownload, panel = document.querySelector('.certificate-preview-panel');
        const canvas = preview ? panel.querySelector('canvas') : document.createElement('canvas');
        await renderer.renderCertificate(canvas, decoded.image, data, data.values);
        if (disposed || revision !== epoch) return;
        if (preview) { panel.hidden = false; canvas.setAttribute('aria-label', Object.entries(data.values).filter(([,value]) => value).map(([key,value]) => `${renderer.sources[key]}: ${value}`).join('. ')); panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
        else { const format = button.dataset.format; const blob = format === 'pdf' ? await renderer.pdfBlob(canvas) : await renderer.pngBlob(canvas); if (revision !== epoch) return; renderer.downloadBlob(blob, `${comp.slug}-${data.name.replace(/[^a-z0-9-]/gi,'-')}.${format}`); }
        message(statusNode, preview ? 'Preview ready.' : 'Certificate downloaded.');
      } catch (error) { message(statusNode, error.message, true); }
      finally { decoded?.dispose(); controls.forEach(b => b.disabled = false); }
    }));
  }
  function subscribe() {
    const comp = active?.c?.id;
    const channel = comp && !active.manager ? client.channel(`certificates:${comp}`).on('postgres_changes', { event: '*', schema: 'public', table: 'competition_certificate_settings', filter: `competition_id=eq.${comp}` }, refresh).subscribe() : null;
    return () => { epoch++; disposed = true; editor?.dispose(); editor = null; if (channel) client.removeChannel(channel); };
  }
  return { resolve, bind, subscribe, canLeave: () => !editor || editor.canLeave() };
}
