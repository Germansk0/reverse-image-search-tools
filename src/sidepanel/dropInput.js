import {isValidWebUrl} from './urlPreview.js';

/** Extract one direct web address from a browser drag payload. */
export function getDroppedWebUrl(transfer) {
  if (!transfer) return '';
  try {
    // A linked image can carry the link's URL and the image itself as HTML.
    // Parse in an inert template so reading the drag payload never loads it.
    const html = transfer.getData('text/html');
    if (html && typeof document !== 'undefined') {
      const template = document.createElement('template');
      template.innerHTML = html;
      const images = template.content.querySelectorAll('img[src]');
      const src = images.length === 1 ? images[0].getAttribute('src').trim() : '';
      if (isValidWebUrl(src)) return src;
    }
    const lines = (transfer.getData('text/uri-list') || '').split(/\r?\n/);
    const url = lines.map(line => line.trim()).find(line => line && !line.startsWith('#') && isValidWebUrl(line));
    if (url) return url;
    const text = (transfer.getData('text/plain') || '').trim();
    return isValidWebUrl(text) ? text : '';
  } catch {
    return '';
  }
}
