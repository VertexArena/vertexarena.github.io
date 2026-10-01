// Last-resort feedback for unexpected script failures. Feature-specific errors
// retain their inline recovery controls. Never render raw error data to users.
export function startErrorFeedback() {
  const report = () => {
    if (document.querySelector('[data-global-error]')) return;
    const notice = document.createElement('aside');
    notice.className = 'global-error';
    notice.dataset.globalError = '';
    notice.setAttribute('aria-label', 'Unexpected error');
    notice.innerHTML = `<p role="alert">Something went wrong. Check your latest change before trying again.</p><div><button class="button secondary" data-error-reload>Reload page</button><button class="button quiet" data-error-dismiss>Dismiss</button></div>`;
    notice.querySelector('[data-error-dismiss]').addEventListener('click', () => notice.remove());
    notice.querySelector('[data-error-reload]').addEventListener('click', () => {
      if (confirm('Reload this page? Unsaved changes may be lost.')) location.reload();
    });
    document.body.append(notice);
  };
  addEventListener('unhandledrejection', report);
  addEventListener('error', event => { if (event.error) report(); });
}
