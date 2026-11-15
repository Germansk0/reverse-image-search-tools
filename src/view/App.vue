<template>
  <vn-app v-if="dataLoaded">
    <main v-if="previewImage && !showError" class="view-content">
      <header class="image-header">
        <div class="image-identity">
          <h1>{{ previewImage.imageFilename || getText('pageTitle_view') }}</h1>
          <p class="image-data" v-if="imageLoaded && imageDetails.length">
            {{ imageDetails.map(detail => detail.text).join(' · ') }}
          </p>
        </div>
        <div v-if="previewImage.imageUrl" class="image-link-actions">
          <a class="ui-button ui-link" :href="previewImage.imageUrl" :title="previewImage.imageUrl">{{ getText('buttonLabel_openOriginal') }}</a>
          <button type="button" class="ui-button" @click="copyImageUrl">{{ getText('buttonLabel_copyLink') }}</button>
        </div>
        <p v-if="previewImage.imageUrl" class="copy-status" :class="{'is-error': copyFailed}" role="status">{{ copyStatus }}</p>
      </header>

      <picture v-show="!previewUnavailable" class="image-preview">
        <source :srcset="previewImage.imageDataUrl" :type="previewImage.imageType" />
        <img
          class="image"
          :src="previewImage.imageDataUrl"
          @error.once="onPreviewImageError"
          @load="onPreviewImageLoad"
          :alt="previewImage.imageFilename || getText('pageTitle_view')"
        />
      </picture>
      <p v-if="previewUnavailable" class="image-preview-notice" role="status">{{ getText('status_previewUnavailable') }}</p>
    </main>

    <main v-else-if="showError" class="error-content">
      <h1>{{ getText('pageTitle_view') }}</h1>
      <p role="status">{{ showError }}</p>
    </main>
  </vn-app>
</template>

<script>
import {App} from 'vueton';

import {
  validateId,
  getFormattedImageDetails,
  isPreviewImageValid,
  sendLargeMessage
} from 'utils/app';
import {getText} from 'utils/common';

export default {
  components: {
    [App.name]: App
  },

  data: function () {
    return {
      dataLoaded: false,
      showError: '',

      previewImage: null,
      imageDetails: [],
      imageLoaded: false,

      previewUnavailable: false,
      copyStatus: '',
      copyFailed: false
    };
  },

  methods: {
    getText,

    initSetup: async function () {
      try {
        await this.setup();
      } catch (err) {
        this.showError = getText('error_internalError');

        throw err;
      } finally {
        this.dataLoaded = true;
      }
    },

    setup: async function () {
      document.documentElement.lang = browser.i18n.getUILanguage() || 'en';
      const storageId = new URL(window.location.href).searchParams.get('id');

      if (validateId(storageId)) {
        const image = await sendLargeMessage({
          message: {
            id: 'storageRequest',
            asyncResponse: true,
            saveReceipt: true,
            storageId
          },
          transferResponse: true,
          openConnection: this.$env.isSafari
        });

        if (image) {
          this.previewImage = image;

          document.title = getText('pageTitle', [
            image.imageFilename || getText('pageTitle_view'),
            getText('extensionName')
          ]);
        } else {
          this.showError = getText('error_sessionExpired');
        }
      } else {
        this.showError = getText('error_invalidPageUrl');
      }
    },

    onPreviewImageLoad: function () {
      this.setPreviewImageLoaded();
    },

    onPreviewImageError: function () {
      this.previewUnavailable = true;
    },

    setPreviewImageLoaded: function () {
      if (!this.imageLoaded) {
        this.setImageDetails();

        this.imageLoaded = true;
      }
    },

    setImageDetails: function () {
      const node = document.querySelector('.image-preview .image');

      let imageWidth, imageHeight;
      if (isPreviewImageValid(node)) {
        imageWidth = node.naturalWidth;
        imageHeight = node.naturalHeight;
      }

      this.imageDetails = getFormattedImageDetails({
        width: imageWidth,
        height: imageHeight,
        size: this.previewImage.imageSize,
        type: this.previewImage.imageType,
        iecSize: !this.$env.isWindows
      });
    },

    copyImageUrl: async function () {
      try {
        await navigator.clipboard.writeText(this.previewImage.imageUrl);
        this.copyFailed = false;
        this.copyStatus = getText('status_imageLinkCopied');
      } catch {
        this.copyFailed = true;
        this.copyStatus = getText('error_copyImageLink');
      }
    }
  },

  created: function () {
    this.initSetup();
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;

@include vueton.theme-base;

html, body, .vn-app, .v-application__wrap {min-height: 100%}
.vn-app {background: var(--ui-bg); color: var(--ui-text)}
.view-content, .error-content {
  box-sizing: border-box;
  padding: 20px;
  font: 14px/1.4 var(--ui-font);
}
.view-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  height: 100dvh;
}
.image-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 16px;
  width: min(960px, 100%);
  padding: 12px 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-surface);
}
.image-identity {flex: 1 1 14rem; min-width: 0}
.image-header h1, .error-content h1 {margin: 0; font-size: 18px; line-height: 1.25; overflow-wrap: anywhere}
.image-data, .copy-status, .image-preview-notice {margin: 0; color: var(--ui-muted); font-size: 12px}
.image-data {margin-top: 4px}
.image-link-actions {display: flex; flex-wrap: wrap; gap: 4px}
.copy-status {flex-basis: 100%}
.copy-status:empty {position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)}
.copy-status.is-error, .error-content p {color: var(--ui-notice)}
.image-preview {display: flex; flex: 1; align-items: center; justify-content: center; width: 100%; min-height: 0}
.image-preview .image {display: block; object-fit: contain; max-width: 100%; max-height: 100%}
.image-preview-notice {margin: auto; font-size: 14px}
.error-content {max-width: 580px; margin: auto}
.error-content p {margin: 8px 0 0}

@media (max-width: 380px) {
  .view-content {padding: 12px}
  .image-header {padding: 10px 12px}
}
</style>
