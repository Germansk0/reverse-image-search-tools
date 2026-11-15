import path from 'node:path';
import {lstat, readdir} from 'node:fs/promises';

import webpack from 'webpack';
import {VueLoaderPlugin} from 'vue-loader';
import {VuetifyPlugin} from 'webpack-plugin-vuetify';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

import {releaseEngines} from './src/utils/releaseEngines.js';

const __dirname = import.meta.dirname;

const {
  default: {revisions: storageRevisions}
} = await import('./src/storage/config.json', {with: {type: 'json'}});

export default async function (env, argv) {
  const targetEnv = process.env.TARGET_ENV || 'chrome';
  const isProduction = process.env.NODE_ENV === 'production';
  const releaseBuild =
    isProduction || process.env.FULL_ENGINE_CATALOG !== 'true';

  const mv3 = env.mv3 === 'true';
  const appVersion = env.appVersion;

  const provideExtApi = !['firefox', 'safari'].includes(targetEnv);

  const provideModules = {};
  if (provideExtApi) {
    provideModules.browser = 'webextension-polyfill';
  }

  const plugins = [
    new webpack.DefinePlugin({
      'process.env': {
        TARGET_ENV: JSON.stringify(targetEnv),
        RELEASE_BUILD: JSON.stringify(releaseBuild),
        STORAGE_REVISION_LOCAL: JSON.stringify(storageRevisions.local.at(-1)),
        STORAGE_REVISION_SESSION: JSON.stringify(
          storageRevisions.session.at(-1)
        ),
        APP_VERSION: JSON.stringify(appVersion),
        MV3: JSON.stringify(mv3.toString())
      },
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
    }),
    new webpack.ProvidePlugin(provideModules),
    new webpack.NormalModuleReplacementPlugin(/node:/, resource => {
      const mod = resource.request.replace(/^node:/, '');
      if (mod === 'buffer') {
        resource.request = 'buffer';
      } else if (mod === 'stream') {
        resource.request = 'readable-stream';
      }
    }),
    new VueLoaderPlugin(),
    new VuetifyPlugin(),
    new MiniCssExtractPlugin({
      filename: '[name]/style.css',
      ignoreOrder: true
    })
  ];

  const enginesRootDir = path.join(__dirname, 'src/engines');

  const engines = (
    await Promise.all(
      (await readdir(enginesRootDir)).map(async function (file) {
        if ((await lstat(path.join(enginesRootDir, file))).isFile()) {
          return file.split('.')[0];
        }
      })
    )
  ).filter(engine =>
    engine && (!releaseBuild || releaseEngines.includes(engine))
  );

  const entries = Object.fromEntries(
    engines.map(engine => [engine, `./src/engines/${engine}.js`])
  );

  return {
    mode: isProduction ? 'production' : 'development',
    target: 'browserslist',
    entry: {
      background: './src/background/main.js',
      options: './src/options/main.js',
      sidepanel: './src/sidepanel/main.js',
      select: './src/select/main.js',
      capture: './src/capture/main.js',
      confirm: './src/confirm/main.js',
      overlay: './src/overlay/main.js',
      search: './src/search/main.js',
      view: './src/view/main.js',
      base: './src/base/main.js',
      content: './src/content/main.js',
      parse: './src/parse/main.js',
      tab: './src/tab/main.js',
      ...entries
    },
    output: {
      path: path.resolve(__dirname, 'dist', targetEnv, 'src'),
      filename: pathData => {
        return engines.includes(pathData.chunk.name)
          ? 'engines/[name]/script.js'
          : '[name]/script.js';
      },
      chunkFilename: '[name]/script.js',
      chunkFormat: 'array-push',
      asyncChunks: false
    },
    optimization: {
      splitChunks: {
        cacheGroups: {
          default: false,
          commonsUi: {
            name: 'commons-ui',
            chunks: chunk => {
              return [
                'options',
                'sidepanel',
                'select',
                'capture',
                'confirm',
                'overlay',
                'search',
                'view'
              ].includes(chunk.name);
            },
            minChunks: 2
          },
          commonsEngine: {
            name: 'commons-engine',
            chunks: chunk => engines.includes(chunk.name),
            minChunks: 2
          }
        }
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader',
          resolve: {
            fullySpecified: false
          }
        },
        {
          test: /\.vue$/,
          use: [
            {
              loader: 'vue-loader',
              options: {
                transformAssetUrls: {img: ''},
                compilerOptions: {whitespace: 'preserve'}
              }
            }
          ]
        },
        {
          test: /\.(c|sc|sa)ss$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
            {
              loader: 'sass-loader',
              options: {
                api: 'legacy',
                sassOptions: {
                  includePaths: ['node_modules'],
                  silenceDeprecations: ['legacy-js-api'],
                  quietDeps: true
                },
                additionalData: (content, loaderContext) => {
                  return `
                  $target-env: "${targetEnv}";
                  ${content}
                `;
                }
              }
            }
          ]
        }
      ]
    },
    resolve: {
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
      extensions: ['.js', '.json', '.css', '.scss', '.vue'],
      fallback: {fs: false}
    },
    performance: {
      hints: false
    },
    devtool: false,
    plugins
  };
}
