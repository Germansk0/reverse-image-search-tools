export const MAX_IMAGE_URL_LENGTH = 2048;

export function isValidWebUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_URL_LENGTH) return false;
  try {
    return /^https?:$/i.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Debounce preview requests and ignore results from URLs that are no longer current. */
export function createUrlPreviewController({onState, delay = 350, loadTimeout = 10000, setTimer = setTimeout, clearTimer = clearTimeout}) {
  let current = '';
  let timer = null;
  let timeout = null;
  let disposed = false;
  function clearPending() {
    if (timer !== null) clearTimer(timer);
    if (timeout !== null) clearTimer(timeout);
    timer = timeout = null;
  }
  return {
    update(value) {
      clearPending();
      current = value;
      if (!value) return onState({src: '', status: 'empty'});
      if (!isValidWebUrl(value)) return onState({src: '', status: 'invalid'});
      onState({src: '', status: 'loading'});
      const candidate = value;
      timer = setTimer(() => {
        timer = null;
        if (!disposed && current === candidate) {
          onState({src: candidate, status: 'loading'});
          timeout = setTimer(() => {
            timeout = null;
            if (!disposed && current === candidate) onState({src: candidate, status: 'unavailable'});
          }, loadTimeout);
        }
      }, delay);
    },
    result(src, status) {
      if (!disposed && src && src === current && ['ready', 'unavailable'].includes(status)) {
        if (timeout !== null) clearTimer(timeout);
        timeout = null;
        onState({src, status});
      }
    },
    dispose() {
      disposed = true;
      clearPending();
    }
  };
}
