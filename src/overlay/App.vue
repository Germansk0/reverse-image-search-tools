<template>
  <vn-app>
    <vn-dialog
      class="ui-dialog"
      v-model="showDialog"
      :aria-label="dialogTitle"
      content-class="overlay-dialog__content"
      transition="scale-transition"
      scrollable
      persistent
    >
      <vn-card>
        <vn-card-title>{{ dialogTitle }}</vn-card-title>

        <vn-divider :class="separatorClasses"></vn-divider>

        <vn-card-text>
          <div class="dialog-text">{{ dialogText }}</div>
        </vn-card-text>

        <vn-divider :class="separatorClasses"></vn-divider>

        <vn-card-actions>
          <button type="button" class="ui-button ui-quiet" @click="onCancel">
            {{ getText('buttonLabel_close') }}
          </button>
        </vn-card-actions>
      </vn-card>
    </vn-dialog>
  </vn-app>
</template>

<script>
import {
  App,
  Card,
  CardActions,
  CardText,
  CardTitle,
  Dialog,
  Divider
} from 'vueton';

import {getAppTheme, validateId} from 'utils/app';
import {getText} from 'utils/common';

export default {
  components: {
    [App.name]: App,
    [Card.name]: Card,
    [CardActions.name]: CardActions,
    [CardText.name]: CardText,
    [CardTitle.name]: CardTitle,
    [Dialog.name]: Dialog,
    [Divider.name]: Divider
  },

  data: function () {
    return {
      showDialog: false,
      hasScrollBar: false,

      isDialog: false,

      dialogTitle: '',
      dialogText: '',

      theme: ''
    };
  },

  computed: {
    separatorClasses: function () {
      return {
        visible: this.hasScrollBar
      };
    }
  },

  rawData: {
    session: null
  },

  methods: {
    getText,

    processMessage: async function (request, sender) {
      if (request.id === 'openView') {
        this.setup(request.session, request.message);

        if (this.isDialog) {
          this.openDialog();
        }
      } else if (request.id === 'closeView') {
        if (this.isDialog) {
          this.closeDialog();
        }
      }
    },

    onMessage: function (request, sender) {
      this.processMessage(request, sender);
    },

    onCancel: function () {
      this.closeDialog();
      browser.runtime.sendMessage({id: 'cancelView', view: 'overlay'});
    },

    openDialog: function () {
      this.showDialog = true;
    },

    closeDialog: function () {
      this.showDialog = false;
    },

    initResizeObservers: function () {
      const observer = new ResizeObserver(this.configureScrollBar);
      const content = document.querySelector('.dialog-text');
      observer.observe(content);
      observer.observe(content.parentNode);

      this.configureScrollBar();
    },

    configureScrollBar: function () {
      const content = document.querySelector('.dialog-text').parentNode;

      this.hasScrollBar = content.scrollHeight > content.clientHeight;
    },

    setup: function (session, message) {
      this.$options.rawData.session = session;

      if (message.overlayType === 'dialog') {
        this.isDialog = true;

        this.initResizeObservers();

        this.dialogTitle = message.dialogTitle;
        this.dialogText = message.dialogText;
        document.title = this.dialogTitle;
      }
    },

    init: async function () {
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
          if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopImmediatePropagation();

            this.onCancel();
          }
        },
        {capture: true, passive: false}
      );
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
  & .overlay-dialog__content {
    transform-origin: center center !important;

    width: initial !important;
    max-width: calc(100% - 24px) !important;
    max-height: calc(100% - 32px) !important;

    & .vn-card {
      & .vn-divider {
        opacity: 0;
        transition: none;
      }

    }
  }
}

.dialog-text {
  max-width: 248px;
  @media (min-width: 400px) {
    max-width: 320px;
  }
  @media (min-width: 720px) {
    max-width: 560px;
  }
}

.visible {
  opacity: 1 !important;
}
</style>
