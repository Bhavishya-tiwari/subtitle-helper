const AUTH_MESSAGE = 'ST_AUTH_SESSION';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== AUTH_MESSAGE || !event.data.session) return;

  chrome.runtime.sendMessage({ action: 'authSession', session: event.data.session });
});
