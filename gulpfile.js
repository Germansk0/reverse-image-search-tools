import path from 'node:path';
import {exec} from 'node:child_process';
import {copyFile, lstat, readdir, readFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';

import {series, parallel, src, dest} from 'gulp';
import postcss from 'gulp-postcss';
import gulpif from 'gulp-if';
import jsonmin from 'gulp-jsonmin';
import htmlmin from 'gulp-htmlmin';
import imagemin from 'gulp-imagemin';
import {optipng, svgo} from 'gulp-imagemin';
import {ensureDir} from 'fs-extra/esm';
import recursiveReadDir from 'recursive-readdir';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;

const jsonMerge = require('gulp-merge-json');

const {
  default: {version: appVersion}
} = await import('./package.json', {with: {type: 'json'}});

const targetEnv = process.env.TARGET_ENV || 'chrome';
const isProduction = process.env.NODE_ENV === 'production';
// PNG optimization is optional; skipping it keeps the same pixels and allows
// production builds where the optional optipng binary is unavailable.
const optimizePng = isProduction && process.env.SKIP_PNG_OPTIMIZATION !== 'true';

const mv3 = ['chrome', 'edge', 'opera', 'safari'].includes(targetEnv);

const distDir = path.join(__dirname, 'dist', targetEnv);

function initEnv() {
  process.env.BROWSERSLIST_ENV = targetEnv;
}

async function init() {
  initEnv();

  await rm(distDir, {recursive: true, force: true});
  await ensureDir(distDir);
}

function js(done) {
  exec(
    `webpack-cli build --color --env appVersion=${appVersion} --env mv3=${mv3}`,
    function (err, stdout, stderr) {
      console.log(stdout);
      console.log(stderr);
      done(err);
    }
  );
}

function html() {
  const htmlSrc = ['src/**/*.html'];

  if (mv3 && !['firefox', 'safari'].includes(targetEnv)) {
    htmlSrc.push('!src/background/*.html');
  }


  return src(htmlSrc, {base: '.'})
    .pipe(gulpif(isProduction, htmlmin({collapseWhitespace: true})))
    .pipe(dest(distDir));
}

function css() {
  return src(
    [
      'src/content/style.css',
      'src/select/pointer.css',
      'src/engines/css/*.css'
    ],
    {base: '.'}
  )
    .pipe(postcss())
    .pipe(dest(distDir));
}

async function images(done) {
  await ensureDir(path.join(distDir, 'src/assets/icons/app'));
  const appIconSvg = await readFile('src/assets/icons/app/icon.svg');
  const {width: appIconWidth} = await sharp(appIconSvg).metadata();
  const appIconSizes = [16, 19, 24, 32, 38, 48, 64, 96, 128];
  if (targetEnv === 'safari') {
    appIconSizes.push(256, 512, 1024);
  }
  for (const size of appIconSizes) {
    await sharp(appIconSvg, {density: Math.max(72, (72 * size) / appIconWidth)})
      .resize(size)
      .toFile(path.join(distDir, `src/assets/icons/app/icon-${size}.png`));
  }

  if (optimizePng) {
    await new Promise(resolve => {
      src(path.join(distDir, 'src/assets/icons/app/*.png'), {
        base: '.',
        encoding: false
      })
        .pipe(imagemin([optipng()]))
        .pipe(dest('.'))
        .on('error', done)
        .on('finish', resolve);
    });
  }

  if (targetEnv === 'firefox') {
    await ensureDir(path.join(distDir, 'src/assets/icons/engines'));
    const pngPaths = await recursiveReadDir('src/assets/icons/engines', [
      '*.!(png)'
    ]);
    const menuIconSizes = [16, 32];
    for (const pngPath of pngPaths) {
      for (const size of menuIconSizes) {
        await sharp(pngPath)
          .resize(size)
          .toFile(path.join(distDir, `${pngPath.slice(0, -4)}-${size}.png`));
      }
    }
    if (optimizePng) {
      await new Promise(resolve => {
        src(path.join(distDir, 'src/assets/icons/engines/*.png'), {
          base: '.',
          encoding: false
        })
          .pipe(imagemin([optipng()]))
          .pipe(dest('.'))
          .on('error', done)
          .on('finish', resolve);
      });
    }
  }

  await new Promise(resolve => {
    const sources = 'app|engines|misc';

    src(`src/assets/icons/@(${sources})/*.@(png|svg)`, {
      base: '.',
      encoding: false
    })
      .pipe(gulpif(isProduction, imagemin([svgo()])))
      .pipe(dest(distDir))
      .on('error', done)
      .on('finish', resolve);
  });

}

async function fonts(done) {
  await new Promise(resolve => {
    src('src/assets/fonts/roboto.css', {base: '.'})
      .pipe(postcss())
      .pipe(dest(distDir))
      .on('error', done)
      .on('finish', resolve);
  });

  await new Promise(resolve => {
    src(
      'node_modules/@fontsource/roboto/files/roboto-latin-@(400|500|700)-normal.woff2',
      {encoding: false}
    )
      .pipe(dest(path.join(distDir, 'src/assets/fonts/files')))
      .on('error', done)
      .on('finish', resolve);
  });
}

async function locale(done) {
  const localesRootDir = path.join(__dirname, 'src/assets/locales');
  const localeDirs = (
    await Promise.all(
      (await readdir(localesRootDir)).map(async function (file) {
        if ((await lstat(path.join(localesRootDir, file))).isDirectory()) {
          return file;
        }
      })
    )
  ).filter(Boolean);

  for (const localeDir of localeDirs) {
    const localePath = path.join(localesRootDir, localeDir);
    // Keep the shared Hebrew source catalog while using Chrome's locale code.
    const outputLocale =
      targetEnv === 'chrome' && localeDir === 'iw' ? 'he' : localeDir;
    await new Promise(resolve => {
      src(
        [
          path.join(localePath, 'messages.json'),
          path.join(localePath, `messages-${targetEnv}.json`)
        ],
        {allowEmpty: true}
      )
        .pipe(
          jsonMerge({
            fileName: 'messages.json',
            edit: (parsedJson, file) => {
              if (isProduction) {
                for (let [key, value] of Object.entries(parsedJson)) {
                  if (value.hasOwnProperty('description')) {
                    delete parsedJson[key].description;
                  }
                }
              }
              return parsedJson;
            }
          })
        )
        .pipe(gulpif(isProduction, jsonmin()))
        .pipe(dest(path.join(distDir, '_locales', outputLocale)))
        .on('error', done)
        .on('finish', resolve);
    });
  }

  if (targetEnv === 'chrome') {
    // The Store lists Norwegian as "no", while Chrome can load Bokmål as "nb".
    const localeRoot = path.join(distDir, '_locales');
    await ensureDir(path.join(localeRoot, 'nb'));
    await copyFile(
      path.join(localeRoot, 'no', 'messages.json'),
      path.join(localeRoot, 'nb', 'messages.json')
    );
  }
}

function manifest() {
  return src(`src/assets/manifest/${targetEnv}.json`)
    .pipe(
      jsonMerge({
        fileName: 'manifest.json',
        edit: (parsedJson, file) => {
          parsedJson.version = appVersion;
          return parsedJson;
        }
      })
    )
    .pipe(gulpif(isProduction, jsonmin()))
    .pipe(dest(distDir));
}

function license() {
  return src(['LICENSE', 'NOTICE']).pipe(dest(distDir));
}

function checkEnv(done) {
  if (!['x64', 'ia32'].includes(process.arch)) {
    done();

    console.log(`
The current CPU architecture (${process.arch}) is not supported.
See README.md for build instructions.
`);

    process.exit(1);
  }
}

function build(done) {
  checkEnv(done);

  return series(
    init,
    parallel(js, html, css, images, fonts, locale, manifest, license)
  )(done);
}

function zip(done) {
  checkEnv(done);

  exec(
    `web-ext build -s dist/${targetEnv} -a artifacts/${targetEnv} -n "{name}-{version}-${targetEnv}.zip" --overwrite-dest`,
    function (err, stdout, stderr) {
      console.log(stdout);
      console.log(stderr);
      done(err);
    }
  );
}

function inspect(done) {
  checkEnv(done);
  initEnv();

  exec(
    `npm run build:prod:chrome && \
    webpack --profile --json > report.json && \
    webpack-bundle-analyzer --mode static report.json dist/chrome/src && \
    sleep 3 && rm report.{json,html}`,
    {shell: '/bin/bash'},
    function (err, stdout, stderr) {
      console.log(stdout);
      console.log(stderr);
      done(err);
    }
  );
}

export {build, zip, inspect};
