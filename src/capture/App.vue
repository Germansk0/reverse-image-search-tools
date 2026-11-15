<template>
  <vn-app :class="appClasses">
    <div class="capture-layout">
      <div ref="canvasWrap" class="canvas-wrap">
        <canvas id="canvas"></canvas>
      </div>
      <div v-if="captureOpen" class="capture-toolbar" role="group" :aria-label="getText('snackbarMessage_imageCapture')">
        <button type="button" class="ui-button ui-quiet ui-icon-button" :aria-label="getText('buttonTooltip_close')" @click="onCancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
        <p>{{ getText('snackbarMessage_imageCapture') }}</p>
        <button type="button" class="ui-button ui-primary" :disabled="!hasCaptureArea" @click="onCapture">
          {{ getText(forPanel ? 'buttonLabel_useCapture' : 'buttonLabel_search') }}
        </button>
      </div>
    </div>
  </vn-app>
</template>

<script>
import Cropper from 'cropperjs';
import {App} from 'vueton';

import {validateId} from 'utils/app';
import {getText} from 'utils/common';

export default {
  components: {
    [App.name]: App
  },

  data: function () {
    return {
      canvasHidden: false,
      hasCaptureArea: false,
      forPanel: false,
      captureOpen: false
    };
  },

  computed: {
    appClasses: function () {
      return {
        'canvas-hidden': this.canvasHidden
      };
    }
  },

  rawData: {
    session: null
  },

  methods: {
    getText,

    setup: async function () {
      document.title = getText('snackbarMessage_imageCapture');
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
              this.onMessage(message);
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
    },

    onMessage: function (request, sender) {
      // Samsung Internet 13: extension messages are sometimes also dispatched
      // to the sender frame.
      if (sender && sender.url === document.URL) {
        return;
      }

      if (request.id === 'openView') {
        this.$options.rawData.session = request.session;
        this.forPanel = Boolean(request.session.captureRequestId);
        this.showCapture();
      } else if (request.id === 'closeView') {
        if (request.captureRequestId && request.captureRequestId !== this.$options.rawData.session?.captureRequestId) return;
        this.hideCapture();
      }
    },

    onEscape: function (event) {
      if (event.key !== 'Escape' || !this.captureOpen) return;
      event.preventDefault();
      event.stopPropagation();
      this.onCancel();
    },

    onCancel: function () {
      this.hideCapture();
      browser.runtime.sendMessage({
        id: 'cancelView', view: 'capture', captureRequestId: this.$options.rawData.session?.captureRequestId
      });
    },

    onCapture: function () {
      const area = this.getCaptureArea();
      const session = this.$options.rawData.session;

      if (!area.width) {
        browser.runtime.sendMessage({
          id: 'notification',
          messageId: 'error_invalidCaptureArea'
        });
        return;
      }

      this.$refs.canvasWrap.addEventListener(
        'transitionend',
        () => {
          browser.runtime.sendMessage({
            id: 'imageCaptureSubmit',
            session,
            area
          });
        },
        {capture: true, once: true}
      );

      this.hideCapture();
    },

    getCaptureArea: function () {
      const area = this.cropper.getCropBoxData();
      // include crop area margins
      area.top += 4;
      area.left += 4;

      return area;
    },

    showCapture: function () {
      this.captureOpen = true;
      this.canvasHidden = false;
      if (!this.cropper) {
        this.cropper = new Cropper(document.getElementById('canvas'), {
          checkCrossOrigin: false,
          checkOrientation: false,
          background: false,
          modal: false,
          guides: false,
          center: false,
          highlight: false,
          autoCrop: false,
          movable: false,
          rotatable: false,
          scalable: false,
          zoomable: false,
          toggleDragModeOnDblclick: false,
          minCropBoxWidth: 1,
          minCropBoxHeight: 1,
          crop: () => {
            const area = this.cropper?.getCropBoxData();
            this.hasCaptureArea = Boolean(area?.width && area.height);
          }
        });
      }
    },

    hideCapture: function () {
      this.captureOpen = false;
      this.canvasHidden = true;
      this.hasCaptureArea = false;
      if (this.cropper) {
        this.cropper.clear();
      }
    }
  },

  mounted: function () {
    window.addEventListener('keydown', this.onEscape, true);
    this.setup();
  },

  beforeUnmount: function () {
    window.removeEventListener('keydown', this.onEscape, true);
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;
@use 'cropperjs/dist/cropper';

@include vueton.theme-base;
@include vueton.transitions;

html,
body,
.vn-app,
.v-application__wrap,
#canvas {
  width: 100%;
  height: 100%;
}

body {
  overflow: hidden;
}

.v-application {
  background: transparent !important;
}

.capture-layout {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 4px 4px calc(8px + env(safe-area-inset-bottom, 0px));
}

.canvas-wrap {
  flex: 1;
  min-height: 0;
  isolation: isolate;
}

.capture-toolbar {
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  align-self: center;
  gap: 8px;
  max-width: calc(100% - 8px);
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: 14px/1.4 var(--ui-font);
}

.capture-toolbar p {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.capture-toolbar .ui-primary {
  flex-shrink: 0;
  max-width: 55%;
  overflow-wrap: anywhere;
}

.canvas-hidden .canvas-wrap {
  transition: opacity 0.001s;
  opacity: 0;
}

.cropper-modal,
.cropper-view-box,
.cropper-line {
  display: none;
}

.cropper-crop-box::before {
  content: ' ';
  position: absolute;
  width: 100%;
  height: 100%;
  box-shadow: 0 0 0 20000px rgba(0, 0, 0, 0.4);
}

.cropper-point {
  background-color: transparent;

  &.point-e,
  &.point-w {
    top: 0;
    margin-top: 16px;
    width: 32px;
    height: calc(100% - 32px);
    cursor: ew-resize;
  }

  &.point-n,
  &.point-s {
    left: 0;
    margin-left: 16px;
    width: calc(100% - 32px);
    height: 32px;
    cursor: ns-resize;
  }

  &.point-e {
    right: -16px;
  }

  &.point-n {
    top: -16px;
  }

  &.point-w {
    left: -16px;
  }

  &.point-s {
    bottom: -16px;
  }

  &.point-ne,
  &.point-nw,
  &.point-sw,
  &.point-se {
    position: absolute;
    width: 32px;
    height: 32px;

    user-select: none;
    touch-action: none;
    opacity: 1;

    &::before {
      all: initial;
    }

    &::after {
      position: absolute;
      box-sizing: border-box;
      width: 16px;
      height: 16px;
      content: '';
      color: var(--md-ref-palette-primary50);
    }
  }

  &.point-ne {
    top: -16px;
    right: -16px;
    cursor: nesw-resize;

    &::after {
      top: 14px;
      right: 14px;
      border-top: 4px solid;
      border-right: 4px solid;
      border-top-right-radius: 6px;
    }
  }

  &.point-nw {
    top: -16px;
    left: -16px;
    cursor: nwse-resize;

    &::after {
      top: 14px;
      left: 14px;
      border-top: 4px solid;
      border-left: 4px solid;
      border-top-left-radius: 6px;
    }
  }

  &.point-sw {
    bottom: -16px;
    left: -16px;
    cursor: nesw-resize;

    &::after {
      bottom: 14px;
      left: 14px;
      border-bottom: 4px solid;
      border-left: 4px solid;
      border-bottom-left-radius: 6px;
    }
  }

  &.point-se {
    right: -16px;
    bottom: -16px;
    cursor: nwse-resize;

    &::after {
      right: 14px;
      bottom: 14px;
      border-right: 4px solid;
      border-bottom: 4px solid;
      border-bottom-right-radius: 6px;
    }
  }
}

.v-theme--dark {
  & .cropper-point {
    &.point-ne,
    &.point-nw,
    &.point-sw,
    &.point-se {
      &::after {
        color: var(--md-ref-palette-primary60);
      }
    }
  }
}
</style>
