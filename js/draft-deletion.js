// Destructive draft management uses the saved server snapshot, never edited form values.
export function draftManagement(c, actor, h) {
  if (!c?.version || c.owner_id !== actor) return '';
  if (c.status !== 'draft') return '<section class="draft-management"><h2>Competition records</h2><p>Published competitions stay available so participants can access their entries, results and certificates.</p></section>';
  return `<section class="draft-management"><div><h2>Delete this draft</h2><p>Only unused drafts can be deleted. Published competitions and drafts with collaborators, entries or activity are protected.</p></div><button class="button secondary" type="button" data-delete-draft>Delete draft</button></section>`;
}

export function openDraftDeletion({ client, saved, dirty, h, onBusy, onPrepared, onDeleted, setStatus }) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'draft-delete-dialog';
  dialog.setAttribute('aria-labelledby', 'draft-delete-title');
  dialog.setAttribute('aria-describedby', 'draft-delete-description');
  dialog.innerHTML = `<h2 id="draft-delete-title">Delete saved draft?</h2><p id="draft-delete-description">This permanently deletes <strong>${h(saved.name)}</strong>, its round settings and unused banner images. It cannot be undone.${dirty ? ' Your unsaved edits will also be discarded.' : ''}</p><p>Type the saved competition name exactly to confirm:</p><p class="draft-confirm-name">${h(saved.name)}</p><form><label class="field"><span>Saved competition name</span><input name="confirmation" autocomplete="off" spellcheck="false" required></label><div class="form-status" role="status" aria-live="polite" data-delete-status></div><div class="draft-delete-actions"><button type="button" class="button secondary" data-delete-cancel autofocus>Keep draft</button><button type="submit" class="button danger" disabled>Delete permanently</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), field = form.elements.confirmation;
  const submit = form.querySelector('[type="submit"]'), cancel = form.querySelector('[data-delete-cancel]');
  const status = form.querySelector('[data-delete-status]');
  let busy = false, deleted = false, finishing = false, uncertain = false, version = saved.version;
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const update = () => { submit.disabled = busy || field.value !== saved.name; };
  field.addEventListener('input', update);
  cancel.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || field.value !== saved.name) return;
    busy = true; onBusy(true); field.disabled = cancel.disabled = true; update();
    try {
      if (uncertain) {
        setStatus(status, 'Checking whether the previous deletion finished…');
        const current = await result(client.auth.getUser());
        if (current.user?.id !== saved.owner_id) throw new Error('Your account changed. Sign in as the draft owner to check deletion.');
        const remaining = await result(client.from('competitions').select('id').eq('id', saved.id).maybeSingle());
        if (!remaining) {
          deleted = true; busy = false; onBusy(false); dialog.close(); await onDeleted(); return;
        }
        uncertain = false;
      }
      setStatus(status, 'Checking draft and removing unused banner images…');
      const prepared = await result(client.rpc('prepare_draft_competition_deletion', {
        target_competition_id: saved.id, expected_version: version, confirmation_name: field.value
      }));
      version = prepared.competition.version;
      onPrepared(prepared.competition);
      // Storage metadata alone must never be deleted through SQL.
      for (let offset = 0; offset < prepared.banner_paths.length; offset += 100) {
        await result(client.storage.from('competition-banners').remove(prepared.banner_paths.slice(offset, offset + 100)));
      }
      setStatus(status, 'Deleting saved draft…');
      finishing = true;
      await result(client.rpc('delete_draft_competition', {
        target_competition_id: saved.id, expected_version: version, confirmation_name: field.value
      }));
      deleted = true;
      busy = false; onBusy(false); dialog.close(); await onDeleted();
    } catch (error) {
      if (deleted) { location.assign('/organiser'); return; }
      if (finishing && /fetch|network/i.test(error.message || '')) uncertain = true;
      const reason = /fetch|network/i.test(error.message || '') ? 'Could not reach Vertex. Check your connection.' : error.message || 'Could not finish deletion.';
      setStatus(status, uncertain ? `${reason} Deletion could not be confirmed. Reconnect and choose Check deletion, or close this dialog and reopen Your competitions to check whether the draft is still listed.` : `${reason} The draft has not been deleted. If banner cleanup already started, its banner may now be a solid colour. Retry here, or keep the draft.`, 'error');
      status.tabIndex = -1; status.focus();
      submit.textContent = uncertain ? 'Check deletion' : 'Retry deletion';
    } finally {
      busy = false; finishing = false; onBusy(false); field.disabled = cancel.disabled = false; update();
    }
  });
  dialog.showModal();
}
