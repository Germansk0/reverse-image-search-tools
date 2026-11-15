<template>
  <vn-app>
    <vn-dialog
      class="ui-dialog"
      v-model="showDialog"
      content-class="confirmation-dialog__content"
      :aria-label="getText('dialogTitle_imageConfirmation')"
      transition="scale-transition"
      scrollable
      persistent
    >
      <vn-card>
        <vn-card-title>{{
          getText('dialogTitle_imageConfirmation')
        }}</vn-card-title>

        <vn-card-text tabindex="-1">
          <div class="preview-images">
            <button
              class="tile-container ui-focus"
              type="button"
              :data-index="index"
              :aria-label="img.image.imageFilename ? undefined : getText('buttonLabel_selectImageNumber', [String(index + 1)])"
              @click="onSelection"
              v-for="(img, index) in previewImages"
              :key="index"
            >
              <picture class="image-container">
                <source
                  :srcset="img.image.imageDataUrl || img.image.imageUrl"
                />
                <img
                  class="image"
                  :src="`/src/assets/icons/misc/${
                    theme === 'dark' ? 'broken-image-dark' : 'broken-image'
                  }.svg`"
                  :data-index="index"
                  @error.once="onPreviewImageError"
                  @load="onPreviewImageLoad"
                  :alt="img.image.imageFilename"
                />
              </picture>

              <span class="image-details" v-if="imagesLoaded">
                <template
                  v-if="
                    imageSizesDiffer &&
                    (img.imageWidth === largestImageWidth ||
                      img.imageHeight === largestImageHeight ||
                      img.imageDimension === largestImageDimension)
                  "
                >
                  <span class="image-dimension-icon-container">
                    <vn-icon
                      class="image-dimension-icon"
                      src="/src/assets/icons/misc/swap-horiz.svg"
                      :title="getText('pageContent_widest_image')"
                      v-if="
                        img.imageWidth === largestImageWidth &&
                        img.imageHeight < largestImageHeight
                      "
                    ></vn-icon>
                    <vn-icon
                      class="image-dimension-icon"
                      src="/src/assets/icons/misc/swap-vert.svg"
                      :title="getText('pageContent_tallest_image')"
                      v-if="
                        img.imageHeight === largestImageHeight &&
                        img.imageWidth < largestImageWidth
                      "
                    ></vn-icon>
                    <vn-icon
                      class="image-dimension-icon"
                      src="/src/assets/icons/misc/open-with.svg"
                      :title="getText('pageContent_largest_image')"
                      v-if="img.imageDimension === largestImageDimension"
                    ></vn-icon>
                  </span>
                  <span class="image-data-separator">•</span>
                </template>

                <template
                  v-for="(detail, detailIndex) in filterImageDetails(
                    img.imageDetails
                  )"
                  :key="detailIndex"
                >
                  <span class="image-data-separator" v-if="detailIndex">•</span>
                  <span :class="{[`image-${detail.kind}-text`]: true}">
                    {{ detail.text }}
                  </span>
                </template>
              </span>
            </button>
          </div>
        </vn-card-text>

        <vn-card-actions>
          <button type="button" class="ui-button ui-quiet" @click="onCancel">
            {{ getText('buttonLabel_cancel') }}
          </button>
        </vn-card-actions>
      </vn-card>
    </vn-dialog>
  </vn-app>
</template>

<script>
import {markRaw} from 'vue';
import {
  App,
  Card,
  CardActions,
  CardText,
  CardTitle,
  Dialog,
  Icon
} from 'vueton';

import {
  shareImage,
  getFormattedImageDetails,
  isPreviewImageValid,
  sendLargeMessage,
  processLargeMessage,
  getAppTheme,
  validateId
} from 'utils/app';
import {getText} from 'utils/common';

export default {
  components: {
    [App.name]: App,
    [Card.name]: Card,
    [CardActions.name]: CardActions,
    [CardText.name]: CardText,
    [CardTitle.name]: CardTitle,
    [Dialog.name]: Dialog,
    [Icon.name]: Icon
  },

  data: function () {
    return {
      showDialog: false,

      previewImages: [],

      imagesLoaded: false,
      largestImageWidth: 0,
      largestImageHeight: 0,
      largestImageDimension: 0,
      largestImageIndex: null,

      minWidthViewport: false,

      theme: ''
    };
  },

  computed: {
    imageSizesDiffer: function () {
      const images = this.previewImages.filter(image => image.imageDimension);
      return images.some(image =>
        image.imageWidth !== images[0].imageWidth || image.imageHeight !== images[0].imageHeight
      );
    }
  },

  rawData: {
    session: null
  },

  methods: {
    getText,

    processMessage: async function (request, sender) {
      if (request.id === 'openView') {
        this.setup(request.session, request.images);
        this.openDialog();
      } else if (request.id === 'closeView') {
        this.closeDialog();
      }
    },

    onMessage: function (request, sender) {
      processLargeMessage({
        request,
        sender,
        requestHandler: this.processMessage
      });
    },

    onCancel: function () {
      this.closeDialog();
      browser.runtime.sendMessage({id: 'cancelView', view: 'confirm'});
    },

    onSelection: async function (ev) {
      this.closeDialog();

      const image = this.previewImages[ev.currentTarget.dataset.index].image;

      if (this.$options.rawData.session.sessionType === 'share') {
        await shareImage(image, {
          convert: this.$options.rawData.session.options.convertSharedImage
        });
        browser.runtime.sendMessage({id: 'cancelView', view: 'confirm'});
      } else {
        await sendLargeMessage({
          message: {
            id: 'imageConfirmationSubmit',
            image,
            session: this.$options.rawData.session
          },
          openConnection: this.$env.isSafari
        });
      }
    },

    onPreviewImageLoad: function (ev) {
      this.setPreviewImageLoaded(ev.target.dataset.index);
    },

    onPreviewImageError: function (ev) {
      const source = ev.target.previousElementSibling;
      source.srcset = ev.target.src;
      source.type = 'image/svg+xml';

      this.setPreviewImageLoaded(ev.target.dataset.index);
    },

    setPreviewImageLoaded: function (index) {
      this.previewImages[index].imageLoaded = true;

      this.setImagesLoaded();
    },

    setImagesLoaded: function () {
      const imagesLoaded = this.previewImages.every(image => image.imageLoaded);

      if (imagesLoaded && !this.imagesLoaded) {
        this.setImageDetails();
        this.focusPreviewImage();

        this.imagesLoaded = true;
      }
    },

    setImageDetails: function () {
      for (const node of document.querySelectorAll('.preview-images .image')) {
        const index = node.dataset.index;
        const img = this.previewImages[index];

        if (isPreviewImageValid(node)) {
          img.imageWidth = node.naturalWidth;
          img.imageHeight = node.naturalHeight;
          img.imageDimension = img.imageWidth * img.imageHeight;

          if (img.imageDimension > this.largestImageDimension) {
            this.largestImageDimension = img.imageDimension;
            this.largestImageIndex = index;
          }

          if (img.imageWidth > this.largestImageWidth) {
            this.largestImageWidth = img.imageWidth;
          }

          if (img.imageHeight > this.largestImageHeight) {
            this.largestImageHeight = img.imageHeight;
          }
        }

        img.imageDetails = getFormattedImageDetails({
          width: img.imageWidth,
          height: img.imageHeight,
          size: img.image.imageSize,
          type: img.image.imageType,
          iecSize: !this.$env.isWindows
        });
      }
    },

    filterImageDetails: function (details) {
      return details.filter(item =>
        item.kind === 'size' && !this.minWidthViewport ? false : true
      );
    },

    addPreviewImages: function (images) {
      this.previewImages = images.map(image => ({
        image: markRaw(image),
        imageWidth: 0,
        imageHeight: 0,
        imageDimension: 0,
        imageLoaded: false,
        imageDetails: []
      }));
    },

    focusPreviewImage: function () {
      const node = document.querySelector(
        this.largestImageIndex !== null
          ? `.tile-container[data-index="${this.largestImageIndex}"]`
          : '.tile-container'
      );

      window.setTimeout(() => {
        if (this.showDialog && !document.activeElement?.matches('button, input, a[href]')) {
          node?.focus();
        }
      }, 300);
    },

    openDialog: function () {
      this.showDialog = true;
    },

    closeDialog: function () {
      this.showDialog = false;
    },

    initSizeListener: function () {
      const mql = window.matchMedia('(min-width: 400px)');
      mql.addEventListener('change', this.setMinWidthViewport);

      this.setMinWidthViewport(mql);

    },

    setMinWidthViewport: function (ev) {
      this.minWidthViewport = ev.matches;
    },

    setup: function (session, images) {
      this.previewImages = [];

      this.imagesLoaded = false;
      this.largestImageWidth = 0;
      this.largestImageHeight = 0;
      this.largestImageDimension = 0;
      this.largestImageIndex = null;

      this.$options.rawData.session = session;

      this.$nextTick(() => {
        this.addPreviewImages(images);
      });
    },

    init: async function () {
      document.title = getText('dialogTitle_imageConfirmation');
      document.documentElement.lang = browser.i18n.getUILanguage() || 'en';
      if (this.$env.isFirefox) {
        browser.runtime.onMessage.addListener(this.onMessage);

        browser.runtime.sendMessage({
          id: 'routeMessage',
          setSenderFrameId: true,
          messageFrameId: 0,
          message: {id: 'saveFrameId'}
        });
      } else if (this.$env.isSafari) {
        window.addEventListener('message', async ev => {
          const messageId = ev.data;

          if (validateId(messageId)) {
            const message = await browser.runtime.sendMessage({
              id: 'storageRequest',
              asyncResponse: true,
              saveReceipt: true,
              storageId: messageId
            });

            if (message) {
              this.processMessage(message);
            }
          }
        });

        browser.runtime.sendMessage({
          id: 'routeMessage',
          setSenderFrameId: true,
          messageFrameId: 0,
          message: {id: 'saveFrameId'}
        });
      } else {
        const tab = await browser.tabs.getCurrent();
        this.contentMessagePort = browser.tabs.connect(tab.id, {
          name: 'view',
          frameId: 0
        });
        this.contentMessagePort.onMessage.addListener(this.onMessage);
      }

      this.theme = await getAppTheme();
      document.addEventListener('themeChange', ev => {
        this.theme = ev.detail;
      });

      window.addEventListener(
        'keydown',
        ev => {
          if (ev.key === 'Escape' && this.showDialog) {
            ev.preventDefault();
            ev.stopImmediatePropagation();

            this.onCancel();
          }
        },
        {capture: true, passive: false}
      );

      this.initSizeListener();
    }
  },

  mounted: function () {
    this.init();
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;

@include vueton.theme-base;
@include vueton.transitions;

.v-application {
  background: transparent !important;
}

.vn-dialog {
  & .confirmation-dialog__content {
    transform-origin: center center !important;

    width: initial !important;
    max-width: calc(100% - 24px) !important;
    max-height: calc(100% - 32px) !important;

  }
}

.preview-images {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;

  max-width: 248px;
  @media (min-width: 400px) {
    max-width: 320px;
  }
  @media (min-width: 760px) {
    max-width: 680px;
  }
  @media (min-width: 1096px) {
    max-width: 1016px;
  }
}

.tile-container {
  display: block;
  width: min(248px, 100%);
  height: 226px;
  @media (min-width: 400px) {
    width: min(320px, 100%);
    height: 280px;
  }
  padding: 16px;
  border: 0;
  border-radius: var(--ui-control-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  box-sizing: border-box;
  position: relative;
  cursor: pointer;
  z-index: 1;
}

.tile-container:focus-visible {
  outline-offset: -2px;
}

.tile-container:focus-visible,
.tile-container:hover {
  background: var(--ui-subtle);
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 162px;
  @media (min-width: 400px) {
    height: 216px;
  }
}

.image {
  display: flex;
  object-fit: scale-down;
  max-width: 100%;
  max-height: 162px;
  @media (min-width: 400px) {
    max-height: 216px;
  }
}

.image-details {
  display: flex;
  align-items: center;
  justify-content: center;
  column-gap: 6px;
  margin-top: 12px;
  max-width: 100%;
  height: 24px;
}

.image-dimension-icon-container {
  display: flex;
  align-items: center;
  column-gap: 3px;
}

.image-dimension-icon {
  width: 14px !important;
  height: 14px !important;
}

.image-dimension-text,
.image-size-text,
.image-type-text,
.image-data-separator {
  color: var(--ui-muted);
  font: 12px/1.35 var(--ui-font);
  white-space: nowrap;
}

.image-type-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.visible {
  opacity: 1 !important;
}
</style>
