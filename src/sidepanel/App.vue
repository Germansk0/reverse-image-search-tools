<template>
  <vn-app v-show="dataLoaded" :class="`theme-${theme}`">
    <main v-show="!selectorOpen" class="sidebar-prototype" aria-label="Reverse Image Search Tools" @dragover.prevent="onSidebarDragOver" @dragleave="onSidebarDragLeave" @drop.prevent="onSidebarDrop" @keydown.esc="onCaptureEscape">
      <header class="panel-header">
        <h1 :class="{'source-heading': hasSource}" :title="hasSource ? panelTitle : undefined">{{ panelTitle }}</h1>
        <button v-if="panelCapture" ref="captureCancelButton" type="button" class="ui-button ui-quiet" @click="cancelPanelCapture()">Cancel</button>
        <button v-else-if="hasSource" ref="newSearchButton" type="button" class="ui-button new-search-button" :class="searchComplete ? 'ui-primary' : 'ui-quiet'" :disabled="processing" @click="clearCurrentSource">New search</button>
        <button v-else type="button" class="ui-button ui-quiet ui-icon-button sidebar-settings" @click="showOptions" aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
        </button>
      </header>

      <input ref="browseInput" type="file" accept="image/*" multiple class="sidebar-file" @change="onBrowseInputChange" />
      <section v-if="panelCapture" class="capture-step" aria-label="Page capture">
        <p role="status">{{ captureStatus }}</p>
      </section>
      <section v-show="!hasSource && !panelCapture" class="source-editor" :class="{'is-dragging': isDragging}" aria-label="Choose image">
        <div class="source-shortcuts">
          <button ref="chooseImageButton" type="button" class="ui-button" :disabled="processing" aria-describedby="drop-hint" @click="onBrowseButtonClick">Choose file</button>
          <button v-if="pasteEnabled" ref="pasteButton" type="button" class="ui-button" :disabled="processing" aria-label="Paste image or link" @click="onPasteButtonClick">Paste</button>
          <button v-if="captureEnabled" ref="captureSourceButton" type="button" class="ui-button" :disabled="processing" @click="startPanelCapture">Capture area</button>
        </div>
        <p id="drop-hint" class="sidebar-privacy">Drop images anywhere in this panel.</p>

        <p v-if="!hasSource" :class="sourceStatusClass" role="status">{{ sourceProgress || selectionNotice }}</p>

        <form class="image-link-form" @submit.prevent="submitImageUrl">
          <label for="sidebar-image-url">Image link</label>
          <div class="image-link-entry">
            <input id="sidebar-image-url" ref="imageUrlInput" v-model="urlDraft" class="ui-input" :readonly="processing" :aria-invalid="urlDraftError ? 'true' : undefined" type="text" inputmode="url" placeholder="https://…" autocomplete="off" spellcheck="false" :aria-describedby="hasNewLinkDraft ? 'link-hint' : undefined" @blur="linkValidationRequested = Boolean(urlDraft.trim())" />
            <button v-if="hasNewLinkDraft" type="submit" class="ui-button link-submit" :disabled="processing">Preview link</button>
          </div>
          <p v-if="urlDraftError" id="link-hint" class="selection-notice" role="status">{{ urlDraftError }}</p>
          <p v-else-if="hasNewLinkDraft" id="link-hint" class="sidebar-privacy">Link previews may contact the site.</p>
        </form>
      </section>

      <section v-show="hasSource" class="sidebar-source" aria-label="Selected image">
        <div class="preview-frame" :class="{'is-dragging': isDragging}">
          <template v-if="filesActive">
            <img v-show="!previewImages[previewIndex].previewFailed" :key="previewImages[previewIndex].objectUrl" class="preview-image" :src="previewImages[previewIndex].objectUrl" :data-preview-src="previewImages[previewIndex].objectUrl" :alt="`Preview: ${previewImages[previewIndex].image.name}`" @error="onFilePreviewError" />
            <p v-if="previewImages[previewIndex].previewFailed" class="preview-message" role="status">Preview unavailable. You can still search this file.</p>
          </template>
          <template v-else-if="linkActive">
            <img v-if="urlPreviewSrc" v-show="urlPreviewState === 'ready'" :key="urlPreviewSrc" class="preview-image url-preview-image" :src="urlPreviewSrc" :data-preview-src="urlPreviewSrc" alt="Image URL preview" referrerpolicy="no-referrer" @load="onUrlPreviewResult($event, 'ready')" @error="onUrlPreviewResult($event, 'unavailable')" />
            <p v-if="urlPreviewState === 'loading'" class="preview-message" role="status">Loading preview…</p>
            <p v-else-if="urlPreviewState === 'unavailable'" class="preview-message" role="status">Preview unavailable. You can still search this link.</p>
          </template>
        </div>
        <div v-if="filesActive && previewImages.length > 1" class="preview-thumbnails" role="group" aria-label="Image previews">
          <button v-for="(item, index) in previewImages" :key="item.objectUrl" type="button" class="ui-button preview-thumbnail" :aria-label="item.image.name" :title="item.image.name" :aria-pressed="previewIndex === index" @click="previewIndex = index">
            <img v-if="!item.previewFailed" :src="item.objectUrl" :data-preview-src="item.objectUrl" alt="" decoding="async" draggable="false" @error="onFilePreviewError" />
            <span v-else>{{ item.image.name }}</span>
          </button>
        </div>
      </section>

      <p v-if="hasSource" :class="sourceStatusClass" role="status">{{ sourceProgress || selectionNotice }}</p>
      <p v-if="settingsError" class="selection-notice" role="status">{{ settingsError }}</p>
      <div v-show="hasSource" class="sidebar-controls">
        <button v-if="engines.length" id="engine-selector-button" ref="selectorButton" type="button" class="ui-button engine-selector-button" :class="{'ui-primary recovery-button': !searchableEngines.length && !uploadInstead}" :disabled="processing" aria-haspopup="dialog" @click="openSelector">
          <span v-if="!selectedEngines.length">Choose search engines</span>
          <span v-else class="engine-summary">
            <span>Search engines</span>
            <strong class="engine-summary-names" :title="engineSummary.names">{{ engineSummary.names }}</strong>
            <strong v-if="engineSummary.extra">+{{ engineSummary.extra }}</strong>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
        <button v-else ref="enableEnginesButton" type="button" class="ui-button ui-primary recovery-button" @click="showOptions">Enable search engines</button>
        <p v-if="selectionSaveFailed" class="selection-save-error" role="status">Engine selection was not saved. <button type="button" class="ui-button ui-link" @click="retrySelection">Retry</button></p>
        <p v-if="unavailableUrlEngines.length" id="engine-compatibility" class="engine-compatibility" role="status">{{ unavailableUrlLabel }} {{ unavailableUrlEngines.length === 1 ? 'requires' : 'require' }} a file upload.</p>
        <button v-if="uploadInstead" ref="uploadInsteadButton" type="button" class="ui-button ui-primary recovery-button" :disabled="processing" aria-describedby="engine-compatibility" @click="onBrowseButtonClick">Upload image</button>
      </div>
      <section v-if="hasSource && (searchableEngines.length || searchFeedback)" class="search-controls" aria-label="Search">
        <button v-if="!bulkConfirmOpen && searchableEngines.length && !searchComplete" ref="searchButton" type="button" class="ui-button ui-primary sidebar-all" :disabled="!sidebarReady" aria-describedby="sidebar-privacy" @click="onEngineClick">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg>
            {{ searchButtonLabel }}
        </button>
        <div v-if="bulkConfirmOpen" class="bulk-confirm" role="group" aria-labelledby="bulk-confirm-title" @keydown.esc.stop.prevent="cancelBulkSearch">
          <p id="bulk-confirm-title" role="status">Send to engines? Up to {{ maxSearchTabs }} tabs.</p>
          <div><button type="button" class="ui-button ui-quiet" @click="cancelBulkSearch">Cancel</button><button ref="confirmBulkButton" type="button" class="ui-button ui-primary" @click="startSearch">Open tabs</button></div>
        </div>
        <p class="search-feedback" :class="{'is-error': searchFeedbackIsError, 'visually-hidden': !searchFeedback}" role="status">{{ searchFeedback || (searchInProgress ? 'Searching…' : '') }}</p>
        <p v-if="searchableEngines.length && !searchComplete && !bulkConfirmOpen" id="sidebar-privacy" class="sidebar-privacy">
          <span v-if="maxSearchTabs > 1">Up to {{ maxSearchTabs }} tabs · </span>Sent to engines on search
        </p>
      </section>
    </main>
    <section v-if="selectorOpen" class="engine-dialog" role="dialog" aria-modal="true" aria-labelledby="engine-dialog-title" @keydown="onSelectorKeydown">
      <header class="engine-dialog-header">
        <h2 id="engine-dialog-title" class="dialog-heading">Search engines</h2>
        <button v-if="engines.length" type="button" class="ui-button ui-link manage-engines" @click="showOptions">Manage engines</button>
      </header>
      <label v-if="engineSearchVisible" for="engine-search" class="visually-hidden">Filter enabled search engines</label>
      <input v-if="engineSearchVisible" id="engine-search" ref="engineSearch" v-model="engineQuery" class="ui-input engine-search" type="search" placeholder="Filter engines" autocomplete="off" @input="$refs.engineChoices.scrollTop = 0" />
      <p v-if="selectionSaveFailed" class="selection-save-error" role="status">Engine selection was not saved. <button type="button" class="ui-button ui-link" @click="retrySelection">Retry</button></p>
      <p v-if="settingsError" class="selection-save-error" role="status">{{ settingsError }}</p>
      <label v-if="engines.length > 1" class="engine-row select-all"><input ref="allEnginesControl" class="ui-check" type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" @change="setAllEngines($event.target.checked)" /><span>All enabled engines</span><span v-if="engineQuery.trim()" class="row-count">{{ engines.length }}</span></label>
      <div ref="engineChoices" class="engine-choices" role="group" aria-label="Available engines">
        <div v-if="!visibleEngines.length" class="engine-no-results">
          <p role="status">{{ engines.length ? 'No enabled engines match this filter.' : 'No engines enabled.' }}</p>
          <button v-if="engines.length" type="button" class="ui-button ui-link" @click="clearEngineFilter">Clear filter</button>
          <button v-else type="button" class="ui-button ui-link" @click="showOptions">Open Settings</button>
        </div>
        <div ref="engineChoiceGrid" class="engine-choice-grid" :class="{'single-choice': visibleEngines.length === 1}">
          <label v-for="engine in visibleEngines" :key="engine" class="engine-row" :title="getText(`menuItemTitle_${engine}`)">
            <input class="ui-check" type="checkbox" :checked="selectedEngines.includes(engine)" :aria-describedby="unavailableLinkEngines.includes(engine) ? `link-requirement-${engine}` : undefined" @change="setEngineSelected(engine, $event.target.checked)" />
            <img :src="getEngineIcon(engine, {variant:theme})" alt="" @error="$event.target.hidden = true" />
            <span class="engine-label">
              <span class="engine-name">{{ getText(`menuItemTitle_${engine}`) }}</span>
              <small v-if="unavailableLinkEngines.includes(engine)" :id="`link-requirement-${engine}`" class="engine-requirement" aria-hidden="true">Upload only</small>
            </span>
          </label>
        </div>
      </div>
      <button ref="selectorDone" type="button" class="ui-button ui-primary dialog-done" @click="closeSelector">Done<span v-if="engineSelectionStatus"> · {{ engineSelectionStatus }}</span></button>
    </section>
  </vn-app>
</template>

<script>
import {markRaw} from 'vue';
import {App} from 'vueton';

import storage from 'storage/storage';
import {
  getEnabledEngines,
  showNotification,
  normalizeImages,
  processImages,
  validateUrl,
  showOptionsPage,
  getClipboardContent,
  getClipboardFiles,
  getEngineIcon,
  sendLargeMessage,
  getAppTheme,
  requestClipboardReadPermission
} from 'utils/app';
import {
  getText,
  getActiveTab,
  getBrowserVersion,
  dataUrlToBlob
} from 'utils/common';
import {optionKeys, engines as engineDefinitions} from 'utils/data';
import {releaseBuild} from 'utils/config';
import {releaseEngines} from 'utils/releaseEngines';
import {resolveSelection, selectionForSave} from './engineSelection';
import {consumeSelectedFiles} from './fileInput';
import {createUrlPreviewController, isValidWebUrl, MAX_IMAGE_URL_LENGTH} from './urlPreview';
import {getDroppedWebUrl} from './dropInput';

export default {
  emits: ['ready', 'startupError'],
  components: {
    [App.name]: App
  },

  data: function () {
    return {
      dataLoaded: false,
      processing: false,
      searchInProgress: false,
      panelCapture: null,
      captureEnabled: !this.$env.isMobile &&
        !new URLSearchParams(window.location.search).has('workspace') &&
        typeof browser.tabs.captureVisibleTab === 'function',

      searchModeAction: '',
      initialFocusMode: 'browse',
      urlDraft: '',
      linkValidationRequested: false,
      imageUrl: '',
      urlPreviewSrc: '',
      urlPreviewState: 'empty',
      urlPreviewController: null,
      previewImages: null,
      previewIndex: 0,
      selectionNotice: '',
      sourceProgress: '',
      settingsOpening: false,
      settingsError: '',
      searchFeedback: '',
      searchFeedbackIsError: false,
      lastSearchEngines: [],
      bulkConfirmOpen: false,
      isDragging: false,

      engines: [],
      selectorOpen: false,
      engineSearchVisible: false,
      enginePickerResizeObserver: null,
      engineQuery: '',
      selection: {mode: 'all'},
      selectionWrite: null,
      selectionWritesPending: 0,
      selectionRevision: 0,
      selectionSaveFailed: false,

      theme: '',
      pasteEnabled: false
    };
  },

  computed: {
    imageCount: function () {
      return this.searchModeAction === 'browse' ? (this.previewImages?.length || 0) : (isValidWebUrl(this.imageUrl) ? 1 : 0);
    },
    maxSearchTabs: function () { return this.imageCount * this.searchableEngines.length; },
    filesActive: function () {
      return this.searchModeAction === 'browse' && Boolean(this.previewImages?.length);
    },
    linkActive: function () {
      return this.searchModeAction === 'url' && Boolean(this.imageUrl);
    },
    hasSource: function () { return this.filesActive || this.linkActive; },
    panelTitle: function () {
      if (this.panelCapture) return 'Capture area';
      if (!this.hasSource) return 'Find image matches';
      if (this.filesActive) return this.previewImages[this.previewIndex]?.image.name || 'Your image';
      return new URL(this.imageUrl).hostname;
    },
    captureStatus: function () {
      if (this.panelCapture?.stage === 'opening') return 'Opening capture…';
      if (this.panelCapture?.stage === 'preparing') return 'Preparing capture…';
      return 'Drag a box on the page, then click Use capture.';
    },
    validUrlDraft: function () { return isValidWebUrl(this.urlDraft.trim()); },
    hasNewLinkDraft: function () { return Boolean(this.urlDraft.trim()); },
    urlDraftError: function () {
      const draft = this.urlDraft.trim();
      if (!this.linkValidationRequested || !draft || this.validUrlDraft) return '';
      return draft.length > MAX_IMAGE_URL_LENGTH
        ? 'Use an image link with 2,048 characters or fewer.'
        : 'Enter a direct image link that starts with http or https.';
    },
    linkCompatibleEngines: function () {
      return this.engines.filter(engine => engineDefinitions[engine]?.url);
    },
    unavailableLinkEngines: function () {
      return this.linkActive ? this.engines.filter(engine => !this.linkCompatibleEngines.includes(engine)) : [];
    },
    selectedEngines: function () {
      return resolveSelection(this.engines, this.selection, {
        releaseEngines: releaseBuild ? releaseEngines : undefined,
        recommendedEngines: this.linkActive && this.linkCompatibleEngines.length
          ? this.linkCompatibleEngines
          : this.engines
      });
    },
    engineSummary: function () {
      const engines = this.searchableEngines.length ? this.searchableEngines : this.selectedEngines;
      const visibleNames = engines.length > 2 ? 1 : 2;
      return {
        names: engines.slice(0, visibleNames).map(engine => this.getText(`menuItemTitle_${engine}`)).join(', '),
        extra: Math.max(0, engines.length - visibleNames)
      };
    },
    unavailableUrlEngines: function () {
      return this.selectedEngines.filter(engine => this.unavailableLinkEngines.includes(engine));
    },
    searchableEngines: function () {
      const unavailable = new Set(this.unavailableUrlEngines);
      return this.selectedEngines.filter(engine => !unavailable.has(engine));
    },
    uploadInstead: function () {
      return this.unavailableUrlEngines.length > 0 && !this.searchableEngines.length;
    },
    unavailableUrlLabel: function () {
      const names = this.unavailableUrlEngines.map(engine => this.getText(`engineName_${engine}`));
      return names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
    },
    allSelected: function () {
      return this.engines.length > 0 && this.selectedEngines.length === this.engines.length;
    },
    someSelected: function () {
      return this.selectedEngines.length > 0 && !this.allSelected;
    },
    visibleEngines: function () {
      const query = this.engineQuery.trim().toLocaleLowerCase();
      if (!query) return this.engines;
      return this.engines.filter(engine =>
        this.getText(`menuItemTitle_${engine}`).toLocaleLowerCase().includes(query) ||
        this.getText(`engineName_${engine}`).toLocaleLowerCase().includes(query)
      );
    },
    engineSelectionStatus: function () {
      if (this.unavailableUrlEngines.length) {
        return this.searchableEngines.length ? `${this.searchableEngines.length} available` : 'Upload needed';
      }
      return this.selectedEngines.length ? `${this.selectedEngines.length} selected` : '';
    },
    sourceStatusClass: function () {
      if (this.sourceProgress) return 'source-progress';
      return this.selectionNotice ? 'selection-notice' : 'visually-hidden';
    },
    searchComplete: function () {
      return this.lastSearchEngines.length > 0 &&
        this.lastSearchEngines.length === this.searchableEngines.length &&
        this.lastSearchEngines.every(engine => this.searchableEngines.includes(engine));
    },
    searchButtonLabel: function () {
      if (this.searchInProgress) return 'Searching…';
      if (this.processing) return 'Preparing image…';
      return this.imageCount > 1 ? `Search ${this.imageCount} images` : 'Search image';
    },
    sidebarReady: function () {
      return !this.processing && this.imageCount > 0 && !this.searchComplete;
    }
  },

  methods: {
    getText,

    getEngineIcon,

    startPanelCapture: async function () {
      if (!this.startProcessing()) return;
      const id = crypto.randomUUID();
      this.panelCapture = {id, stage: 'opening'};
      this.selectionNotice = '';
      this.$nextTick(() => this.$refs.captureCancelButton?.focus());

      const tab = await getActiveTab({currentWindow: true}).catch(() => null);
      if (this.panelCapture?.id !== id) return;
      if (!Number.isInteger(tab?.id) || tab.id < 0) {
        this.finishPanelCapture(id, 'Open a webpage and try capturing again.');
        return;
      }
      this.panelCapture.tabId = tab.id;
      this.panelCapture.windowId = tab.windowId;

      const opened = await browser.runtime.sendMessage({
        id: 'startPanelCapture', captureRequestId: id, tabId: tab.id
      }).catch(() => false);
      if (this.panelCapture?.id !== id) {
        if (opened) this.requestCaptureClose(id, tab.id);
        return;
      }
      if (!opened) {
        this.finishPanelCapture(id, 'Capture is unavailable on this page. Try a regular webpage.');
        return;
      }
      if (this.panelCapture.stage === 'opening') this.panelCapture.stage = 'selecting';
    },

    requestCaptureClose: function (id, tabId) {
      if (!Number.isInteger(tabId)) return;
      browser.runtime.sendMessage({
        id: 'cancelPanelCapture', captureRequestId: id, tabId
      }).catch(() => {});
    },

    cancelPanelCapture: function (notice = '') {
      if (!this.panelCapture) return;
      const {id, tabId} = this.panelCapture;
      this.finishPanelCapture(id, notice);
      this.requestCaptureClose(id, tabId);
    },

    finishPanelCapture: function (id, notice = '') {
      if (this.panelCapture?.id !== id) return;
      this.panelCapture = null;
      this.stopProcessing();
      this.selectionNotice = notice;
      this.$nextTick(() => this.$refs.captureSourceButton?.focus());
    },

    onCaptureTabActivated: function ({tabId, windowId}) {
      const capture = this.panelCapture;
      if (capture && capture.windowId === windowId && capture.tabId !== tabId) {
        this.cancelPanelCapture('The active tab changed. Start a new capture on the page you want.');
      }
    },

    onCaptureTabUpdated: function (tabId, changes) {
      if (this.panelCapture?.tabId === tabId && (changes.url || changes.status === 'loading')) {
        this.cancelPanelCapture('The page changed. Start a new capture.');
      }
    },

    onCaptureTabRemoved: function (tabId) {
      if (this.panelCapture?.tabId === tabId) this.cancelPanelCapture('The capture tab was closed.');
    },

    onCapturePageHide: function () {
      this.cancelPanelCapture();
    },

    onPanelMessage: function (message) {
      if (message.id === 'panelCaptureResult' && this.panelCapture?.id === message.captureRequestId) {
        this.loadPanelCapture(message);
      }
    },

    loadPanelCapture: async function ({captureRequestId: id, storageId, cancelled}) {
      if (cancelled) {
        this.finishPanelCapture(id);
        return;
      }
      try {
        if (!storageId) throw new Error('No captured image');
        this.panelCapture.stage = 'preparing';
        const image = await sendLargeMessage({
          message: {id: 'storageRequest', storageId, asyncResponse: true, saveReceipt: true},
          transferResponse: true
        });
        if (this.panelCapture?.id !== id) return;
        if (!image?.imageDataUrl) throw new Error('Capture preview expired');
        const blob = dataUrlToBlob(image.imageDataUrl);
        this.finishPanelCapture(id);
        this.showPreviewImages([new File([blob], 'Page capture.png', {type: blob.type})]);
        this.$nextTick(this.focusReadyAction);
      } catch {
        this.finishPanelCapture(id, 'Could not capture that area. Start a new capture and try again.');
      }
    },

    resetSearchFeedback: function ({keepLastSearch = false} = {}) {
      this.searchFeedback = '';
      this.searchFeedbackIsError = false;
      if (!keepLastSearch) this.lastSearchEngines = [];
    },

    initSearch: async function (engine) {
      const searchMode = this.searchModeAction;
      const imageUrl = searchMode === 'url' ? this.imageUrl : undefined;
      const previewImages = this.previewImages;
      this.resetSearchFeedback({keepLastSearch: true});
      try {
        const tab = await getActiveTab({currentWindow: true}).catch(() => null);
        if (!Number.isInteger(tab?.id) || tab.id < 0) {
          this.searchFeedbackIsError = true;
          this.searchFeedback = 'Could not find an active browser tab. Open a tab and try again.';
          return;
        }
        const sourceTabId = tab.id;
        let images;

        if (searchMode === 'url') {
          if (!validateUrl(imageUrl)) {
            this.focusImageUrlInput();
            await showNotification({messageId: 'error_invalidImageUrl'});
            return;
          }
        } else if (searchMode === 'browse') {
          if (previewImages) {
            const files = previewImages.map(item => item.image);
            images = await processImages(files);
            if (!images || images.length !== files.length) {
              this.searchFeedbackIsError = true;
              this.searchFeedback = 'Could not prepare every image. Start a new search and choose the images again.';
              return;
            }
          }
        }

        const result = await sendLargeMessage({
          avoidReplay: true,
          message: {
            id: 'panelSearchSubmit',
            searchModeOverride: searchMode,
            selectedEngines: engine,
            sourceTabId,
            images,
            imageUrl
          }
        });

        const incomplete = [...new Set([...(result?.failed || []), ...(result?.unsupported || [])])];
        const names = incomplete.map(item => this.getText(`engineName_${item}`));
        const incompleteLabel = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
        if (result?.accepted === false) {
          this.searchFeedbackIsError = true;
          this.searchFeedback = incompleteLabel
            ? `Could not confirm ${incompleteLabel}. Check your tabs before trying again.`
            : 'Could not start the search. Check your enabled engines and try again.';
          return;
        }
        if (typeof result?.openedCount === 'number') {
          const count = result.openedCount;
          if (count > 0) this.lastSearchEngines = [...engine];
          const opened = `Opened ${count} search ${count === 1 ? 'tab' : 'tabs'}${result.grouped ? ' in a group' : ''}.`;
          if (incompleteLabel) {
            this.searchFeedbackIsError = true;
            this.searchFeedback = `${opened} Could not confirm ${incompleteLabel}. Check your tabs.`;
          } else {
            this.searchFeedback = opened;
          }
        } else {
          this.searchFeedback = 'Search requested. Check your tabs for results.';
        }
      } catch (err) {
        this.searchFeedbackIsError = true;
        this.searchFeedback = 'Could not confirm the search. Check your tabs before trying again.';
        console.error('Could not send search', err);
      }
    },

    startProcessing: function (progress = '') {
      if (!this.processing) {
        this.processing = true;
        this.sourceProgress = progress;
        this.isDragging = false;
        return true;
      }
    },

    stopProcessing: function () {
      this.processing = false;
      this.sourceProgress = '';
    },

    onSearchModeChange: function () {
      this.resetSearchFeedback();
      this.bulkConfirmOpen = false;
    },

    onUrlPreviewResult: function (event, status) {
      this.urlPreviewController.result(event.currentTarget.dataset.previewSrc, status);
    },

    onSidebarDragOver: function (event) {
      this.isDragging = !this.processing;
      if (this.processing && event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    },

    onSidebarDrop: function (event) {
      this.isDragging = false;
      if (this.processing) return;
      // Drag payloads can be cleared as soon as the drop event returns.
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length) {
        this.acceptFiles(files);
        return;
      }
      const url = getDroppedWebUrl(event.dataTransfer);
      if (url) {
        this.acceptImageUrl(url);
      } else {
        this.selectionNotice = 'Could not use that drop. Choose an image or paste its direct link.';
      }
    },

    onSidebarDragLeave: function (event) {
      if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) this.isDragging = false;
    },

    onPasteFromKeyboard: function (event) {
      if (this.processing || this.selectorOpen || !event.clipboardData) return;
      const clipboard = event.clipboardData;
      const files = getClipboardFiles(clipboard, 4);
      if (files.length) {
        event.preventDefault();
        this.acceptFiles(files);
        return;
      }
      const target = event.target;
      const editing = target?.isContentEditable || (['INPUT', 'TEXTAREA'].includes(target?.tagName) && !['checkbox', 'radio'].includes(target.type));
      if ((editing && target !== this.$refs.imageUrlInput) || this.processing) return;
      const text = clipboard.getData('text/plain').trim();
      if (isValidWebUrl(text)) {
        event.preventDefault();
        this.acceptImageUrl(text);
      }
    },

    onBrowseButtonClick: function () {
      if (!this.processing) {
        this.$refs.browseInput.click();
      }
    },

    onPasteButtonClick: async function () {
      if (!this.startProcessing('Reading clipboard…')) return;
      let content;
      this.selectionNotice = '';
      try {
        if (!(await requestClipboardReadPermission())) {
          this.selectionNotice = 'Clipboard access was not granted. Paste into the panel with your keyboard or choose a file.';
          return;
        }
        // Read one extra file so an oversized batch can be reported.
        content = await getClipboardContent({maxFiles: 4, includeText: true});
        if (!content?.files.length && !isValidWebUrl(content?.text)) {
          this.selectionNotice = 'Copy an image or its link, then try pasting again.';
        }
      } catch {
        this.selectionNotice = 'Could not read the clipboard. Try choosing a file.';
      } finally {
        this.stopProcessing();
        if (this.selectionNotice && document.activeElement === document.body) {
          this.$nextTick(() => this.$refs.pasteButton?.focus());
        }
      }
      if (content?.files.length) {
        await this.acceptFiles(content.files);
      } else if (isValidWebUrl(content?.text)) {
        this.acceptImageUrl(content.text);
      }
    },

    openSelector: async function () {
      if (this.processing) return;
      this.engineQuery = '';
      this.engineSearchVisible = false;
      this.selectorOpen = true;
      await this.$nextTick();
      if (!this.selectorOpen) return;

      const observer = new window.ResizeObserver(this.revealEngineFilter);
      observer.observe(this.$refs.engineChoices);
      observer.observe(this.$refs.engineChoiceGrid);
      this.enginePickerResizeObserver = markRaw(observer);
      this.revealEngineFilter();
      await this.$nextTick();
      if (this.selectorOpen) this.focusSelector();
    },

    closeSelector: function () {
      this.enginePickerResizeObserver?.disconnect();
      this.enginePickerResizeObserver = null;
      this.selectorOpen = false;
      this.engineQuery = '';
      this.$nextTick(() => (this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus());
    },

    focusSelector: function () {
      (this.$refs.engineSearch || this.$refs.engineChoices?.querySelector('input:checked') ||
        this.$refs.engineChoices?.querySelector('input, button') || this.$refs.selectorDone)?.focus();
    },

    revealEngineFilter: function () {
      const choices = this.$refs.engineChoices;
      if (!this.engineSearchVisible && choices && this.engines.length && choices.scrollHeight > choices.clientHeight) {
        this.engineSearchVisible = true;
      }
    },

    clearEngineFilter: function () {
      this.engineQuery = '';
      this.$refs.engineChoices.scrollTop = 0;
      this.$refs.engineSearch?.focus();
    },

    onSelectorKeydown: function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (event.target === this.$refs.engineSearch && this.engineQuery) {
          this.clearEngineFilter();
        } else {
          this.closeSelector();
        }
      } else if (event.key === 'Tab') {
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
      }
    },

    applyStoredSelection: function (saved) {
      const next = saved || {mode: 'all'};
      if (JSON.stringify(this.selection) === JSON.stringify(next)) return;
      this.selection = next;
      if (this.bulkConfirmOpen) {
        this.bulkConfirmOpen = false;
        this.$nextTick(() => {
          const button = this.$refs.searchButton;
        (button && !button.disabled ? button : this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus();
        });
      }
    },

    saveSelection: function (chosen) {
      this.bulkConfirmOpen = false;
      this.selection = selectionForSave(this.engines, chosen);
      const saved = JSON.parse(JSON.stringify(this.selection));
      this.selectionRevision += 1;
      this.selectionWritesPending += 1;
      this.selectionWrite = (this.selectionWrite || Promise.resolve()).then(async () => {
        try {
          await storage.set({sidebarEngineSelection: saved});
          this.selectionSaveFailed = false;
        } catch (err) {
          this.selectionSaveFailed = true;
          console.error('Could not save engine selection', err);
        }
        this.selectionWritesPending -= 1;
        if (!this.selectionWritesPending && !this.selectionSaveFailed) {
          const revision = this.selectionRevision;
          try {
            const latest = await storage.get('sidebarEngineSelection');
            if (!this.selectionWritesPending && !this.selectionSaveFailed && revision === this.selectionRevision) {
              this.applyStoredSelection(latest.sidebarEngineSelection);
            }
          } catch (err) {
            console.warn('Could not refresh engine selection', err);
          }
        }
      });
    },

    setAllEngines: function (checked) { this.saveSelection(checked ? this.engines : []); },
    retrySelection: async function () {
      this.saveSelection(this.selectedEngines);
      await this.selectionWrite;
      await this.$nextTick();
      if (!this.selectionSaveFailed && document.activeElement === document.body) {
        if (this.selectorOpen) this.focusSelector();
        else (this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus();
      }
    },
    setEngineSelected: function (engine, checked) {
      const chosen = this.selectedEngines.filter(item => item !== engine);
      if (checked) chosen.push(engine);
      this.saveSelection(chosen);
    },

    onEngineClick: function () {
      if (!this.sidebarReady || !this.searchableEngines.length) return;
      if (this.maxSearchTabs > 12) {
        this.bulkConfirmOpen = true;
        this.$nextTick(() => this.$refs.confirmBulkButton?.focus());
        return;
      }
      this.startSearch();
    },

    cancelBulkSearch: function () {
      this.bulkConfirmOpen = false;
      this.$nextTick(() => this.$refs.searchButton?.focus());
    },

    startSearch: function () {
      this.bulkConfirmOpen = false;
      if (!this.sidebarReady || !this.searchableEngines.length || !this.startProcessing()) return;
      this.searchInProgress = true;

      this.initSearch(this.searchableEngines).finally(() => {
        this.searchInProgress = false;
        this.stopProcessing();
        this.$nextTick(() => {
          const active = document.activeElement;
          if (active === document.body || active === this.$refs.searchButton) {
            (this.$refs.searchButton || this.$refs.newSearchButton)?.focus();
          }
        });
      });
    },

    onBrowseInputChange: function (ev) {
      // Copy the files before clearing the input so the same file can be
      // selected again after it has been removed or replaced.
      const files = consumeSelectedFiles(ev.target);
      this.acceptFiles(files);
    },

    acceptFiles: async function (files) {
      if (!files.length || !this.startProcessing('Preparing images…')) return;
      const previous = this.previewImages;
      const uploadButton = this.$refs.uploadInsteadButton;
      const usingUploadButton = document.activeElement === uploadButton;
      const shouldMoveFocus = !this.hasSource || usingUploadButton;
      try {
        await this.processSelectedImages(files);
      } finally {
        this.stopProcessing();
      }
      if (shouldMoveFocus && this.previewImages !== previous) this.$nextTick(this.focusReadyAction);
      else if (shouldMoveFocus && document.activeElement === document.body) {
        this.$nextTick(() => (usingUploadButton ? uploadButton : this.$refs.chooseImageButton)?.focus());
      }
    },

    processSelectedImages: async function (files) {
      try {
        if (!files.length) return;
        this.bulkConfirmOpen = false;
        this.selectionNotice = '';
        const previousSelection = this.hasSource ? ' Your previous selection is unchanged.' : '';
        if (files.length > 3) {
          this.selectionNotice = `Choose up to 3 images.${previousSelection}`;
          return;
        }

        const images = await normalizeImages(files);
        this.showPreviewImages(images);

        if (images && images.length < files.length) {
          const skipped = files.length - images.length;
          this.selectionNotice = `${skipped} ${skipped === 1 ? 'file was' : 'files were'} not usable and skipped.`;
        }

        if (!images) {
          const message = [...files].some(file => file.size > 300 * 1024 * 1024)
            ? 'Images must be 300 MB or smaller.'
            : 'Choose an image file and try again.';
          this.selectionNotice = message + previousSelection;
        }
      } catch (err) {
        this.selectionNotice = 'Could not read those files. Please try choosing them again.';
      }
    },

    showOptions: async function () {
      if (this.settingsOpening) return;
      this.settingsOpening = true;
      this.settingsError = '';
      try {
        await showOptionsPage({reuseTab: true});
      } catch (error) {
        this.settingsError = 'Could not open Settings. Try again.';
        console.error('Could not open Settings', error);
      } finally {
        this.settingsOpening = false;
      }
    },

    showPreviewImages: function (images) {
      if (images) {
        this.imageUrl = '';
        this.searchModeAction = 'browse';
        this.urlDraft = '';
        this.resetSearchFeedback();
        this.addPreviewImages(images);
        this.selectionNotice = '';
      }
    },

    onFilePreviewError: function (event) {
      const source = event.currentTarget.dataset.previewSrc;
      const image = this.previewImages?.find(item => item.objectUrl === source);
      if (image) image.previewFailed = true;
    },

    addPreviewImages: function (images) {
      if (images) {
        this.removePreviewImages();
        this.previewImages = images.map(image => ({
          image: markRaw(image),
          objectUrl: URL.createObjectURL(image),
          previewFailed: false
        }));
      }
    },

    removePreviewImages: function () {
      if (this.previewImages) {
        this.previewImages.forEach(image =>
          URL.revokeObjectURL(image.objectUrl)
        );
        this.previewImages = null;
      }
      this.previewIndex = 0;
    },

    useImageUrl: function (url) {
      if (this.processing) return;
      this.selectionNotice = '';
      if (url) this.removePreviewImages();
      this.imageUrl = url;
      this.searchModeAction = url ? 'url' : 'browse';
    },

    submitImageUrl: function () {
      if (this.processing) return;
      this.linkValidationRequested = true;
      if (!this.validUrlDraft) {
        this.focusImageUrlInput();
        return;
      }
      this.acceptImageUrl(this.urlDraft.trim());
    },

    acceptImageUrl: function (url) {
      if (this.processing) return;
      const editorHadFocus = document.activeElement?.closest('.source-editor');
      this.useImageUrl(url);
      this.resetSearchFeedback();
      this.bulkConfirmOpen = false;
      this.urlDraft = '';
      if (editorHadFocus) this.$nextTick(this.focusReadyAction);
    },

    focusReadyAction: function () {
      const search = this.$refs.searchButton;
      (search && !search.disabled ? search : this.$refs.uploadInsteadButton ||
        this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus();
    },

    onCaptureEscape: function (event) {
      if (!this.panelCapture) return;
      event.stopPropagation();
      this.cancelPanelCapture();
    },

    clearCurrentSource: function () {
      if (this.processing) return;
      const clearingLink = this.linkActive;
      this.imageUrl = '';
      this.removePreviewImages();
      this.resetSearchFeedback();
      this.bulkConfirmOpen = false;
      this.urlDraft = '';
      this.linkValidationRequested = false;
      this.selectionNotice = '';
      this.settingsError = '';
      this.$nextTick(() => {
        if (clearingLink) this.focusImageUrlInput();
        else this.$refs.chooseImageButton?.focus();
      });
    },

    focusImageUrlInput: function () {
      this.$refs.imageUrlInput?.focus();
    },

    focusInitialControl: function () {
      if (this.$env.isMobile || !this.dataLoaded || !document.hasFocus() ||
          this.hasSource || this.panelCapture || this.selectorOpen || this.processing) return;

      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;

      const control = this.initialFocusMode === 'url'
        ? this.$refs.imageUrlInput
        : this.$refs.chooseImageButton;
      control?.focus({preventScroll: true});
    },

    setup: async function () {
      const options = await storage.get(optionKeys);
      const enEngines = await getEnabledEngines(options);

      this.engines = enEngines;
      const savedSelection = await storage.get('sidebarEngineSelection');
      this.selection = savedSelection.sidebarEngineSelection || {mode: 'all'};
      browser.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'local' && (changes.engines || changes.disabledEngines)) {
          const hadConfirmation = this.bulkConfirmOpen;
          const activeControl = document.activeElement;
          const focusedInSelector = this.selectorOpen && activeControl?.closest('.engine-dialog');
          const focusedOnEngineControl = activeControl === this.$refs.selectorButton || activeControl === this.$refs.enableEnginesButton;
          const latestOptions = await storage.get(optionKeys);
          this.engines = await getEnabledEngines(latestOptions);
          if (this.selectorOpen && !this.engines.length) {
            this.engineSearchVisible = false;
            this.engineQuery = '';
          }
          if (focusedInSelector) this.$nextTick(() => {
            const active = document.activeElement;
            if (this.selectorOpen && (!active?.closest('.engine-dialog') || active.disabled)) {
              this.focusSelector();
            }
          });
          if (focusedOnEngineControl) this.$nextTick(() => {
            if (document.activeElement === document.body) (this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus();
          });
          if (hadConfirmation) {
            this.bulkConfirmOpen = false;
            this.$nextTick(() => {
              const button = this.$refs.searchButton;
              (button && !button.disabled ? button : this.$refs.selectorButton || this.$refs.enableEnginesButton)?.focus();
            });
          }
        }
        if (area === 'local' && changes.sidebarEngineSelection) {
          this.selectionRevision += 1;
          if (!this.selectionWritesPending && !this.selectionSaveFailed) this.applyStoredSelection(changes.sidebarEngineSelection.newValue);
        }
      });
      this.searchModeAction = ['browse', 'url'].includes(options.searchModeAction) ? options.searchModeAction : 'browse';
      this.initialFocusMode = this.searchModeAction;
      const isOutdatedFirefoxMobile =
        this.$env.isMobile &&
        this.$env.isFirefox &&
        (await getBrowserVersion()) < 140;

      this.pasteEnabled = !this.$env.isSamsung && !isOutdatedFirefoxMobile;

      this.$watch('searchModeAction', this.onSearchModeChange);
      this.$watch('urlDraft', draft => {
        if (!draft.trim()) this.linkValidationRequested = false;
      });
      this.$watch('imageUrl', value => { this.resetSearchFeedback(); this.bulkConfirmOpen = false; this.urlPreviewController.update(value); });

      this.theme = await getAppTheme(options.appTheme);
      document.addEventListener('themeChange', ev => {
        this.theme = ev.detail;
      });

      this.dataLoaded = true;
      this.$nextTick(this.focusInitialControl);
    }
  },

  created: function () {
    this.urlPreviewController = markRaw(createUrlPreviewController({
      onState: ({src, status}) => {
        this.urlPreviewSrc = src;
        this.urlPreviewState = status;
      }
    }));
    this.setup()
      .then(() => this.$emit('ready'))
      .catch(error => this.$emit('startupError', error));
  },

  beforeUnmount: function () {
    if (this.captureEnabled) {
      this.cancelPanelCapture();
      window.removeEventListener('pagehide', this.onCapturePageHide);
      browser.runtime.onMessage.removeListener(this.onPanelMessage);
      browser.tabs.onActivated?.removeListener(this.onCaptureTabActivated);
      browser.tabs.onUpdated?.removeListener(this.onCaptureTabUpdated);
      browser.tabs.onRemoved?.removeListener(this.onCaptureTabRemoved);
    }
    this.enginePickerResizeObserver?.disconnect();
    window.removeEventListener('focus', this.focusInitialControl);
    window.removeEventListener('paste', this.onPasteFromKeyboard);
    this.urlPreviewController?.dispose();
    this.removePreviewImages();
  },

  mounted: function () {
    window.addEventListener('focus', this.focusInitialControl);
    window.addEventListener('paste', this.onPasteFromKeyboard);
    if (this.captureEnabled) {
      window.addEventListener('pagehide', this.onCapturePageHide);
      browser.runtime.onMessage.addListener(this.onPanelMessage);
      browser.tabs.onActivated?.addListener(this.onCaptureTabActivated);
      browser.tabs.onUpdated?.addListener(this.onCaptureTabUpdated);
      browser.tabs.onRemoved?.addListener(this.onCaptureTabRemoved);
    }
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;

@include vueton.theme-base;

body,
.vn-app,
.v-application__wrap {
  height: 100%;
}

.v-application__wrap {
  display: flex;
  flex-direction: column;

  min-height: initial;
}

html.firefox.android {
  height: 100%;
}

html.samsung {
  & .v-application__wrap {
    height: initial;
  }
}

// Safari 17: the popover opens after a delay the first time the action
// button is clicked on macOS 14, unless the height is declared.
@if $target-env == 'safari' {
  html {
    min-height: 56px;
  }
}
</style>

<style>
html, body {
  min-width: 0 !important;
  height: 100%;
  overflow: hidden !important;
  background: var(--ui-bg);
}

.sidebar-prototype,
.engine-dialog {
  box-sizing: border-box;
  min-width: 0;
  padding: 20px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font: 14px/1.4 var(--ui-font);
}

.sidebar-prototype {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100dvh;
  overflow-y: auto;
}

.sidebar-prototype > * {flex-shrink: 0}
.panel-header,
.engine-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-header h1,
.dialog-heading {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -.02em;
}
.panel-header svg,
.engine-selector-button svg,
.sidebar-all svg {width: 16px; height: 16px; flex: none}
.panel-header .sidebar-settings svg {width: 20px; height: 20px}
.panel-header .new-search-button {
  flex: none;
  min-height: var(--ui-control-height);
  font-size: 13px;
}
.panel-header .source-heading {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 650;
}
.source-editor,
.sidebar-controls,
.search-controls {display: grid; gap: 8px; min-width: 0}
.sidebar-prototype > .sidebar-source {
  --preview-min-height: 48px;
  --preview-gap: 8px;
  display: flex;
  flex-direction: column;
  flex-shrink: 1;
  gap: var(--preview-gap);
  min-width: 0;
  min-height: var(--preview-min-height);
}
.sidebar-source:has(.preview-thumbnails) {
  min-height: calc(var(--preview-min-height) + var(--ui-control-height) + var(--preview-gap));
}
.source-editor {gap: 10px}
.capture-step {padding: 12px; border-radius: var(--ui-surface-radius); background: var(--ui-subtle)}
.capture-step p {margin: 0}

.source-shortcuts {display: flex; gap: 6px}
.source-shortcuts .ui-button {flex: 1 1 0; min-width: max-content; padding-inline: 6px}
.sidebar-file {display: none}

.image-link-form {display: grid; gap: 5px; min-width: 0}
.image-link-form label {font-size: 13px; font-weight: 650}
.image-link-entry {display: flex; align-items: stretch; gap: 6px; min-width: 0}
.image-link-entry input {width: 0; flex: 1}
.link-submit {white-space: nowrap}

.preview-frame {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: var(--preview-min-height);
  height: clamp(150px, 32dvh, 180px);
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-surface);
}
.preview-frame .preview-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  border-radius: calc(var(--ui-control-radius) - 2px);
  object-fit: contain;
}
.source-editor.is-dragging,
.preview-frame.is-dragging {outline: 2px solid var(--ui-focus); outline-offset: 2px}
.preview-message {margin: 0; max-width: 30ch; color: var(--ui-muted); text-align: center; font-size: 13px}
.preview-thumbnails {display: flex; flex: none; justify-content: center; gap: 6px}
.preview-thumbnail {
  width: calc(var(--ui-control-height) * 1.4);
  height: var(--ui-control-height);
  min-width: 0;
  padding: 2px;
  overflow: hidden;
}
.preview-thumbnail[aria-pressed="true"] {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 1px var(--ui-accent);
}
.preview-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: calc(var(--ui-control-radius) - 3px);
}
.preview-thumbnail span {overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px}

.sidebar-prototype .engine-selector-button {
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 7px 10px;
  text-align: start;
}
.engine-summary {display: flex; align-items: baseline; gap: 6px; min-width: 0}
.engine-summary span {flex: none; font-size: 12px; color: var(--ui-muted); font-weight: 400}
.engine-summary strong {white-space: nowrap; font-weight: 650}
.engine-summary-names {min-width: 0; overflow: hidden; text-overflow: ellipsis}
.engine-selector-button svg {color: var(--ui-muted)}
.recovery-button svg {color: inherit}
.sidebar-all {width: 100%}
.sidebar-privacy,
.source-progress,
.search-feedback {margin: 0; color: var(--ui-muted); font-size: 12px; line-height: 1.35}
.search-controls .sidebar-privacy,
.search-feedback {text-align: center}
.selection-notice,
.selection-save-error,
.engine-compatibility,
.search-feedback.is-error {margin: 0; color: var(--ui-notice); font-size: 12px; line-height: 1.35}
.selection-save-error .ui-link {min-height: 28px; padding: 2px 6px; color: inherit; font-size: inherit}

.bulk-confirm {
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-surface-radius);
  background: var(--ui-subtle);
}
.bulk-confirm p {margin: 0 0 8px; font-weight: 650}
.bulk-confirm div {display: flex; justify-content: flex-end; gap: 8px}

.visually-hidden {position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0}

.engine-dialog {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}
.engine-dialog-header {flex: none}
.dialog-heading {min-width: 0}
.engine-dialog .manage-engines {flex: none; padding-inline: 5px}
.engine-search {flex: none; width: 100%}
.engine-no-results {margin: 6px 2px; color: var(--ui-muted); font-size: 13px}
.engine-no-results p {margin: 0}
.engine-no-results .ui-link {min-height: 28px; padding: 0 4px; font-size: inherit}
.engine-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--ui-control-height);
  width: 100%;
  padding: 5px 8px;
  border-radius: var(--ui-control-radius);
  text-align: start;
  cursor: pointer;
}
.engine-row:hover,
.engine-row:focus-within {background: var(--ui-subtle)}
.engine-row:has(input:checked) {background: var(--ui-hover)}
.engine-row img {width: 16px; height: 16px; object-fit: contain; flex: none}
.engine-name {display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.2}
.row-count {margin-inline-start: auto; white-space: nowrap; color: var(--ui-muted); font-size: 12px}
.select-all {flex: none; background: var(--ui-subtle)}
.engine-requirement {display: block; color: var(--ui-muted); font-size: 11px; line-height: 1.25}
.engine-label {min-width: 0}
.engine-choices {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scroll-padding-block: 4px;
  scrollbar-width: thin;
}
.engine-search ~ .engine-choices {flex: 1}
.engine-choice-grid {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: var(--ui-control-height); gap: 4px}
.engine-choice-grid:has(.engine-requirement) {grid-auto-rows: calc(var(--ui-control-height) + 6px)}
.engine-choice-grid.single-choice {grid-template-columns: minmax(0, 1fr)}
.engine-choice-grid .engine-row {min-width: 0; padding-block: 4px}
.dialog-done {flex: none}

@media (max-height: 480px), (max-width: 320px) {
  .sidebar-prototype,
  .engine-dialog {padding: 12px; gap: 10px}
  .engine-dialog {gap: 5px}
}
@media (max-height: 480px) {
  .sidebar-prototype,
  .engine-dialog {--ui-control-height: 34px}
}
@media (max-height: 360px) {
  .sidebar-prototype,
  .engine-dialog {--ui-control-height: 32px; --ui-action-height: 40px}
  .sidebar-prototype {padding-block: 6px; gap: 6px}
  .panel-header h1,
  .dialog-heading {font-size: 16px}
  .source-editor,
  .search-controls {gap: 5px}
  .sidebar-prototype > .sidebar-source {--preview-gap: 5px}
  .preview-frame {height: clamp(72px, calc(100dvh - 244px), 112px); padding: 4px}
  .sidebar-prototype .engine-selector-button {padding-block: 5px}
  .bulk-confirm {padding: 6px 8px}
  .bulk-confirm p {margin-bottom: 4px}
}
@media (max-height: 300px) {
  .engine-dialog {overflow-y: auto}
  .engine-choices {min-height: min(80px, 28vh)}
}
@media (max-height: 280px) {
  .sidebar-prototype {padding: 4px 8px; gap: 4px}
  .sidebar-prototype > .sidebar-source {--preview-min-height: 40px}
  .bulk-confirm p {font-size: 13px}
}
@media (max-width: 320px) {
  .panel-header h1,
  .dialog-heading {font-size: 16px}
  .engine-choice-grid .engine-row {gap: 6px; padding-inline: 6px}
  .engine-choice-grid .engine-row img {display: none}
}
</style>
