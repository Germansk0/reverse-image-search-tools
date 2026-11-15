import {expect, test} from './extension.js';
import {openNativePanel} from './native-panel.js';

test('keyboard input reaches the preferred field in the native side panel', async ({extension}) => {
  await extension.worker.evaluate(() => chrome.storage.local.set({searchModeAction: 'url'}));
  const panel = await openNativePanel(extension);
  await expect.poll(() => panel.evaluate(() => ({
    focused: document.hasFocus(),
    control: document.activeElement.id
  }))).toEqual({focused: true, control: 'sidebar-image-url'});
  await panel.insertText('https://example.test/image.png');
  await expect.poll(() => panel.evaluate(() => document.querySelector('#sidebar-image-url').value))
    .toBe('https://example.test/image.png');
});

test('focus handoff restores the preferred control only when no control is focused', async ({extension}) => {
  const panel = await extension.openPanel();
  const chooseFile = panel.getByRole('button', {name: 'Choose file'});
  const imageLink = panel.getByRole('textbox', {name: 'Image link'});
  await expect(chooseFile).toBeFocused();

  // Exercise the panel-side handoff when Chrome activates the document
  // without carrying over a focused control.
  await chooseFile.evaluate(button => {
    button.blur();
    window.dispatchEvent(new FocusEvent('focus'));
  });
  await expect(chooseFile).toBeFocused();

  await imageLink.focus();
  await panel.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
  await expect(imageLink).toBeFocused();
});
