import {createApp} from 'vue';
import {configApp, loadFonts} from 'utils/app';
import {configVuetify} from 'utils/vuetify';

export async function mountExtensionPage(Component) {
  const startup = document.getElementById('page-startup');
  const reloadButton = startup.querySelector('button');
  reloadButton.addEventListener('click', () => window.location.reload());

  function showError(error) {
    console.error('Could not open extension page', error);
    startup.querySelector('[role="status"]').textContent = startup.dataset.error;
    reloadButton.hidden = false;
  }

  const app = createApp(Component, {
    onReady: () => { startup.hidden = true; },
    onStartupError: showError
  });

  try {
    await loadFonts(['400 14px Roboto', '500 14px Roboto']);
    await configApp(app);
    await configVuetify(app);
    app.mount('#app');
  } catch (error) {
    showError(error);
  }
}
