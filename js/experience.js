import { competitionSections } from './presentation.js';

const protectedForms = '[data-profile-form],[data-organisation-form],[data-submission-form],[data-submission-config],[data-criterion-form],[data-score-form],[data-meeting-form],[data-announcement-form],[data-qa-question-form],[data-qa-reply-form],[data-publication-form],[data-category-form]';
const fingerprint = form => JSON.stringify([...form.querySelectorAll('input,textarea,select')].filter(field => !field.disabled && !['hidden','search','submit','button'].includes(field.type)).map(field => [field.name || field.dataset.criterionId || field.type, field.type === 'file' ? [...field.files].map(file => `${file.name}:${file.size}:${file.lastModified}`) : ['checkbox','radio'].includes(field.type) ? field.checked : field.value]));

export function createFormRecovery() {
  let records = new Map();
  let observer;
  const dirty = () => [...records].filter(([form, record]) => form.isConnected && record.touched && (record.structural || fingerprint(form) !== record.saved));
  function watch(root) {
    observer?.disconnect(); records = new Map();
    const prepare = () => { for (const form of records.keys()) if (!form.isConnected) records.delete(form); root.querySelectorAll(protectedForms).forEach(form => {
      if (records.has(form)) return;
      const note = document.createElement('p'); note.className = 'form-recovery-note'; note.hidden = true; note.textContent = 'Unsaved changes'; note.setAttribute('role', 'status'); form.before(note);
      records.set(form, { saved: fingerprint(form), touched: false, structural: false, note });
      form.addEventListener('vertex:form-saved', () => { const record = records.get(form); if (record) { record.saved = fingerprint(form); record.touched = false; record.structural = false; note.hidden = true; } });
      form.addEventListener('vertex:form-changed', () => { const record = records.get(form); if (record) { record.touched = true; record.structural = true; note.hidden = false; } });
      const changed = () => { const record = records.get(form); if (!record) return; record.touched = true; note.hidden = !record.structural && fingerprint(form) === record.saved; };
      form.addEventListener('input', changed); form.addEventListener('change', changed);
      form.addEventListener('click', event => { if (event.target.closest('[data-add-social],[data-remove-social]')) setTimeout(changed, 0); });
      form.addEventListener('reset', () => setTimeout(() => { const record = records.get(form); if (record) { record.saved = fingerprint(form); record.touched = false; record.structural = false; note.hidden = true; } }, 0));
    }); };
    prepare(); observer = new MutationObserver(prepare); observer.observe(root, { childList: true, subtree: true });
  }
  addEventListener('beforeunload', event => { if (dirty().length) { event.preventDefault(); event.returnValue = ''; } });
  return { watch, canLeave: () => !dirty().length || confirm('Leave without saving? Your unsaved changes on this page will be lost.'), hasChanges: () => dirty().length > 0, shouldDeferRefresh: () => dirty().some(([form]) => !form.querySelector('button[type="submit"]:disabled')) };
}

export const markFormSaved = form => form?.dispatchEvent(new Event('vertex:form-saved'));
export const markFormChanged = form => form?.dispatchEvent(new Event('vertex:form-changed'));

export function bindExperience(root, { accountType, navigate } = {}) {
  const controller = new AbortController();
  const on = (type, callback) => root.addEventListener(type, callback, { capture: true, signal: controller.signal });
  const describeFields = () => root.querySelectorAll('label.field').forEach(label => {
    const field = label.querySelector('input,textarea,select');
    const title = label.querySelector(':scope > span:first-child');
    if (!field || !title) return;
    const name = [...title.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim();
    if (name && !field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) field.setAttribute('aria-label', name);
    const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    label.querySelectorAll('small').forEach(hint => { if (!hint.id) hint.id = `vertex-hint-${crypto.randomUUID()}`; descriptions.add(hint.id); });
    if (descriptions.size) field.setAttribute('aria-describedby', [...descriptions].join(' '));
  });
  describeFields();
  const fieldsObserver = new MutationObserver(describeFields); fieldsObserver.observe(root, { childList: true, subtree: true });
  const navigation = () => {
    const sections = competitionSections(location.pathname, accountType);
    if (!sections || root.querySelector('.meeting-room-page')) return;
    const page = root.querySelector('.page'); if (!page) return;
    if (/unavailable|account required/i.test(page.querySelector('h1')?.textContent || '')) {
      if (!page.querySelector('.back-link')) {
        const match = location.pathname.match(/\/competition\/([a-z0-9-]+)/);
        const back = document.createElement('a'); back.className = 'back-link'; back.dataset.link = '';
        back.href = `/competition/${match[1]}`; back.textContent = 'Back to competition'; page.prepend(back);
      }
      return;
    }
    const nav = root.querySelector('.competition-context-nav') || document.createElement('nav');
    nav.className = 'competition-context-nav'; nav.setAttribute('aria-label', 'Competition sections'); nav.replaceChildren();
    const links = document.createElement('div'); links.className = 'competition-context-links';
    const label = document.createElement('label'); label.className = 'field competition-section-picker';
    const caption = document.createElement('span'); caption.textContent = 'Competition section';
    const picker = document.createElement('select'); picker.name = 'competition-section';
    const current = sections.find(section => section.current);
    if (!current) { const option = new Option(page.querySelector('h1')?.textContent.replace(/\.$/,'') || 'Current page', location.pathname, true, true); option.disabled = true; picker.add(option); }
    for (const section of sections) {
      const anchor = document.createElement('a'); anchor.href = section.href; anchor.dataset.link = ''; anchor.textContent = section.label;
      if (section.current) anchor.setAttribute('aria-current', 'page'); links.append(anchor);
      picker.add(new Option(section.label,section.href,false,Boolean(section.current)));
    }
    const initial = picker.value;
    picker.addEventListener('change', () => { const previous = location.pathname; navigate?.(picker.value); if (location.pathname === previous) picker.value = initial; });
    label.append(caption,picker); nav.append(links,label);
    const back = page.querySelector(':scope > .back-link'); if (back) back.after(nav); else page.prepend(nav);
  };
  navigation(); on('vertex:competition-saved', navigation);
  let queued = false;
  on('invalid', event => {
    const field = event.target; if (!field.form || !field.matches('input,select,textarea')) return;
    event.preventDefault(); field.setAttribute('aria-invalid', 'true');
    if (!field.id) field.id = `vertex-field-${crypto.randomUUID()}`;
    let message = root.querySelector(`[data-error-for="${field.id}"]`);
    if (!message) { message = document.createElement('small'); message.className = 'field-error'; message.dataset.errorFor = field.id; message.id = `${field.id}-error`; field.closest('label')?.append(message); }
    message.textContent = field.validationMessage;
    const described = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); described.add(message.id); field.setAttribute('aria-describedby', [...described].join(' '));
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false; const form = field.form;
      let summary = form.querySelector('.validation-summary');
      if (!summary) { summary = document.createElement('section'); summary.className = 'validation-summary'; summary.tabIndex = -1; summary.setAttribute('aria-label', 'Check your entries'); form.prepend(summary); }
      summary.replaceChildren(); const title = document.createElement('h2'); title.textContent = 'Check these entries'; summary.append(title); const list = document.createElement('ul');
      form.querySelectorAll('[aria-invalid="true"]').forEach(input => { const item = document.createElement('li'); const link = document.createElement('a'); link.href = `#${input.id}`; const label = input.closest('label')?.querySelector('span')?.textContent?.trim() || input.name || 'Field'; link.textContent = `${label}: ${input.validationMessage}`; link.addEventListener('click', event => { event.preventDefault(); input.focus(); }); item.append(link); list.append(item); });
      summary.append(list); summary.focus();
    });
  });
  on('input', event => {
    const field = event.target; if (!field.matches('input,select,textarea') || !field.validity.valid) return;
    field.removeAttribute('aria-invalid'); const error = root.querySelector(`[data-error-for="${field.id}"]`);
    if (error) { const descriptions = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== error.id); if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' ')); else field.removeAttribute('aria-describedby'); error.remove(); }
    if (field.form && !field.form.querySelector('[aria-invalid="true"]')) field.form.querySelector('.validation-summary')?.remove();
  });
  return () => { controller.abort(); fieldsObserver.disconnect(); };
}
