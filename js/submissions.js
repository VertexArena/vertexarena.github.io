export function createSubmissions({ client, state, escapeHtml: h, refresh }) {
  const bucket = client?.storage.from('submissions');
  const maxBytes = 25 * 1024 * 1024;
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const localInput = value => { if (!value) return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const base = slug => `/competition/${slug}/submissions`;
  const viewPath = (slug, roundSlug) => `${base(slug)}/${roundSlug}`;
  const presets = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  let active = null;
  let filesChosen = [];
  let removed = new Set();
  let previewUrls = [];
  let currentUpload = null;
  let reviewPage = 0;
  let flash = '';
  const clean = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; currentUpload?.abort?.(true); currentUpload = null; };
  const errorText = error => error?.message || 'Could not complete this action. Try again.';
  const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && url.hostname ? url.href : null; } catch { return null; } };
  const empty = (title, detail) => `<div class="submission-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><strong>${h(title)}</strong><p>${h(detail)}</p></div>`;
  const unavailable = detail => ({ title: 'Submissions unavailable - Vertex', content: `<div class="page notice-page"><h1>Submissions unavailable.</h1><p>${h(detail)}</p><a class="button secondary" data-link href="/discover">Explore competitions</a></div>` });
  function status(config, submission) {
    if (!config?.enabled) return 'Not accepting work';
    if (submission) return 'Submitted';
    if (Date.now() < Date.parse(config.opens_at)) return 'Opens soon';
    if (Date.now() >= Date.parse(config.closes_at)) return 'Closed';
    return 'Ready to submit';
  }
  function roundCard(round, config, submission, c, eligible) {
    const label = eligible ? status(config, submission) : 'Not active';
    return `<article class="submission-round-card"><div class="submission-round-number">${String(round.sequence).padStart(2, '0')}</div><div class="submission-round-copy"><span class="submission-state ${label === 'Ready to submit' ? 'ready' : label === 'Submitted' ? 'done' : ''}">${h(label)}</span><h2>${h(round.name)}</h2><p>${eligible ? config?.enabled ? `${config.mode === 'mixed' ? 'Files and links' : config.mode === 'file' ? 'Files' : 'Links'} · Closes ${h(date(config.closes_at))}` : 'Organiser has not opened submissions for this round.' : 'Only entries advanced from the previous round can submit here.'}</p></div>${eligible ? `<a class="button secondary" data-link href="${viewPath(c.slug, round.slug)}">${submission ? 'View work' : 'Open round'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>` : ''}</article>`;
  }
  async function entryFor(c) {
    const individual = await result(client.from('individual_registrations').select('id').eq('competition_id', c.id).eq('participant_id', state.session.user.id).maybeSingle());
    if (individual) return { type: 'individual', name: state.profile?.full_name || 'Your individual entry', canEdit: true, teamId: null };
    const data = await result(client.rpc('my_competition_team_dashboard'));
    const team = (data.teams || []).find(row => row.competition_slug === c.slug && row.registered_at);
    return team ? { type: 'team', name: team.name, canEdit: team.captain_id === state.session.user.id, teamId: team.id } : null;
  }
  async function readMine(roundId) {
    const submission = await result(client.from('round_submissions').select('id,round_id,participant_id,team_id,first_submitted_at,updated_at,version').eq('round_id', roundId).maybeSingle());
    if (!submission) return null;
    const [files, links] = await Promise.all([
      result(client.from('round_submission_files').select('id,storage_path,original_name,mime_type,size_bytes').eq('submission_id', submission.id).order('created_at')),
      result(client.from('round_submission_links').select('id,url').eq('submission_id', submission.id).order('created_at'))
    ]);
    return { ...submission, files, links };
  }
  function heading(c, subtitle, title, intro, back) {
    return `<a class="back-link" data-link href="${back}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><div class="page-head compact-head"><span class="eyebrow">${h(subtitle)}</span><h1>${h(title)}</h1><p>${h(intro)}</p></div>`;
  }
  function existingFiles(rows, allowRemove = false) {
    return rows.length ? `<ul class="submission-file-list">${rows.map(file => `<li data-existing-file="${h(file.storage_path)}"><span class="submission-file-icon"><i class="fa-solid fa-file" aria-hidden="true"></i></span><span><strong>${h(file.original_name)}</strong><small>${h(size(file.size_bytes))} · ${h(file.mime_type)}</small></span><div><button class="button quiet" type="button" data-submission-download="${h(file.storage_path)}" data-file-name="${h(file.original_name)}" data-file-type="${h(file.mime_type)}">Download</button>${['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.mime_type) ? `<button class="button quiet" type="button" data-submission-view="${h(file.storage_path)}" data-file-name="${h(file.original_name)}" data-file-type="${h(file.mime_type)}">View</button>` : ''}${allowRemove ? `<button class="button quiet danger" type="button" data-submission-remove="${h(file.storage_path)}" aria-label="Remove ${h(file.original_name)}">Remove</button>` : ''}</div></li>`).join('')}</ul>` : '';
  }
  function existingLinks(rows) {
    return rows.length ? `<ul class="submission-link-list">${rows.map(row => { const url = safeLink(row.url); return url ? `<li><i class="fa-solid fa-link" aria-hidden="true"></i><a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(row.url)}</a></li>` : ''; }).join('')}</ul>` : '';
  }
  function participantRound(c, round, config, entry, submission) {
    const isOpen = config?.enabled && Date.now() >= Date.parse(config.opens_at) && Date.now() < Date.parse(config.closes_at);
    const editable = isOpen && entry.canEdit && (!submission || config.allow_edits);
    const allowFiles = config && config.mode !== 'link', allowLinks = config && config.mode !== 'file';
    const note = !config?.enabled ? 'Organiser has not enabled submissions for this round.' : !entry.canEdit ? 'Your team captain submits work for this team. You can review its current submission here.' : Date.now() < Date.parse(config.opens_at) ? `Submissions open ${date(config.opens_at)}.` : Date.now() >= Date.parse(config.closes_at) ? `Submission deadline passed ${date(config.closes_at)}.` : submission && !config.allow_edits ? 'Organiser has closed edits for submitted work.' : '';
    const details = config?.enabled ? `<div class="submission-brief"><div><span>Opens</span><strong>${h(date(config.opens_at))}</strong></div><div><span>Closes</span><strong>${h(date(config.closes_at))}</strong></div><div><span>Accepted</span><strong>${h(config.mode === 'mixed' ? 'Files and links' : config.mode === 'file' ? 'Files' : 'Links')}</strong></div>${allowFiles ? `<div><span>Each file</span><strong>${h(size(config.max_file_bytes))} max · 25 MB hard cap</strong></div>` : ''}</div>${config.instructions ? `<section class="submission-instructions"><span class="eyebrow">Organiser instructions</span><p>${h(config.instructions)}</p></section>` : ''}` : '';
    const saved = submission ? `<section class="submission-saved"><div class="submission-section-head"><div><span class="eyebrow">Current work</span><h2>Submission received.</h2><p>First sent ${h(date(submission.first_submitted_at))}${submission.version > 1 ? ` · Updated ${h(date(submission.updated_at))}` : ''}</p></div><span class="submission-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span></div>${existingFiles(submission.files, editable)}${existingLinks(submission.links)}</section>` : '';
    const form = editable ? `<section class="submission-edit"><div class="submission-section-head"><div><span class="eyebrow">${submission ? 'Edit work' : 'Prepare work'}</span><h2>${submission ? 'Replace or refine.' : 'Send your work.'}</h2><p>${submission ? 'Existing files stay unless removed. Save again before deadline.' : 'Review files and links before confirming.'}</p></div></div><form data-submission-form>${allowFiles ? `<label class="submission-drop"><input type="file" data-submission-file multiple accept="${h(config.allowed_mime_types.join(','))}"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><strong>Choose files</strong><span>Allowed: ${h(config.allowed_mime_types.join(', '))}</span><small>Up to 20 files. ${h(size(config.max_file_bytes))} each, never above 25 MB.</small></label><div data-submission-preview></div>` : ''}${allowLinks ? `<label class="field"><span>Links</span><textarea data-submission-links rows="${submission?.links.length ? Math.max(3, submission.links.length + 1) : 3}" placeholder="https://example.com/your-work&#10;One link per line">${h(submission?.links.map(row => row.url).join('\n') || '')}</textarea><small>One complete http:// or https:// link per line, up to 20.</small></label>` : ''}<div class="submission-review"><strong>Review before sending</strong><div data-submission-review></div></div><div class="form-status" data-submission-status role="status" aria-live="polite"></div><button class="button primary" type="submit" data-submission-submit>${submission ? 'Save updated submission' : 'Confirm submission'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></form></section>` : '';
    return { title: `${round.name} submissions - Vertex`, content: `<div class="page submission-page" data-submission-round="${h(round.id)}">${heading(c, `Round ${round.sequence} / ${entry.type === 'team' ? 'Team' : 'Individual'} submission`, round.name, `${entry.name} · ${status(config, submission)}`, base(c.slug))}${flash ? `<div class="submission-flash" role="status">${h(flash)}</div>` : ''}${details}${note ? `<div class="submission-note" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><p>${h(note)}</p></div>` : ''}<div class="submission-participant-layout">${form}${saved || (!form ? empty('No work submitted.', 'This round has no submission for your entry.') : '')}</div></div>` };
  }
  function managerConfig(c, round, config) {
    const usesFiles = !config || config.mode !== 'link';
    return `<section class="submission-manager-config"><div class="submission-section-head"><div><span class="eyebrow">Round settings</span><h2>What can entrants send?</h2><p>Rules apply to ${h(round.name)}. Dates must fit inside its published timeline.</p></div></div><form data-submission-config><label class="check-field"><input type="checkbox" name="enabled" ${config?.enabled ? 'checked' : ''}><span>Accept submissions for this round</span></label><fieldset class="submission-mode"><legend>Submission format</legend><label><input type="radio" name="mode" value="file" ${!config || config.mode === 'file' ? 'checked' : ''}><span><i class="fa-regular fa-file" aria-hidden="true"></i> Files</span></label><label><input type="radio" name="mode" value="link" ${config?.mode === 'link' ? 'checked' : ''}><span><i class="fa-solid fa-link" aria-hidden="true"></i> Links</span></label><label><input type="radio" name="mode" value="mixed" ${config?.mode === 'mixed' ? 'checked' : ''}><span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Both</span></label></fieldset><div class="submission-file-rules" data-file-rules ${usesFiles ? '' : 'hidden'}><label class="field"><span>Allowed MIME types</span><textarea name="mime_types" rows="4" placeholder="application/pdf&#10;image/png">${h(config?.allowed_mime_types?.join('\n') || 'application/pdf\nimage/png\nimage/jpeg')}</textarea><small>One MIME type per line. Common: ${h(presets.join(', '))}.</small></label><label class="field"><span>Maximum size per file (MB)</span><input name="max_mb" type="number" min="0.01" max="25" step="0.01" value="${h(config?.max_file_bytes ? (config.max_file_bytes / 1048576).toFixed(2) : '10')}"><small>Hard limit: 25 MB for every file.</small></label></div><label class="field"><span>Instructions</span><textarea name="instructions" rows="4" maxlength="5000" placeholder="Tell entrants what to send and how to name their work.">${h(config?.instructions || '')}</textarea></label><div class="form-grid"><label class="field"><span>Opens</span><input name="opens_at" type="datetime-local" required value="${h(localInput(config?.opens_at || round.opens_at))}"></label><label class="field"><span>Closes</span><input name="closes_at" type="datetime-local" required value="${h(localInput(config?.closes_at || round.submission_deadline))}"></label></div><p class="submission-timeline-bound">Round window: ${h(date(round.opens_at))} to ${h(date(round.submission_deadline))}.</p><label class="check-field"><input type="checkbox" name="allow_edits" ${!config || config.allow_edits ? 'checked' : ''}><span>Allow edits before the close time</span></label><div class="form-status" data-config-status role="status" aria-live="polite"></div><button class="button primary" type="submit">Save round rules</button></form></section>`;
  }
  function reviewCard(row) {
    const label = row.status === 'valid' ? 'Valid' : row.status === 'late' ? 'Late' : 'Missing';
    return `<article class="submission-review-card"><div class="submission-review-identity"><span class="submission-state ${row.status}">${label}</span><h3>${h(row.name)}</h3><p>${row.entry_type === 'team' ? 'Team' : `Individual · @${h(row.username)}`}</p></div><div class="submission-review-detail">${row.submission_id ? `<time datetime="${h(row.updated_at)}">Submitted ${h(date(row.first_submitted_at))}${row.updated_at !== row.first_submitted_at ? ` · Updated ${h(date(row.updated_at))}` : ''}</time>${existingFiles((row.files || []).map(file => ({ storage_path: file.path, original_name: file.name, mime_type: file.mime_type, size_bytes: file.size_bytes })))}${existingLinks((row.links || []).map(url => ({ url })))}` : '<p>No work submitted for this round.</p>'}</div></article>`;
  }
  function managerView(c, rounds, configs, selected, review) {
    const config = configs.find(item => item.round_id === selected.id);
    return { title: `${c.name} submissions - Vertex`, content: `<div class="page submission-page submission-manager" data-submission-manager="${h(selected.id)}">${heading(c, 'Organiser workspace / submissions', 'Review every entry.', 'Set round rules, then see submitted and missing work in one roster.', `/organiser/competition/${c.slug}/workspace`)}<div class="submission-round-tabs" role="group" aria-label="Choose round">${rounds.map(round => `<button type="button" class="submission-tab ${selected.id === round.id ? 'active' : ''}" data-submission-round-tab="${h(round.slug)}" ${selected.id === round.id ? 'aria-current="true"' : ''}>${String(round.sequence).padStart(2, '0')} · ${h(round.name)}</button>`).join('')}</div><div class="submission-manager-layout">${managerConfig(c, selected, config)}<section class="submission-review-panel"><div class="submission-section-head"><div><span class="eyebrow">Live roster</span><h2>Review submissions.</h2><p><span data-review-total>${review.total}</span> ${review.total === 1 ? 'entry' : 'entries'} match current filters.</p></div></div><div class="submission-filters"><label class="field"><span>Search name or @username</span><input type="search" data-review-search placeholder="Find entrant"></label><label class="field"><span>Status</span><select data-review-status><option value="all">All statuses</option><option value="valid">Valid</option><option value="missing">Missing</option><option value="late">Late</option></select></label><label class="field"><span>Entry</span><select data-review-entry><option value="all">Teams and individuals</option><option value="individual">Individuals</option><option value="team">Teams</option></select></label></div><button class="button quiet submission-export" type="button" data-review-export><i class="fa-solid fa-file-csv" aria-hidden="true"></i> Export filtered metadata</button><div class="form-status" data-review-error role="status" aria-live="polite"></div><div class="submission-review-list" data-review-list>${review.entries.length ? review.entries.map(reviewCard).join('') : empty('No entries match.', 'Change filters or wait for registration.')}</div><div class="submission-pagination" data-review-pagination></div></section></div></div>` };
  }
  async function resolve(path) {
    const managerMatch = path.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/submissions$/);
    const participantMatch = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/submissions(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
    if (!managerMatch && !participantMatch) return undefined;
    if (!state.session) return { protected: true };
    const slug = (managerMatch || participantMatch)[1];
    const c = await result(client.from('competitions').select('id,name,slug,status').eq('slug', slug).maybeSingle());
    if (!c) return null;
    const rounds = await result(client.from('competition_rounds').select('id,name,slug,sequence,opens_at,submission_deadline').eq('competition_id', c.id).order('sequence'));
    const configs = await result(client.from('round_submission_configs').select('round_id,enabled,mode,allowed_mime_types,max_file_bytes,instructions,opens_at,closes_at,allow_edits').in('round_id', rounds.map(row => row.id)));
    if (managerMatch) {
      const manager = await result(client.rpc('can_manage_competition', { target_competition_id: c.id }));
      if (!manager) return unavailable('Only this competition’s organisers can configure and review submissions.');
      const selectedSlug = new URLSearchParams(location.search).get('round');
      const selected = rounds.find(row => row.slug === selectedSlug) || rounds[0];
      if (!selected) return unavailable('Create a round before configuring submissions.');
      reviewPage = 0;
      const review = await result(client.rpc('organiser_round_submission_review', { target_round_id: selected.id }));
      active = { type: 'manager', c, rounds, configs, selected, review };
      return managerView(c, rounds, configs, selected, review);
    }
    if (state.profile?.account_type !== 'participant') return unavailable('Sign in with a registered participant account to view round submissions.');
    const entry = await entryFor(c);
    if (!entry) return unavailable('Only registered individuals and registered team members can view submissions.');
    if (participantMatch[2]) {
      const round = rounds.find(row => row.slug === participantMatch[2]);
      if (!round) return null;
      if (!await result(client.rpc('my_round_entry_eligible', { target_round_id: round.id }))) return unavailable('Your entry is not active in this round. Only entrants advanced from the previous round can submit.');
      const config = configs.find(row => row.round_id === round.id);
      const submission = await readMine(round.id);
      active = { type: 'participant-round', c, round, config, entry, submission };
      filesChosen = []; removed = new Set(); flash = sessionStorage.getItem('vertex-submission-flash') || ''; sessionStorage.removeItem('vertex-submission-flash');
      return participantRound(c, round, config, entry, submission);
    }
    const submissions = await result(client.from('round_submissions').select('id,round_id').in('round_id', rounds.map(row => row.id)));
    const eligibility = new Map(await Promise.all(rounds.map(async round => [round.id, await result(client.rpc('my_round_entry_eligible', { target_round_id: round.id }))])));
    active = { type: 'participant-list', c, rounds, configs, entry };
    return { title: `${c.name} submissions - Vertex`, content: `<div class="page submission-page">${heading(c, 'Competition work / submissions', 'Round by round.', `Follow each submission window for ${entry.name}.`, `/competition/${c.slug}`)}<div class="submission-round-list">${rounds.map(round => roundCard(round, configs.find(cfg => cfg.round_id === round.id), submissions.find(item => item.round_id === round.id), c, eligibility.get(round.id))).join('')}</div></div>` };
  }

  async function openStoredFile(path, name, mime, view) {
    const popup = view ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    try {
      const { data, error } = await bucket.download(path);
      if (error) throw error;
      const blob = data.type ? data : new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      if (view && popup) popup.location.href = url;
      else {
        popup?.close();
        const link = document.createElement('a');
        link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      popup?.close();
      const node = document.querySelector('[data-submission-status], [data-review-error]');
      if (node) node.textContent = `File could not open: ${errorText(error)}`;
    }
  }

  async function uploadFile(file, path, progress) {
    if (file.size <= 6 * 1024 * 1024) {
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return;
    }
    let tus;
    try { tus = await import('https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm'); }
    catch {
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return;
    }
    const { data: { session }, error: authError } = await client.auth.getSession();
    if (authError || !session?.access_token) throw new Error('Session expired. Sign in again before uploading.');
    const origin = new URL(window.VERTEX_CONFIG.SUPABASE_PROJECT_URL);
    const storageHost = origin.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    await new Promise((resolve, reject) => {
      currentUpload = new tus.Upload(file, {
        endpoint: `${origin.protocol}//${storageHost}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000],
        headers: { authorization: `Bearer ${session.access_token}` },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: 'submissions', objectName: path, contentType: file.type, cacheControl: '3600' },
        chunkSize: 6 * 1024 * 1024,
        onProgress: (sent, total) => progress(Math.round(sent / total * 100)),
        onError: error => { currentUpload = null; reject(error); },
        onSuccess: () => { currentUpload = null; resolve(); }
      });
      currentUpload.start();
    });
  }

  function preview() {
    const box = document.querySelector('[data-submission-preview]');
    const review = document.querySelector('[data-submission-review]');
    if (!review) return;
    previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
    const existing = (active.submission?.files || []).filter(file => !removed.has(file.storage_path));
    if (box) box.innerHTML = filesChosen.length ? `<div class="submission-new-files">${filesChosen.map((file, index) => {
      const image = file.type.startsWith('image/') && ['image/png','image/jpeg','image/webp'].includes(file.type);
      const url = image ? URL.createObjectURL(file) : null;
      if (url) previewUrls.push(url);
      return `<div class="submission-new-file">${url ? `<img src="${h(url)}" alt="Preview of ${h(file.name)}">` : '<i class="fa-regular fa-file" aria-hidden="true"></i>'}<span><strong>${h(file.name)}</strong><small>${h(size(file.size))} · ${h(file.type || 'Unknown type')}</small></span><button type="button" data-remove-new="${index}" aria-label="Remove ${h(file.name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
    }).join('')}</div>` : '';
    document.querySelectorAll('[data-existing-file]').forEach(node => {
      node.hidden = removed.has(node.dataset.existingFile);
    });
    const links = document.querySelector('[data-submission-links]')?.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) || [];
    review.innerHTML = `<p>${existing.length + filesChosen.length} file${existing.length + filesChosen.length === 1 ? '' : 's'} · ${links.length} link${links.length === 1 ? '' : 's'}</p>${links.length ? `<ul>${links.map(url => `<li>${h(url)}</li>`).join('')}</ul>` : ''}`;
  }

  function validateWork(config, oldFiles, links) {
    const count = oldFiles.length + filesChosen.length;
    if (count > 20 || links.length > 20) throw new Error('Use at most 20 files and 20 links.');
    if (config.mode === 'file' && (!count || links.length)) throw new Error('This round accepts files only. Choose at least one file.');
    if (config.mode === 'link' && (!links.length || count)) throw new Error('This round accepts links only. Add at least one link.');
    if (config.mode === 'mixed' && !count && !links.length) throw new Error('Add at least one file or link.');
    for (const file of filesChosen) {
      if (!file.size) throw new Error(`${file.name} is empty.`);
      if (file.size > maxBytes) throw new Error(`${file.name} exceeds the 25 MB hard limit.`);
      if (file.size > config.max_file_bytes) throw new Error(`${file.name} exceeds this round’s ${size(config.max_file_bytes)} limit.`);
      if (!config.allowed_mime_types.includes(file.type)) throw new Error(`${file.name} has a file type this round does not allow.`);
    }
    for (const url of links) if (!safeLink(url) || url.length > 2048) throw new Error(`Use a complete http:// or https:// link: ${url}`);
  }

  async function saveSubmission(form) {
    const node = form.querySelector('[data-submission-status]');
    const button = form.querySelector('[data-submission-submit]');
    const { c, round, config, entry, submission } = active;
    const oldFiles = (submission?.files || []).filter(file => !removed.has(file.storage_path));
    const links = form.querySelector('[data-submission-links]')?.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) || [];
    node.textContent = '';
    try { validateWork(config, oldFiles, links); }
    catch (error) { node.textContent = errorText(error); return; }
    if (Date.now() < Date.parse(config.opens_at) || Date.now() >= Date.parse(config.closes_at)) {
      node.textContent = 'Submission window is closed. Reload for current dates.'; return;
    }
    button.disabled = true;
    const uploaded = [];
    try {
      for (const file of filesChosen) {
        const path = `${round.id}/${state.session.user.id}/${crypto.randomUUID()}`;
        node.textContent = `Uploading ${file.name}…`;
        await uploadFile(file, path, percent => { if (node.isConnected) node.textContent = `Uploading ${file.name} · ${percent}%`; });
        uploaded.push(path);
      }
      node.textContent = 'Saving submission…';
      const fileItems = [
        ...oldFiles.map(file => ({ path: file.storage_path, name: file.original_name })),
        ...uploaded.map((path, index) => ({ path, name: filesChosen[index].name }))
      ];
      await result(client.rpc('save_round_submission', {
        target_round_id: round.id, target_team_id: entry.teamId, file_items: fileItems,
        link_urls: links, expected_version: submission?.version ?? null
      }));
      const obsolete = (submission?.files || []).filter(file => removed.has(file.storage_path)).map(file => file.storage_path);
      let cleanupWarning = '';
      if (obsolete.length) {
        const { error } = await bucket.remove(obsolete);
        if (error) cleanupWarning = ' Older file cleanup failed; contact an organiser if needed.';
      }
      sessionStorage.setItem('vertex-submission-flash', `${submission ? 'Submission updated.' : 'Submission confirmed.'} Your entry and team have been notified.${cleanupWarning}`);
      await refresh();
    } catch (error) {
      if (uploaded.length) await bucket.remove(uploaded);
      node.textContent = errorText(error);
      button.disabled = false;
    }
  }

  async function saveConfig(form) {
    const status = form.querySelector('[data-config-status]');
    const button = form.querySelector('button[type="submit"]');
    status.textContent = '';
    const values = new FormData(form);
    const mode = String(values.get('mode'));
    const opens = new Date(String(values.get('opens_at'))), closes = new Date(String(values.get('closes_at')));
    if (!Number.isFinite(opens.getTime()) || !Number.isFinite(closes.getTime())) { status.textContent = 'Choose valid opening and closing times.'; return; }
    const max = mode === 'link' ? 0 : Math.round(Number(values.get('max_mb')) * 1048576);
    const mimes = mode === 'link' ? [] : String(values.get('mime_types') || '').split(/[\n,]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
    if (mode !== 'link' && (!mimes.length || !Number.isFinite(max) || max < 1 || max > maxBytes)) {
      status.textContent = 'Add allowed MIME types and choose a file limit between 0.01 and 25 MB.'; return;
    }
    button.disabled = true;
    try {
      await result(client.rpc('save_round_submission_config', {
        target_round_id: active.selected.id, submission_enabled: values.has('enabled'), submission_mode: mode,
        mime_types: mimes, file_limit_bytes: max, submission_instructions: String(values.get('instructions') || ''),
        submission_opens_at: opens.toISOString(), submission_closes_at: closes.toISOString(), edits_allowed: values.has('allow_edits')
      }));
      status.textContent = 'Round rules saved.';
      const updated = await result(client.from('round_submission_configs').select('round_id,enabled,mode,allowed_mime_types,max_file_bytes,instructions,opens_at,closes_at,allow_edits').eq('round_id', active.selected.id).single());
      active.configs = active.configs.filter(item => item.round_id !== updated.round_id).concat(updated);
      button.disabled = false;
    } catch (error) { status.textContent = errorText(error); button.disabled = false; }
  }

  async function loadReview(page = 0) {
    if (active?.type !== 'manager') return;
    const root = document.querySelector('.submission-manager');
    if (!root) return;
    const list = root.querySelector('[data-review-list]');
    const error = root.querySelector('[data-review-error]');
    error.textContent = '';
    list.setAttribute('aria-busy', 'true');
    try {
      const response = await result(client.rpc('organiser_round_submission_review', {
        target_round_id: active.selected.id,
        search_term: root.querySelector('[data-review-search]').value.trim(),
        status_filter: root.querySelector('[data-review-status]').value,
        entry_filter: root.querySelector('[data-review-entry]').value,
        result_page: page
      }));
      if (!list.isConnected) return;
      reviewPage = page; active.review = response;
      list.innerHTML = response.entries.length ? response.entries.map(reviewCard).join('') : empty('No entries match.', 'Change filters or wait for registration.');
      root.querySelector('[data-review-total]').textContent = response.total;
      const nav = root.querySelector('[data-review-pagination]');
      nav.innerHTML = response.total > 25 ? `<span>Page ${page + 1} of ${Math.ceil(response.total / 25)}</span><button class="button quiet" type="button" data-review-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button><button class="button quiet" type="button" data-review-page="${page + 1}" ${page >= Math.ceil(response.total / 25) - 1 ? 'disabled' : ''}>Next</button>` : '';
    } catch (err) { error.textContent = errorText(err); }
    finally { if (list.isConnected) list.removeAttribute('aria-busy'); }
  }

  async function exportReview() {
    const root = document.querySelector('.submission-manager');
    if (!root || active?.type !== 'manager') return;
    const button = root.querySelector('[data-review-export]');
    const status = root.querySelector('[data-review-error]');
    button.disabled = true; status.textContent = 'Preparing CSV…';
    try {
      const args = {
        target_round_id: active.selected.id, search_term: root.querySelector('[data-review-search]').value.trim(),
        status_filter: root.querySelector('[data-review-status]').value, entry_filter: root.querySelector('[data-review-entry]').value
      };
      const entries = [];
      for (let page = 0; ; page++) {
        const data = await result(client.rpc('organiser_round_submission_review', { ...args, result_page: page }));
        entries.push(...data.entries);
        if (entries.length >= data.total || !data.entries.length) break;
      }
      const csv = value => { const raw = String(value ?? ''); return `"${(/^[=+@\-\t\r]/.test(raw) ? "'" : '') + raw.replaceAll('"', '""')}"`; };
      const lines = [['Entry type','Name','Username','Status','First submitted','Updated','File names','Links'].map(csv).join(',')];
      entries.forEach(row => lines.push([row.entry_type,row.name,row.username,row.status,row.first_submitted_at,row.updated_at,(row.files || []).map(file => file.name).join('; '),(row.links || []).join('; ')].map(csv).join(',')));
      const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${active.c.slug}-${active.selected.slug}-submissions.csv`; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = `${entries.length} entries exported.`;
    } catch (error) { status.textContent = errorText(error); }
    finally { button.disabled = false; }
  }

  function bind() {
    const page = document.querySelector('.submission-page');
    if (!page || !active) return;
    page.addEventListener('click', event => {
      const download = event.target.closest('[data-submission-download], [data-submission-view]');
      if (download) { openStoredFile(download.dataset.submissionDownload || download.dataset.submissionView, download.dataset.fileName, download.dataset.fileType, Boolean(download.dataset.submissionView)); return; }
      const removeOld = event.target.closest('[data-submission-remove]');
      if (removeOld) { removed.add(removeOld.dataset.submissionRemove); preview(); return; }
      const removeNew = event.target.closest('[data-remove-new]');
      if (removeNew) { filesChosen.splice(Number(removeNew.dataset.removeNew), 1); preview(); return; }
      const tab = event.target.closest('[data-submission-round-tab]');
      if (tab) { history.replaceState({}, '', `/organiser/competition/${active.c.slug}/submissions?round=${encodeURIComponent(tab.dataset.submissionRoundTab)}`); refresh(); return; }
      const paginate = event.target.closest('[data-review-page]');
      if (paginate) loadReview(Number(paginate.dataset.reviewPage));
      if (event.target.closest('[data-review-export]')) exportReview();
    });
    const form = page.querySelector('[data-submission-form]');
    if (form) {
      form.querySelector('[data-submission-file]')?.addEventListener('change', event => { filesChosen = [...event.target.files]; preview(); });
      form.querySelector('[data-submission-links]')?.addEventListener('input', preview);
      form.addEventListener('submit', event => { event.preventDefault(); saveSubmission(form); });
      preview();
    }
    const config = page.querySelector('[data-submission-config]');
    if (config) {
      config.addEventListener('change', event => { if (event.target.name === 'mode') config.querySelector('[data-file-rules]').hidden = event.target.value === 'link'; });
      config.addEventListener('submit', event => { event.preventDefault(); saveConfig(config); });
      page.querySelectorAll('[data-review-status], [data-review-entry]').forEach(node => node.addEventListener('change', () => loadReview(0)));
      let timer;
      page.querySelector('[data-review-search]').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => loadReview(0), 220); });
      loadReview(0);
    }
  }
  return { resolve, bind, subscribe: () => clean };
}
