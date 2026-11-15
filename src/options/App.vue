<template>
  <vn-app v-if="dataLoaded" :class="[appClasses, `settings-theme-${theme}`]">
    <main class="options-shell">
    <header class="options-header">
      <h1 ref="settingsHeading" class="ui-focus" tabindex="-1">Settings</h1>
      <p class="save-status" :class="{'is-error': saveFailures.length}">
        <span role="status">{{ saveStatus }}</span>
        <button v-if="saveFailures.length" ref="retrySaveButton" type="button" class="ui-button ui-link" :disabled="pendingSaves > 0" @click="retryFailedSaves">Retry</button>
      </p>
    </header>
    <div class="settings-grid">
    <section class="section-engines settings-card" aria-labelledby="engines-heading" aria-describedby="help-engines">
      <div class="card-heading">
        <h2 id="engines-heading" class="section-title">Search engines</h2>
        <button ref="engineCatalogButton" type="button" class="ui-button ui-link" :aria-expanded="engineCatalogOpen" aria-controls="settings-engine-list" @click="toggleEngineCatalog">
          {{ engineCatalogOpen ? 'Show enabled only' : enabledEngineCount < availableEngines.length ? 'Add engines' : 'Find engines' }}
        </button>
      </div>
      <p id="help-engines" class="setting-detail engine-intro">{{ getText('optionHelp_engines') }}</p>
      <div v-if="engineCatalogOpen" class="engine-catalog">
        <label class="visually-hidden" for="engine-filter">Search all engines</label>
        <input id="engine-filter" ref="engineFilterInput" v-model.trim="engineFilter" class="ui-input" type="search" placeholder="Search all engines" autocomplete="off" />
      </div>
      <p v-if="visibleEngineCount" class="engine-help">{{ enabledEngineCount }} enabled<span v-if="visibleEngineCount > 1"> · Drag or use arrows to reorder</span></p>
      <div class="engine-undo" :class="{'has-undo': lastDisabledEngine}">
        <p role="status">{{ lastDisabledEngine ? `${getText(`engineName_${lastDisabledEngine}`)} disabled.` : '' }}</p>
        <button v-if="lastDisabledEngine" type="button" class="ui-button ui-link" @click="undoEngineDisable">Undo</button>
      </div>
      <v-draggable
        v-show="visibleEngineCount"
        id="settings-engine-list"
        class="engine-list"
        v-model="visibleEngines"
        :item-key="engine => engine"
        handle=".drag-handle"
        :delay="120"
        :delay-on-touch-only="true"
        :touch-start-threshold="5"
        :animation="dragAnimation"
        ghost-class="engine-ghost"
        @change="announceEngineChange"
      >
        <template #item="{element}">
          <div class="engine-option" :data-engine="element">
            <span v-if="visibleEngineCount > 1" class="drag-handle" title="Drag to reorder" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg>
            </span>
            <label class="engine-toggle">
              <input class="ui-check" type="checkbox" :checked="engineEnabled(element)" @change="setEngineState(element, $event.target.checked)" />
              <span>{{ getText(`engineName_${element}`) }}</span>
            </label>
            <div v-if="visibleEngineCount > 1" class="move-actions">
              <button type="button" class="ui-button ui-quiet ui-icon-button" data-move="-1" title="Move up" :disabled="visibleEngines.indexOf(element) === 0" :aria-label="`Move ${getText(`engineName_${element}`)} up`" @click="moveEngine(element, -1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5m-5 5 5-5 5 5"/></svg></button>
              <button type="button" class="ui-button ui-quiet ui-icon-button" data-move="1" title="Move down" :disabled="visibleEngines.indexOf(element) === visibleEngines.length - 1" :aria-label="`Move ${getText(`engineName_${element}`)} down`" @click="moveEngine(element, 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14m-5-5 5 5 5-5"/></svg></button>
            </div>
          </div>
        </template>
      </v-draggable>
      <div v-if="!visibleEngineCount" class="engine-empty">
        <p role="status">{{ engineCatalogOpen ? 'No engines match this filter.' : 'Enable an engine to start searching.' }}</p>
        <button v-if="engineCatalogOpen && engineFilter" type="button" class="ui-button ui-link" @click="clearEngineFilter">Clear filter</button>
      </div>
      <p class="visually-hidden" role="status">{{ reorderNotice }}</p>
    </section>

    <section class="section-context-menu settings-card" v-if="contextMenuEnabled">
      <h2 class="section-title">Right-click menu</h2>
      <div class="option-wrap">
        <div v-if="!$env.isChrome || enabledEngineCount <= 1" class="option">
          <vn-switch
            label="Show on right-click"
            aria-describedby="help-showInContextMenu"
            v-model="options.showInContextMenu"
          ></vn-switch>
          <p id="help-showInContextMenu" class="setting-detail">{{ getText('optionHelp_showInContextMenu') }}</p>
        </div>
        <div class="setting-select" v-if="searchAllEnginesEnabled && enabledEngineCount > 1 && ($env.isChrome || options.showInContextMenu)">
          <label for="setting-menuLayout">Menu layout</label>
          <select id="setting-menuLayout" class="ui-input" v-model="rightClickLayout" aria-describedby="help-menuLayout">
            <option v-if="$env.isChrome" value="off">Off</option>
            <option v-for="item in listItems.searchAllEnginesContextMenu" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <p id="help-menuLayout" class="setting-detail">{{ getText('optionHelp_menuLayout') }}</p>
        </div>
        <template v-if="options.showInContextMenu">
        <p v-if="enabledEngineCount === 1" class="setting-detail">Searches with {{ getText(`engineName_${enabledEngines[0]}`) }}.</p>
        <p v-if="!enabledEngineCount" class="setting-detail">Enable a search engine to add a search command to the menu.</p>
        <div class="setting-select" v-if="$env.isChrome">
          <label for="setting-openImage">{{ getText('menuItemTitle_viewImage') }}</label>
          <select id="setting-openImage" aria-describedby="help-openImage" class="ui-input" v-model="openImageCommand">
            <option value="off">Off</option>
            <option value="tab">Image tab</option>
            <option value="viewer">Extension viewer</option>
          </select>
          <p id="help-openImage" class="setting-detail">{{ getText('optionHelp_openImageCommand') }}</p>
        </div>
        <details v-if="!$env.isChrome || enabledEngineCount || options.viewImageContextMenu || shareEnabled" class="advanced-settings">
        <summary class="ui-focus">Advanced menu options</summary>
        <div class="option-wrap advanced-options">
        <div class="setting-select" v-if="!$env.isChrome || enabledEngineCount">
          <label for="setting-searchModeContextMenu">Image input</label>
          <select id="setting-searchModeContextMenu" aria-describedby="help-searchModeContextMenu" class="ui-input" v-model="options.searchModeContextMenu">
            <option v-for="item in listItems.searchModeContextMenu" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <p id="help-searchModeContextMenu" class="setting-detail">{{ getText('optionHelp_searchModeContextMenu') }}</p>
        </div>
        <template v-if="$env.isChrome && rightClickUsesImageDetection">
          <div class="option">
            <vn-switch :label="getText('optionTitle_imgFullParse')" v-model="options.imgFullParse" aria-describedby="help-imgFullParse"></vn-switch>
            <p id="help-imgFullParse" class="setting-detail">{{ getText('optionHelp_imgFullParse') }}</p>
          </div>
          <div class="option">
            <vn-switch :label="getText('optionTitle_detectAltImageDimension')" v-model="options.detectAltImageDimension" aria-describedby="help-detectAltImageDimension"></vn-switch>
            <p id="help-detectAltImageDimension" class="setting-detail">{{ getText('optionHelp_detectAltImageDimension') }}</p>
          </div>
        </template>
        <div class="option" v-if="$env.isChrome && enabledEngineCount && options.searchModeContextMenu === 'selectUrl'">
          <vn-switch :label="getText('optionTitle_bypassImageHostBlocking')" v-model="options.bypassImageHostBlocking" aria-describedby="help-bypassImageHostBlocking"></vn-switch>
          <p id="help-bypassImageHostBlocking" class="setting-detail">{{ getText('optionHelp_bypassImageHostBlocking') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome">
          <vn-switch
            label="Add ‘Open image’ to menu"
            aria-describedby="help-viewImageContextMenu"
            v-model="options.viewImageContextMenu"
          ></vn-switch>
          <p id="help-viewImageContextMenu" class="setting-detail">{{ getText('optionHelp_viewImageContextMenu') }}</p>
        </div>
        <div class="option" v-if="shareEnabled">
          <vn-switch
            label="Add ‘Share image’ to menu"
            aria-describedby="help-shareImageContextMenu"
            v-model="options.shareImageContextMenu"
          ></vn-switch>
          <p id="help-shareImageContextMenu" class="setting-detail">{{ getText('optionHelp_shareImageContextMenu') }}</p>
        </div>
        <div class="option" v-if="$env.isChrome && shareEnabled && options.shareImageContextMenu">
          <vn-switch
            :label="getText('optionTitle_convertSharedImage')"
            aria-describedby="help-convertSharedImage"
            v-model="options.convertSharedImage"
          ></vn-switch>
          <p id="help-convertSharedImage" class="setting-detail">{{ getText('optionHelp_convertSharedImage') }}</p>
        </div>
        </div>
        </details>
        </template>
      </div>
    </section>

    <section class="section-misc settings-card">
      <h2 class="section-title">Preferences</h2>
      <div class="option-wrap">
        <div class="setting-select">
          <label for="setting-appTheme">{{ getText('optionTitle_appTheme') }}</label>
          <select id="setting-appTheme" aria-describedby="help-appTheme" class="ui-input" v-model="options.appTheme">
            <option v-for="item in listItems.appTheme" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <p id="help-appTheme" class="setting-detail">{{ getText('optionHelp_appTheme') }}</p>
        </div>

        <div class="option" v-if="!$env.isAndroid">
          <vn-switch
            :label="getText('optionTitle_tabInBackgound')"
            aria-describedby="help-tabInBackgound"
            v-model="options.tabInBackgound"
          ></vn-switch>
          <p id="help-tabInBackgound" class="setting-detail">{{ getText('optionHelp_tabInBackgound') }}</p>
        </div>
        <details class="advanced-settings">
        <summary class="ui-focus">Advanced settings</summary>
        <div class="option-wrap advanced-options">
        <div class="setting-select">
          <label for="setting-panelSearchMode">Starting focus in the side panel</label>
          <select id="setting-panelSearchMode" aria-describedby="help-panelSearchMode" class="ui-input" v-model="panelSearchMode">
            <option v-for="item in listItems.searchModeAction" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <p id="help-panelSearchMode" class="setting-detail">{{ getText('optionHelp_panelSearchMode') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome">
          <vn-switch
            :label="getText('optionTitle_imgFullParse')"
            aria-describedby="help-imgFullParse"
            v-model="options.imgFullParse"
          ></vn-switch>
          <p id="help-imgFullParse" class="setting-detail">{{ getText('optionHelp_imgFullParse') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome">
          <vn-switch
            :label="getText('optionTitle_detectAltImageDimension')"
            aria-describedby="help-detectAltImageDimension"
            v-model="options.detectAltImageDimension"
          ></vn-switch>
          <p id="help-detectAltImageDimension" class="setting-detail">{{ getText('optionHelp_detectAltImageDimension') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome && shareEnabled">
          <vn-switch
            :label="getText('optionTitle_convertSharedImage')"
            aria-describedby="help-convertSharedImage"
            v-model="options.convertSharedImage"
          ></vn-switch>
          <p id="help-convertSharedImage" class="setting-detail">{{ getText('optionHelp_convertSharedImage') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome">
          <vn-switch
            :label="getText('optionTitle_viewImageUseViewer')"
            aria-describedby="help-viewImageUseViewer"
            v-model="options.viewImageUseViewer"
          ></vn-switch>
          <p id="help-viewImageUseViewer" class="setting-detail">{{ getText('optionHelp_viewImageUseViewer') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome">
          <vn-switch
            :label="getText('optionTitle_bypassImageHostBlocking')"
            aria-describedby="help-bypassImageHostBlocking"
            v-model="options.bypassImageHostBlocking"
          ></vn-switch>
          <p id="help-bypassImageHostBlocking" class="setting-detail">{{ getText('optionHelp_bypassImageHostBlocking') }}</p>
        </div>
        <div class="option" v-if="!$env.isChrome || enabledEngines.includes('googleLens')">
          <vn-switch
            :label="getText('optionTitle_localGoogle')"
            aria-describedby="help-localGoogle"
            v-model="options.localGoogle"
          ></vn-switch>
          <p id="help-localGoogle" class="setting-detail">{{ getText('optionHelp_localGoogle') }}</p>
        </div>
        <div class="setting-select" v-if="!$env.isChrome || enabledEngines.includes('yandex')">
          <label for="setting-yandexHost">{{ getText('optionTitle_yandexHost') }}</label>
          <select id="setting-yandexHost" aria-describedby="help-yandexHost" class="ui-input" v-model="options.yandexHost">
            <option v-for="item in listItems.yandexHost" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <p id="help-yandexHost" class="setting-detail">{{ getText('optionHelp_yandexHost') }}</p>
        </div>
        </div>
        </details>
      </div>
    </section>

    </div>
    </main>
  </vn-app>
</template>

<script>
import {toRaw} from 'vue';
import {App, Switch} from 'vueton';
import {includes, without} from 'lodash-es';
import draggable from 'vuedraggable';
import {applyVisibleOrder} from './engineOrder';

import storage from 'storage/storage';
import {
  getListItems,
  getAvailableEngines,
  canShare,
  getAppTheme
} from 'utils/app';
import {getText} from 'utils/common';
import {optionKeys} from 'utils/data';

export default {
  emits: ['ready', 'startupError'],
  components: {
    'v-draggable': draggable,
    [App.name]: App,
    [Switch.name]: Switch
  },

  data: function () {
    let searchModeContextMenu = ['selectUrl', 'selectImage', 'capture'];
    const searchModeAction = ['browse', 'url'];
    if (this.$env.isSamsung || (this.$env.isSafari && this.$env.isMobile)) {
      // Samsung Internet 13: tabs.captureVisibleTab fails.
      // Safari 15: captured tab image is padded on mobile.
      searchModeContextMenu = searchModeContextMenu.filter(
        item => item !== 'capture'
      );
    }

    return {
      dataLoaded: false,
      engineCatalogOpen: false,
      engineFilter: '',
      lastDisabledEngine: '',
      dragAnimation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
      reorderNotice: '',
      saveQueue: null,
      pendingSaves: 0,
      saveFailures: [],
      failedSaveControl: null,
      saveStatus: '',

      listItems: {
        ...getListItems(
          {
            searchAllEnginesContextMenu: this.$env.isChrome ? ['sub', 'main', 'false'] : ['main', 'sub', 'false']
          },
          {
            scope: this.$env.isChrome
              ? 'optionValue_chromeContextMenu'
              : 'optionValue_searchAllEnginesContextMenu'
          }
        ),
        ...getListItems(
          {searchModeContextMenu},
          {scope: 'optionValue_searchModeContextMenu'}
        ),
        ...getListItems(
          {searchModeAction},
          {scope: 'optionValue_searchModeAction'}
        ),
        ...getListItems(
          {appTheme: ['auto', 'light', 'dark']},
          {scope: 'optionValue_appTheme'}
        ),
        ...getListItems(
          {yandexHost: ['yandex_com', 'yandex_ru']},
          {scope: 'optionValue_yandexHost'}
        )
      },

      contextMenuEnabled: true,
      searchAllEnginesEnabled: true,
      shareEnabled: true,
      theme: '',

      options: {
        engines: [],
        disabledEngines: [],
        showInContextMenu: false,
        searchAllEnginesContextMenu: '',
        tabInBackgound: false,
        localGoogle: false,
        imgFullParse: false,
        searchModeAction: '',
        searchModeContextMenu: '',
        bypassImageHostBlocking: false,
        shareImageContextMenu: false,
        convertSharedImage: false,
        detectAltImageDimension: false,
        viewImageContextMenu: false,
        viewImageUseViewer: false,
        appTheme: '',
        yandexHost: ''
      }
    };
  },

  computed: {
    availableEngines: function () { return getAvailableEngines(this.options.engines); },
    enabledEngines: function () { return this.availableEngines.filter(this.engineEnabled); },
    enabledEngineCount: function () { return this.enabledEngines.length; },
    rightClickUsesImageDetection: function () {
      return (
        (this.enabledEngineCount > 0 && this.options.searchModeContextMenu !== 'capture') ||
        this.options.viewImageContextMenu ||
        (this.shareEnabled && this.options.shareImageContextMenu)
      );
    },
    rightClickLayout: {
      get: function () {
        return this.options.showInContextMenu ? this.options.searchAllEnginesContextMenu : 'off';
      },
      set: function (layout) {
        if (layout !== 'off') this.options.searchAllEnginesContextMenu = layout;
        this.options.showInContextMenu = layout !== 'off';
      }
    },
    openImageCommand: {
      get: function () {
        if (!this.options.viewImageContextMenu) return 'off';
        return this.options.viewImageUseViewer ? 'viewer' : 'tab';
      },
      set: function (mode) {
        if (mode !== 'off') this.options.viewImageUseViewer = mode === 'viewer';
        this.options.viewImageContextMenu = mode !== 'off';
      }
    },
    visibleEngineCount: function () {
      return this.visibleEngines.length;
    },
    visibleEngines: {
      get: function () { return this.engineCatalogOpen ? this.availableEngines.filter(this.engineMatches) : this.enabledEngines; },
      set: function (ordered) {
        this.options.engines = applyVisibleOrder(this.options.engines, this.visibleEngines, ordered);
      }
    },
    panelSearchMode: {
      get: function () {
        const mode = this.options.searchModeAction;
        return mode === 'url' ? 'url' : 'browse';
      },
      set: function (value) { this.options.searchModeAction = value; }
    },
    appClasses: function () {
      return {
        'show-context-menu': this.contextMenuEnabled
      };
    }
  },

  methods: {
    getText,

    setup: async function () {
      const options = await storage.get(optionKeys);

      for (const option of Object.keys(this.options)) {
        this.options[option] = options[option];

        this.$watch(
          `options.${option}`,
          async function (value) {
            this.queueOptionSave(option, value);
          },
          {deep: true}
        );
      }

      this.searchAllEnginesEnabled = !this.$env.isSamsung;

      this.contextMenuEnabled = !(this.$env.isMobile && !this.$env.isSamsung);

      this.shareEnabled = canShare(this.$env);

      this.engineCatalogOpen = !this.enabledEngineCount;

      this.theme = await getAppTheme(options.appTheme);
      document.addEventListener('themeChange', ev => {
        this.theme = ev.detail;
      });

      this.dataLoaded = true;
    },

    engineEnabled: function (engine) {
      return !includes(this.options.disabledEngines, engine);
    },

    toggleEngineCatalog: function () {
      this.engineCatalogOpen = !this.engineCatalogOpen;
      this.engineFilter = '';
      this.lastDisabledEngine = '';
      this.$nextTick(() => (this.$refs.engineFilterInput || this.$refs.engineCatalogButton)?.focus());
    },

    clearEngineFilter: function () {
      this.engineFilter = '';
      this.$refs.engineFilterInput?.focus();
    },

    engineMatches: function (engine) {
      const query = this.engineFilter.toLocaleLowerCase();
      return [this.getText(`engineName_${engine}`), this.getText(`optionTitle_${engine}`)].some(name => name.toLocaleLowerCase().includes(query));
    },

    announceEngineChange: function (event) {
      if (event.moved) {
        const {element} = event.moved;
        this.announceEnginePosition(element);
      }
    },

    announceEnginePosition: function (engine) {
      const engines = this.visibleEngines;
      this.reorderNotice = `${this.getText(`engineName_${engine}`)} moved to position ${engines.indexOf(engine) + 1} of ${engines.length}.`;
    },

    moveEngine: function (engine, direction) {
      const ordered = [...this.visibleEngines];
      const index = ordered.indexOf(engine);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      ordered.splice(index, 1);
      ordered.splice(target, 0, engine);
      this.visibleEngines = ordered;
      this.announceEnginePosition(engine);
      this.$nextTick(() => {
        const row = [...document.querySelectorAll('.engine-option')].find(item => item.dataset.engine === engine);
        const sameDirection = row?.querySelector(`[data-move="${direction}"]:not(:disabled)`);
        (sameDirection || row?.querySelector('button:not(:disabled)') || row?.querySelector('input'))?.focus();
      });
    },

    queueOptionSave: function (option, value) {
      const raw = toRaw(value);
      const snapshot = raw === undefined ? null : JSON.parse(JSON.stringify(raw));
      const control = document.activeElement;
      this.pendingSaves += 1;
      this.saveStatus = 'Saving changes…';
      this.saveQueue = (this.saveQueue || Promise.resolve()).then(async () => {
        try {
          await storage.set({[option]: snapshot});
          await browser.runtime.sendMessage({id: 'optionChange'});
          this.saveFailures = this.saveFailures.filter(item => item !== option);
          if (!this.saveFailures.length) this.failedSaveControl = null;
        } catch (err) {
          if (!this.saveFailures.includes(option)) this.saveFailures.push(option);
          if (control?.matches('input, select, [data-move]')) this.failedSaveControl = control;
          console.error('Could not save setting', option, err);
        }
        this.pendingSaves -= 1;
        this.saveStatus = this.pendingSaves ? 'Saving changes…' : (this.saveFailures.length ? 'Some changes could not be applied.' : 'Changes saved.');
      });
    },

    retryFailedSaves: async function () {
      if (this.pendingSaves) return;
      const hadFocus = document.activeElement === this.$refs.retrySaveButton;
      const control = this.failedSaveControl;
      for (const option of [...this.saveFailures]) this.queueOptionSave(option, this.options[option]);
      await this.saveQueue;
      await this.$nextTick();
      if (hadFocus && document.activeElement === document.body) {
        const returnTarget = control?.isConnected && !control.disabled ? control : this.$refs.settingsHeading;
        (this.$refs.retrySaveButton || returnTarget)?.focus();
      }
    },

    setEngineState: function (engine, enabled) {
      if (enabled) {
        this.options.disabledEngines = without(
          this.options.disabledEngines,
          engine
        );
      } else {
        const index = this.visibleEngines.indexOf(engine);
        this.options.disabledEngines.push(engine);
        if (!this.engineCatalogOpen) {
          this.lastDisabledEngine = engine;
          this.$nextTick(() => {
            if (document.activeElement !== document.body) return;
            const inputs = this.$el.querySelectorAll('.engine-option input');
            (inputs[Math.min(index, inputs.length - 1)] || this.$refs.engineCatalogButton)?.focus();
          });
        }
      }
    },

    undoEngineDisable: function () {
      const engine = this.lastDisabledEngine;
      this.setEngineState(engine, true);
      this.lastDisabledEngine = '';
      this.$nextTick(() => this.$el.querySelector(`[data-engine="${engine}"] input`)?.focus());
    }
  },

  created: async function () {
    document.title = getText('pageTitle', [
      getText('pageTitle_options'),
      getText('extensionName')
    ]);

    this.setup()
      .then(() => this.$emit('ready'))
      .catch(error => this.$emit('startupError', error));
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;
@include vueton.theme-base;
@include vueton.transitions;

.vn-app {
  background: var(--ui-bg);
  color: var(--ui-text);
}
.vn-app .v-application__wrap {min-height: 100vh; display: block}
.options-shell {
  box-sizing: border-box;
  max-width: 1050px;
  margin: auto;
  padding: 40px 28px 60px;
  font: 14px/1.4 var(--ui-font);
}
.options-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 20px;
}
.options-header h1 {font-size: 30px; line-height: 1.15; letter-spacing: -.035em; margin: 0}
.save-status {color: var(--ui-muted); font-size: 12px; margin: 0}
.save-status.is-error {
  position: fixed;
  z-index: 5;
  inset-inline-end: 16px;
  inset-block-end: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(440px, calc(100% - 32px));
  padding: 8px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-surface);
  color: var(--ui-notice);
}
.options-shell:has(.save-status.is-error) {padding-bottom: 100px}
.save-status .ui-link {min-height: 28px; color: inherit; padding: 2px 6px}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(300px, 1.12fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}
.settings-card {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-surface);
  padding: 20px;
  min-width: 0;
}
.section-engines {grid-row: span 3}
.card-heading {
  display: flex;
  gap: 4px 8px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}
.card-heading .ui-link {min-height: 24px; padding: 2px 4px}
.section-title {font-size: 18px; line-height: 1.25; font-weight: 700; letter-spacing: -.025em; margin: 0}
.engine-catalog {margin-top: 8px}
#engine-filter {width: 100%}
.engine-help,
.setting-detail {color: var(--ui-muted); font-size: 12px; line-height: 1.4}
.engine-help {margin: 4px 0 8px}
.engine-undo {display: flex; align-items: center; gap: 6px; color: var(--ui-muted); font-size: 13px}
.engine-undo.has-undo {margin: 0 0 4px}
.engine-undo p,
.setting-detail {margin: 0}
.engine-intro {margin-top: 4px}
.engine-undo .ui-link {padding-inline: 5px}

.engine-list {max-height: 625px; overflow-y: auto; scrollbar-width: thin}
.engine-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 4px;
  border-bottom: 1px solid var(--ui-border);
}
.engine-option:last-child {border-bottom: 0}
.engine-option:hover,
.engine-option:focus-within {background: var(--ui-subtle)}
.engine-toggle {display: flex; align-items: center; gap: 8px; min-width: 0; min-height: var(--ui-control-height); flex: 1; cursor: pointer}
.engine-toggle span {overflow-wrap: anywhere}
.drag-handle {
  display: grid;
  place-items: center;
  width: 28px;
  min-height: var(--ui-control-height);
  border-radius: var(--ui-control-radius);
  color: var(--ui-muted);
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.drag-handle svg {width: 16px; height: 16px}
.drag-handle:hover {background: var(--ui-hover); color: var(--ui-accent)}
.drag-handle:active {cursor: grabbing}
.engine-ghost {background: var(--ui-subtle); opacity: .65}
.move-actions {display: flex; flex: none}
.move-actions .ui-button:disabled {opacity: .27}
.engine-empty {color: var(--ui-muted); font-size: 13px; margin: 12px 0 0}
.engine-empty p {margin: 0}
.engine-empty .ui-link {min-height: 28px; padding: 0 4px; font-size: inherit}

.option-wrap {display: grid; gap: 12px; padding-top: 12px}
.option {display: grid; min-width: 0}
.option > .vn-switch {min-width: 0; --v-input-control-height: 40px}
.option .setting-detail {margin-inline-start: 54px}
.options-shell .vn-switch .v-selection-control {min-width: 0}
.options-shell .vn-switch .v-selection-control__wrapper {flex: none}
.options-shell .vn-switch .v-label {
  font: 400 14px/1.4 var(--ui-font);
  color: var(--ui-text);
  opacity: 1;
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: clip;
}
.setting-select {display: grid; gap: 5px; min-width: 0; font-size: 13px; font-weight: 650}
.setting-select .setting-detail {font-weight: 400}
.setting-select select {appearance: auto; width: 100%; min-width: 0}
.advanced-settings {border-top: 1px solid var(--ui-border); padding-top: 12px}
.advanced-settings summary {min-height: 24px; color: var(--ui-accent); font-size: 13px; font-weight: 650; cursor: pointer}
.advanced-options {padding-top: 12px}
.visually-hidden {position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0}

@media (max-width: 760px) {
  .options-shell {padding: 24px 16px 48px}
  .settings-grid {grid-template-columns: minmax(0, 1fr)}
  .section-engines {grid-row: auto}
  .engine-list {max-height: 450px}
}
@media (max-width: 380px) {
  .options-shell {--ui-control-height: 32px}
  .settings-card {padding: 16px}
  .engine-option {gap: 3px}
  .drag-handle {width: 24px}
}
</style>
