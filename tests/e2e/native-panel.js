import {expect} from '@playwright/test';

export async function openNativePanel(extension) {
  const opener = await extension.context.newPage();
  await opener.goto(extension.url('options'));
  const cdp = await extension.context.newCDPSession(opener);
  const windowId = await opener.evaluate(
    async () => (await chrome.windows.getCurrent()).id
  );
  const opening = await cdp.send('Runtime.evaluate', {
    expression: `chrome.sidePanel.open({windowId: ${windowId}})`,
    userGesture: true,
    awaitPromise: true
  });
  expect(opening.exceptionDetails).toBeUndefined();
  const url = extension.url('sidepanel');
  await expect
    .poll(() =>
      extension.worker.evaluate(async () =>
        (await chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']})).map(
          context => context.documentUrl
        )
      )
    )
    .toContain(url);

  // Chromium exposes its native side panel as a DevTools target outside the
  // Playwright tab list. Keep the web page active for the capture interaction.
  const {targetInfos} = await cdp.send('Target.getTargets');
  const targetId = targetInfos.find(target => target.url === url)?.targetId;
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId});
  let nextId = 0;

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(
        () => finish(new Error(`${method} timed out`)),
        4000
      );

      function finish(error, value) {
        clearTimeout(timer);
        cdp.off('Target.receivedMessageFromTarget', receive);
        if (error) reject(error);
        else resolve(value);
      }

      function receive(event) {
        if (event.sessionId !== sessionId) return;
        const reply = JSON.parse(event.message);
        if (reply.id !== id) return;
        finish(
          reply.error ? new Error(reply.error.message) : null,
          reply.result
        );
      }

      cdp.on('Target.receivedMessageFromTarget', receive);
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({id, method, params})
        })
        .catch(finish);
    });
  }

  return {
    async insertText(text) {
      await send('Input.insertText', {text});
    },
    async evaluate(fn) {
      const reply = await send('Runtime.evaluate', {
        expression: `(${fn})()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
      return reply.result.value;
    },
    async screenshot() {
      const {data} = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: false
      });
      return Buffer.from(data, 'base64');
    }
  };
}
