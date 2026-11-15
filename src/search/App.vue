<template>
  <vn-app v-show="dataLoaded">
    <div v-if="results.length" ref="grid" class="grid">
      <div
        class="grid-item ui-focus"
        tabindex="0"
        @keyup.enter="openPage(index)"
        :class="{'grid-item-loaded': index < visibleResultCount}"
        v-for="(item, index) in results"
        :key="item.page"
      >
        <div
          class="grid-item-image-wrap"
          :title="getText('buttonTooltip_viewPage')"
          @click="openPage(index)"
        >
          <img class="grid-item-image" :src="item.image" :alt="item.text || getText('buttonTooltip_viewImage')" />
        </div>
        <div class="grid-item-footer">
          <div class="grid-item-footer-text" :title="item.text">
            {{ item.text }}
          </div>
          <vn-icon-button
            class="grid-item-footer-button"
            src="/src/assets/icons/misc/image.svg"
            :title="getText('buttonTooltip_viewImage')"
            @click="openImage(index)"
          ></vn-icon-button>
        </div>
      </div>
    </div>
    <footer v-if="visibleResultCount" class="pinterest-results-footer">
      <p ref="resultsCount" class="pinterest-result-count" tabindex="-1" role="status">{{ getText('pinterestResultsCount', String(visibleResultCount)) }}</p>
      <button v-if="pinterestBookmark" ref="loadMoreButton" type="button" class="ui-button" :aria-disabled="loadingMore" @click="loadMorePinterest">
        {{ getText(loadingMore ? 'pinterestLoadingMore' : 'pinterestLoadMore') }}
      </button>
      <p v-if="moreError" class="pinterest-load-error" role="status">{{ moreError }}</p>
    </footer>
    <main v-if="!resultsLoaded || !results.length" class="page-overlay" :class="{'is-error': error}">
      <p role="status">{{ error || (searchPending ? getText('status_searchingImages') : resultsLoaded ? getText('pinterestNoResults') : '') }}</p>
    </main>
  </vn-app>
</template>

<script>
import {markRaw} from 'vue';
import Masonry from 'masonry-layout';
import imagesLoaded from 'imagesloaded';
import {App, IconButton} from 'vueton';

import {validateUrl, sendLargeMessage, showPage} from 'utils/app';
import {getText} from 'utils/common';
import {
  prepareImageForUpload,
  searchGoogleImages,
  searchPinterest
} from 'utils/engines';

export default {
  components: {
    [App.name]: App,
    [IconButton.name]: IconButton
  },

  data: function () {
    return {
      dataLoaded: false,

      error: '',
      searchPending: false,
      engine: '',
      results: [],
      resultsLoaded: false,
      visibleResultCount: 0,
      masonry: null,

      pinterestQuery: null,
      pinterestBookmark: '',
      loadingMore: false,
      moreError: ''
    };
  },

  methods: {
    getText,

    setup: async function () {
      document.documentElement.lang = browser.i18n.getUILanguage() || 'en';
      const storageId = new URL(window.location.href).searchParams.get('id');

      const task = await browser.runtime.sendMessage({
        id: 'storageRequest',
        asyncResponse: true,
        saveReceipt: true,
        storageId
      });

      if (task) {
        this.searchPending = true;
        this.dataLoaded = true;

        try {
          this.engine = task.search.engine;

          document.title = getText('pageTitle', [
            getText(`optionTitle_${this.engine}`),
            getText('extensionName')
          ]);

          let image = await sendLargeMessage({
            message: {
              id: 'storageRequest',
              asyncResponse: true,
              saveReceipt: true,
              storageId: task.imageId
            },
            transferResponse: true,
            openConnection: this.$env.isSafari
          });

          if (image) {
            if (task.search.assetType === 'image') {
              try {
                image = await prepareImageForUpload({
                  image,
                  engine: this.engine,
                  target: 'api',
                  setBlob: !(this.$env.isSafari && this.$env.isMobile)
                });
              } catch (err) {
                if (err.name === 'EngineError') {
                  this.error = err.message;
                  return;
                }

                throw err;
              }
            }

            await this.search({
              session: task.session,
              search: task.search,
              image
            });
          } else {
            this.error = getText('error_invalidPageUrl');
          }
        } catch (err) {
          this.error = getText(
            'error_engine',
            getText(`engineName_${this.engine}`)
          );

          console.log(err.toString());
          throw err;
        }
      } else {
        this.error = getText('error_invalidPageUrl');
        this.dataLoaded = true;
      }
    },

    search: async function ({session, search, image} = {}) {
      if (this.engine === 'pinterest') {
        const query = {session, search, image};
        const page = await this.fetchPinterest(query);
        this.appendPinterestResults(page, query);
        if (this.results.length) {
          await this.layoutGrid();
        }
        this.searchPending = false;
        this.resultsLoaded = true;
      } else if (this.engine === 'googleImages') {
        let tabUrl;
        if (this.$env.isSafari && this.$env.isMobile) {
          // Safari 15: cross-origin request from extension page is blocked on mobile.
          const rsp = await browser.runtime.sendMessage({
            id: 'searchImageImages',
            session,
            search,
            image
          });

          if (rsp.error) {
            throw new Error(rsp.error);
          }

          tabUrl = rsp.data;
        } else {
          tabUrl = await searchGoogleImages({session, search, image});
        }

        if (validateUrl(tabUrl)) {
          window.location.replace(tabUrl);
        }
      }
    },

    fetchPinterest: async function ({session, search, image}, bookmark) {
      if (this.$env.isSafari && this.$env.isMobile) {
        // Mobile Safari blocks the request from the extension results page.
        const rsp = await browser.runtime.sendMessage({
          id: 'searchImage',
          session,
          search,
          image,
          bookmark
        });
        if (rsp.error) {
          throw new Error(rsp.error);
        }
        return rsp.data;
      }

      return searchPinterest({image, bookmark});
    },

    appendPinterestResults: function ({results, bookmark}, query) {
      const seen = new Set(this.results.map(item => item.page));
      const previousCount = this.results.length;
      for (const item of results) {
        if (!seen.has(item.page)) {
          seen.add(item.page);
          this.results.push(item);
        }
      }

      const added = this.results.length > previousCount;
      this.pinterestBookmark = added ? bookmark : '';
      this.pinterestQuery = this.pinterestBookmark ? markRaw(query) : null;
      return added;
    },

    loadMorePinterest: async function () {
      if (this.loadingMore || !this.pinterestBookmark) {
        return;
      }

      const buttonFocused = document.activeElement === this.$refs.loadMoreButton;
      const firstNewIndex = this.visibleResultCount;
      this.loadingMore = true;
      this.moreError = '';
      try {
        const query = this.pinterestQuery;
        const page = await this.fetchPinterest(query, this.pinterestBookmark);
        if (this.appendPinterestResults(page, query)) {
          await this.layoutGrid();
          if (buttonFocused) this.$refs.grid.children[firstNewIndex]?.focus();
        } else if (buttonFocused) {
          this.$refs.resultsCount?.focus();
        }
      } catch (err) {
        this.moreError = getText('pinterestLoadMoreError');
      } finally {
        this.loadingMore = false;
      }
    },

    layoutGrid: async function () {
      await this.$nextTick();
      const grid = this.$refs.grid;
      await new Promise(resolve => imagesLoaded(grid).once('always', resolve));

      if (this.masonry) {
        this.masonry.reloadItems();
      } else {
        this.masonry = markRaw(new Masonry(grid, {
          itemSelector: '.grid-item',
          horizontalOrder: true,
          transitionDuration: 0,
          initLayout: false
        }));
      }

      this.masonry.layout();
      this.visibleResultCount = this.results.length;
    },

    openPage: async function (index) {
      await this.openTab(this.results[index].page);
    },

    openImage: async function (index) {
      await this.openTab(this.results[index].image);
    },

    openTab: async function (url) {
      await showPage({url});
    }
  },

  created: function () {
    this.setup();
  },

  beforeUnmount: function () {
    this.masonry?.destroy();
  }
};
</script>

<style lang="scss">
@use 'vueton/styles' as vueton;

@include vueton.theme-base;
@include vueton.transitions;

html,
body,
.v-application,
.v-application__wrap {
  width: 100%;
}

body,
.v-application__wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.page-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 8px;
}

.page-overlay p {max-width: 44ch; padding: 12px; color: var(--ui-muted); font: 14px/1.4 var(--ui-font); text-align: center}
.page-overlay.is-error p {color: var(--ui-notice)}
.vn-app {background: var(--ui-bg); color: var(--ui-text)}

.grid {
  padding: 8px;

  width: 288px;
  @media (min-width: 424px) {
    width: 424px;
  }
  @media (min-width: 576px) {
    width: 448px;
  }
  @media (min-width: 768px) {
    width: 664px;
  }
  @media (min-width: 992px) {
    width: 880px;
  }
  @media (min-width: 1200px) {
    width: 1096px;
  }
}

.pinterest-results-footer {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 12px 16px 28px;
  font: 14px/1.4 var(--ui-font);
}

.pinterest-result-count,
.pinterest-load-error {margin: 0}
.pinterest-result-count {color: var(--ui-muted)}
.pinterest-load-error {color: var(--ui-notice)}
.pinterest-results-footer .ui-button[aria-disabled="true"] {cursor: progress}

.grid-item {
  width: 120px;
  @media (min-width: 576px) {
    width: 200px;
  }
  margin: 8px;
  padding: 16px;
  padding-bottom: 12px;
  transition: opacity 0.3s ease;
  opacity: 0;
}

.grid-item-loaded {
  opacity: 1;
}

.grid-item::before {
  content: ' ';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  @include vueton.theme-prop(background-color, surface-variant);
  border-radius: 16px;
  transition: all 0.2s ease;
  transform: scale(0.96);
  opacity: 0;
}

.grid-item:focus::before,
.grid-item:focus-within::before,
.grid-item:hover::before {
  transform: scale(1);
  opacity: 0.4;
}

.grid-item-image-wrap {
  min-height: 56px;
  max-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.grid-item-image {
  display: block;
  overflow: hidden;
  max-width: 100%;
  max-height: 100%;
  object-fit: scale-down;
}

.grid-item-footer {
  display: flex;
  align-items: center;
  column-gap: 8px;
  height: 24px;
  margin-top: 12px;
  justify-content: space-between;
}

.grid-item-footer-text {
  @include vueton.md2-typography(caption);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.grid-item-footer-button {
  width: 24px;
  height: 24px;
  margin-right: -12px;

  & .vn-icon {
    opacity: 0.8;
  }
}
</style>
