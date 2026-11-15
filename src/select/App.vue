<template>
  <vn-app>
    <vn-snackbar class="ui-snackbar" v-model="openSnackbar" :timeout="-1">
      <button type="button" class="ui-button ui-quiet ui-icon-button" :aria-label="getText('buttonTooltip_close')" @click="onCancel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>

      {{ getText('snackbarMessage_imageSelection') }}
    </vn-snackbar>
  </vn-app>
</template>

<script>
import {App, Snackbar} from 'vueton';

import {validateId} from 'utils/app';
import {getText} from 'utils/common';

export default {
  components: {
    [App.name]: App,
    [Snackbar.name]: Snackbar
  },

  data: function () {
    return {
      openSnackbar: false
    };
  },

  rawData: {
    session: null
  },

  methods: {
    getText,

    setup: async function () {
      document.title = getText('snackbarMessage_imageSelection');
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
        // Safari 18: extension pages loaded in iframes can no longer connect
        // to the content script of the top-level document with tabs.connect,
        // event handlers registered with runtime.onConnect
        // in the content script are no longer called.

        // Messages sent from the background script using tabs.sendMessage
        // are still not received by the extension page in Safari, so we must
        // notify the extension page from the content script using
        // frame.contentWindow.postMessage to retrieve its message
        // from the background script.

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
        this.showSnackbar();
      } else if (request.id === 'closeView') {
        this.hideSnackbar();
      } else if (request.id === 'imageSelectionSubmit') {
        this.hideSnackbar();

        const session = this.$options.rawData.session;
        session.sourceFrameId = request.senderFrameId;

        browser.runtime.sendMessage({id: request.id, session});
      }
    },

    onEscape: function (event) {
      if (event.key !== 'Escape' || !this.openSnackbar) return;
      event.preventDefault();
      event.stopPropagation();
      this.onCancel();
    },

    onCancel: function () {
      this.hideSnackbar();
      browser.runtime.sendMessage({id: 'cancelView', view: 'select'});
    },

    showSnackbar: function () {
      this.openSnackbar = true;
    },

    hideSnackbar: function () {
      this.openSnackbar = false;
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

@include vueton.theme-base;
@include vueton.transitions;

html,
body,
.vn-app,
.v-application__wrap {
  width: 100%;
  height: 100%;
}

.v-application {
  background: transparent !important;
}

</style>
