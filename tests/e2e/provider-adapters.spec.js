import {expect, imageBytes, imageUrl, test} from './extension.js';

async function searchWithUpload(extension, engine) {
  await extension.worker.evaluate(async engine => {
    const {disabledEngines} = await chrome.storage.local.get('disabledEngines');
    await chrome.storage.local.set({
      disabledEngines: disabledEngines.filter(id => id !== engine)
    });
  }, engine);

  const panel = await extension.openPanel();
  const resultOpened = extension.context.waitForEvent('page');
  const result = await panel.evaluate(
    async ({engine, image}) =>
      chrome.runtime.sendMessage({
        id: 'panelSearchSubmit',
        selectedEngines: [engine],
        sourceTabId: (await chrome.tabs.getCurrent()).id,
        searchModeOverride: 'browse',
        images: [image]
      }),
    {
      engine,
      image: {
        imageFilename: 'sample.png',
        imageType: 'image/png',
        imageSize: imageBytes.length,
        imageDataUrl: `data:image/png;base64,${imageBytes.toString('base64')}`
      }
    }
  );
  expect(result).toMatchObject({accepted: true, openedCount: 1});
  return resultOpened;
}

async function collectProviderNotices(extension) {
  await extension.worker.evaluate(() => {
    self.providerNotices = [];
    chrome.runtime.onMessage.addListener(request => {
      if (request.id === 'notification' && request.message) {
        self.providerNotices.push(request.message);
      }
    });
  });
  return () => extension.worker.evaluate(() => self.providerNotices);
}

test('Pinterest requests more pins and can retry and continue without duplicates', async ({
  extension
}, testInfo) => {
  const endpoint = 'https://api.pinterest.com/v3/visual_search/extension/image/';
  const thumbnail = 'https://i.pinimg.com/fixture.png';
  const bookmark = 'next page+/=';
  const requests = [];
  const pin = id => ({
    id: String(id),
    image_large_url: thumbnail,
    description: `Pin ${id}`
  });

  await extension.context.route(thumbnail, route =>
    route.fulfill({contentType: 'image/png', body: imageBytes})
  );
  await extension.context.route(url => url.href.startsWith(endpoint), route => {
    const request = route.request();
    const params = new URL(request.url()).searchParams;
    requests.push({
      method: request.method(),
      size: params.get('page_size'),
      bookmark: params.get('bookmark')
    });
    if (requests.length === 1) {
      return route.fulfill({
        json: {
          status: 'success',
          data: Array.from({length: 35}, (_, index) => pin(index + 1)),
          bookmark
        }
      });
    }
    if (requests.length === 2) {
      return route.fulfill({json: {status: 'failure'}});
    }
    return route.fulfill({
      json: {status: 'success', data: [pin(35), pin(36), pin(37)], bookmark}
    });
  });

  const results = await searchWithUpload(extension, 'pinterest');
  const more = results.getByRole('button', {name: 'Load more results'});
  await expect(results.getByText('35 from Pinterest')).toBeVisible();
  await expect(results.locator('.grid-item-loaded')).toHaveCount(35);
  await more.press('Enter');
  await expect(results.getByText('Couldn’t load more results. Try again.')).toBeVisible();
  await expect(results.locator('.grid-item-loaded')).toHaveCount(35);
  await more.press('Enter');
  await expect(results.getByText('37 from Pinterest')).toBeVisible();
  await expect(results.locator('.grid-item-loaded')).toHaveCount(37);
  await expect(
    results.locator('.grid-item').filter({
      has: results.getByRole('img', {name: 'Pin 36', exact: true})
    })
  ).toBeFocused();
  await expect(more).toHaveCount(0);
  expect(requests).toEqual([
    {method: 'PUT', size: '50', bookmark: null},
    {method: 'PUT', size: '50', bookmark},
    {method: 'PUT', size: '50', bookmark}
  ]);
  const screenshot = testInfo.outputPath('pinterest-more-results.png');
  await results.screenshot({path: screenshot, animations: 'disabled'});
  await testInfo.attach('pinterest-more-results', {path: screenshot, contentType: 'image/png'});
});

test('Sogou hands off the image to the homepage uploader', async ({
  extension
}) => {
  await extension.context.route('https://pic.sogou.com/**', route => {
    const isHomepage = new URL(route.request().url()).pathname === '/';
    return route.fulfill({
      contentType: 'text/html',
      body: isHomepage
        ? `<input type="file" id="unrelated">
           <div class="index-search-box"><input type="file" accept="image/*" hidden></div>
           <script>
             document.querySelector('.index-search-box input').addEventListener('change', async event => {
               const file = event.target.files[0];
               document.body.dataset.file = file.name;
               document.body.dataset.bytes = [...new Uint8Array(await file.arrayBuffer())].join(',');
             });
           </script>`
        : '缺少有效图片地址，请返回图片搜索重新选择图片'
    });
  });

  const result = await searchWithUpload(extension, 'sogou');
  await expect(result).toHaveURL('https://pic.sogou.com/');
  await expect(result.locator('body')).toHaveAttribute(
    'data-file',
    'sample.png'
  );
  await expect(result.locator('body')).toHaveAttribute('data-bytes', [...imageBytes].join(','));
});

test('Sogou downloads a pasted image link and supplies the original bytes to the uploader', async ({extension}) => {
  await extension.context.route('https://pic.sogou.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<div class="index-search-box"><input type="file" accept="image/*" hidden></div>
      <script>
        document.querySelector('input').addEventListener('change', async event => {
          const file = event.target.files[0];
          document.body.dataset.mime = file.type;
          document.body.dataset.bytes = [...new Uint8Array(await file.arrayBuffer())].join(',');
        });
      </script>`
  }));
  await extension.worker.evaluate(async () => {
    const {disabledEngines} = await chrome.storage.local.get('disabledEngines');
    await chrome.storage.local.set({
      disabledEngines: disabledEngines.filter(id => id !== 'sogou'),
      sidebarEngineSelection: {mode: 'custom', engines: ['sogou']}
    });
  });
  const panel = await extension.openPanel();
  await panel.getByRole('textbox', {name: 'Image link'}).fill(imageUrl);
  await panel.getByRole('button', {name: 'Preview link'}).click();
  await expect(panel.locator('#engine-selector-button')).toContainText('Sogou');
  const opened = extension.context.waitForEvent('page');
  await panel.getByRole('button', {name: 'Search image'}).click();
  const result = await opened;
  await expect(result).toHaveURL('https://pic.sogou.com/');
  await expect(result.locator('body')).toHaveAttribute('data-mime', 'image/png');
  await expect(result.locator('body')).toHaveAttribute('data-bytes', [...imageBytes].join(','));
});

test('Taobao sends the image to its search input and keeps the full results URL', async ({
  extension
}) => {
  const resultsUrl = 'https://s.taobao.com/search?imgSearchOrigin=photo&imageId=fixture%2Bimage';
  await extension.context.route('https://s.taobao.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Product matches fixture</h1>'
    })
  );
  await extension.context.route('https://www.taobao.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<input type="file" id="unrelated-upload">
        <div class="image-search-icon-wrapper">Search by image</div>
        <div id="image-search-upload-button">Search</div>
        <script>
          const submit = document.getElementById('image-search-upload-button');
          document.querySelector('.image-search-icon-wrapper').onclick = () => {
            const upload = document.createElement('input');
            upload.type = 'file';
            upload.id = 'image-search-custom-file-input';
            upload.addEventListener('change', async () => {
              const file = upload.files[0];
              if (file?.name !== 'sample.png') return;
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (bytes.join(',') === '${[...imageBytes].join(',')}') {
                submit.classList.add('upload-button-active');
              }
            });
            document.body.appendChild(upload);
          };
          submit.onclick = () => window.open('${resultsUrl}');
        </script>`
    })
  );

  const result = await searchWithUpload(extension, 'taobao');
  await expect(result).toHaveURL(resultsUrl);
  await expect(result.getByRole('heading', {name: 'Product matches fixture'})).toBeVisible();
});

test('1688 waits for the current upload panel and opens results in the search tab', async ({
  extension
}) => {
  await extension.context.route('https://www.1688.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<main>
        <div class="cgf-image-search-panel" hidden>
          <input type="file" class="beacon-upload-input">
          <button class="cgf-image-search-panel__confirm-btn" disabled>Search images</button>
        </div>
      </main>
      <div id="top-menu-search-new-mount" hidden>
        <input type="file" class="beacon-upload-input">
        <button class="cgf-image-search-panel__confirm-btn" disabled>Search images</button>
      </div>
      <script>
        setTimeout(() => {
          const camera = document.createElement('button');
          camera.className = 'cgf-search-input__image-btn';
          camera.textContent = 'Image Search';
          camera.addEventListener('click', () => {
            document.querySelector('main .cgf-image-search-panel').hidden = false;
          });
          document.querySelector('main').prepend(camera);
        }, 3200);
        const submit = document.querySelector('main .cgf-image-search-panel__confirm-btn');
        document.querySelector('main').addEventListener('change', event => {
          submit.disabled = event.target.files[0]?.name !== 'sample.png';
        });
        submit.addEventListener('click', () => {
          window.open('https://air.1688.com/kapp/1688-global/sales/search?type=image');
        });
      </script>`
    })
  );

  const result = await searchWithUpload(extension, 'alibabaChina');
  await expect(result).toHaveURL(
    'https://air.1688.com/kapp/1688-global/sales/search?type=image'
  );
});

test('provider verification and account gates explain why a search stopped', async ({
  extension
}) => {
  test.setTimeout(60000);
  const notices = await collectProviderNotices(extension);
  const cases = [
    [
      'dreamstime',
      'https://www.dreamstime.com/**',
      '<title>Dreamstime is loading ...</title>',
      /Dreamstime is asking you to verify access/
    ],
    [
      'kagi',
      'https://kagi.com/**',
      '<title>Verification</title>',
      /Kagi is asking you to verify access/
    ],
    [
      'freepik',
      'https://www.freepik.com/**',
      '<title>Our security filter flagged something</title>',
      /Freepik denied access/
    ],
    [
      'icons8',
      'https://icons8.com/**',
      '<title>Just a moment...</title>',
      /Icons8 is asking you to verify access/
    ],
    [
      'unsplash',
      'https://unsplash.com/**',
      '<title>Something went wrong</title><main>Access Denied: test</main>',
      /Unsplash denied access/
    ],
    [
      'vcg',
      'https://vcg.com/**',
      '<title>安全验证</title>',
      /VCG is asking you to verify access/
    ],
    [
      'lexica',
      'https://lexica.art/**',
      '<a href="/login">Get started</a>',
      /Lexica requires an active subscription/
    ]
  ];
  for (const [engine, url, html, message] of cases) {
    await extension.context.route(url, route => {
      if (engine === 'kagi' && new URL(route.request().url()).pathname === '/images') {
        return route.fulfill({status: 302, headers: {location: '/turnstile'}});
      }
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: html + `<input type="file">
          <script>
            document.querySelector('input').addEventListener('change', () => {
              document.body.dataset.uploaded = 'yes';
            });
          </script>`
      });
    });
    const provider = await searchWithUpload(extension, engine);
    await expect.poll(notices).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
    await expect(provider.locator('body')).not.toHaveAttribute('data-uploaded', 'yes');
  }
});

test('IKEA waits for the storefront camera after the user reviews the cookie prompt', async ({
  extension
}) => {
  const notices = await collectProviderNotices(extension);
  await extension.context.route('https://www.ikea.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button id="onetrust-accept-btn-handler">Review cookies</button>
        <script>
          const prompt = document.querySelector('button');
          prompt.onclick = () => {
            prompt.remove();
            document.body.innerHTML = '<button id="search-box-visual-search-icon">Search by image</button>';
            document.querySelector('button').onclick = () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.onchange = () => document.body.dataset.file = input.files[0]?.name;
              document.body.append(input);
            };
          };
        </script>`
    })
  );
  const provider = await searchWithUpload(extension, 'ikea');
  const prompt = provider.getByRole('button', {name: 'Review cookies'});
  await expect.poll(notices).toEqual(
    expect.arrayContaining([expect.stringContaining('Review the IKEA cookie prompt')])
  );
  await expect(prompt).toBeVisible();
  await expect(provider.locator('input[type=file]')).toHaveCount(0);
  await prompt.click();
  await expect(provider.locator('body')).toHaveAttribute('data-file', 'sample.png');
});

test('PimEyes leaves the upload and consent in the provider tab', async ({extension}) => {
  const notices = await collectProviderNotices(extension);
  await extension.context.route('https://pimeyes.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<label>Upload Your Photo <input id="file-input" type="file"></label>
        <div class="permissions"><label><input type="checkbox"> Accept terms</label></div>
        <div class="start-search-inner"><button>Start Search</button></div>
        <script>
          document.querySelector('input[type=file]').onchange = () => document.body.dataset.uploaded = 'yes';
          document.querySelector('button').onclick = () => document.body.dataset.submitted = 'yes';
        </script>`
    })
  );
  const provider = await searchWithUpload(extension, 'pimeyes');
  await expect.poll(notices).toEqual(
    expect.arrayContaining([expect.stringContaining('Finish the search in PimEyes')])
  );
  await expect(provider.getByRole('checkbox', {name: 'Accept terms'})).not.toBeChecked();
  await expect(provider.locator('body')).not.toHaveAttribute('data-uploaded', 'yes');
  await expect(provider.locator('body')).not.toHaveAttribute('data-submitted', 'yes');
});

test('123RF preserves the image through a regional redirect', async ({
  extension
}) => {
  await extension.context.route('https://www.123rf.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button id="desktop-search-bar-reverseSearch-btn">Search by image</button>
      <input id="searchbar-draganddrop-input" type="file">
      <script>
        document.querySelector('input').addEventListener('change', () => {
          location.replace('https://pl.123rf.com/');
        });
      </script>`
    })
  );
  await extension.context.route('https://pl.123rf.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button id="desktop-search-bar-reverseSearch-btn">Search by image</button>
      <input id="searchbar-draganddrop-input" type="file">
      <script>
        document.querySelector('input').addEventListener('change', event => {
          document.body.dataset.file = event.target.files[0]?.name;
        });
      </script>`
    })
  );

  const result = await searchWithUpload(extension, '123rf');
  await expect(result).toHaveURL('https://pl.123rf.com/');
  await expect(result.locator('body')).toHaveAttribute(
    'data-file',
    'sample.png'
  );
});

test('New Zealand Trade Mark Check can submit while a page image is still loading', async ({
  extension
}) => {
  const imageLoaded = Promise.withResolvers();
  await extension.context.route(
    'https://slow-assets.example.test/pixel.gif',
    async route => {
      await imageLoaded.promise;
      await route.fulfill({status: 204});
    }
  );
  await extension.context.route('https://app.iponz.govt.nz/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button id="logoCheckButton">Logo or image check</button>
      <input type="file" id="imageSearchDialogUploadButton" hidden>
      <button id="imageSearchDialogNextButton" disabled>Next</button>
      <img src="https://slow-assets.example.test/pixel.gif">
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const input = document.querySelector('input');
          const next = document.querySelector('#imageSearchDialogNextButton');
          document.querySelector('#logoCheckButton').onclick = () => input.hidden = false;
          input.onchange = () => next.disabled = input.files[0]?.name !== 'sample.png';
          next.onclick = () => { document.body.dataset.ready = document.readyState; };
        });
      </script>`
    })
  );

  try {
    const result = await searchWithUpload(extension, 'nzTrademark');
    await expect(result.locator('body')).toHaveAttribute(
      'data-ready',
      'interactive'
    );
  } finally {
    imageLoaded.resolve();
  }
});
