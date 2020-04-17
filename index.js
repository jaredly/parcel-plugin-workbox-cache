const { generateSWString } = require('workbox-build');
const { readFile, writeFileSync, readFileSync } = require('fs');

const path = require('path');
const uglifyJS = require('uglify-js');
const workboxConfig = null;
const stringHash = require('string-hash');

const getAllFiles = (bundle, fn) => {
    fn(bundle.name);
    for (let child of bundle.childBundles) {
        getAllFiles(child, fn);
    }
};

const createServiceWorker = (bundle) => {
    const allFiles = {};
    let pathOut = bundle.options.outDir;
    getAllFiles(bundle.mainBundle, (name) => {
        allFiles[name] = true;
    });
    const paths = Object.keys(allFiles).map((name) => {
        const rel = path.relative(pathOut, name);
        const hash = rel.split('.').slice(-2)[0];
        if (!isNaN(parseInt(hash, 16))) {
            return { url: rel, revision: null };
        } else {
            console.log(rel, name);
            const hash = stringHash(readFileSync(name, 'utf8'));
            return { url: rel, revision: hash.toString(16) };
        }
    });

    return `
/**
 * Welcome to your Workbox-powered service worker!
 *
 * You'll need to register this file in your web app and you should
 * disable HTTP caching for this file too.
 * See https://goo.gl/nhQhGp
 *
 * The rest of the code is auto-generated. Please don't update this file
 * directly; instead, make changes to your Workbox build configuration
 * and re-run your build process.
 * See https://goo.gl/2aRDsh
 */

importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js"
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * The workboxSW.precacheAndRoute() method efficiently caches and responds to
 * requests for URLs in the manifest.
 * See https://goo.gl/S9QRab
 */
self.__precacheManifest = ${JSON.stringify(
        paths,
        null,
        2,
    )}.concat(self.__precacheManifest || []);
workbox.precaching.precacheAndRoute(self.__precacheManifest, {
  "ignoreURLParametersMatching": [/.*/]
});
  `;
};

module.exports = (bundle) => {
    bundle.on('buildEnd', async () => {
        // output path
        let pathOut = bundle.options.outDir;

        var seen = [];

        const allFiles = [];

        // require('fs').writeFileSync('./tmp.bundle.json', JSON.stringify(decycle(bundle), null, 2))
        //   require('fs').writeFileSync('./tmp.bundle.json', JSON.stringify(bundle, function(key, val) {
        //     if (val != null && typeof val == "object") {
        //          if (seen.indexOf(val) >= 0) {
        //              return '<recursive>';
        //          }
        //          seen.push(val);
        //      }
        //      if (typeof val === 'function') {
        //        return '<fn>'
        //      }
        //      return val;
        //  }, 2))
        // console.log(Object.keys(bundle));
        const fileFormats =
            'css,html,js,gif,ico,jpg,png,svg,webp,woff,woff2,ttf,otf';
        const DEFAULT_CONFIG = {
            // scripts to import into sw
            importScripts: ['./worker.js'],
            // directory to include
            globDirectory: bundle.options.outDir,
            // file types to include
            globPatterns: [`**/*.{${fileFormats}}`],
        };

        let pkg;
        let mainAsset =
            bundle.mainAsset ||
            bundle.mainBundle.entryAsset ||
            bundle.mainBundle.childBundles.values().next().value.entryAsset;

        pkg =
            typeof mainAsset.getPackage === 'function'
                ? await mainAsset.getPackage()
                : mainAsset.package;

        let config = Object.assign(
            {},
            workboxConfig ? workboxConfig : DEFAULT_CONFIG,
        );

        if (pkg.workbox) {
            if (
                pkg.workbox.importScripts &&
                Array.isArray(pkg.workbox.importScripts)
            ) {
                config.importScripts = pkg.workbox.importScripts;
            }
            if (
                pkg.workbox.importScripts &&
                !Array.isArray(pkg.workbox.importScripts)
            ) {
                config.importScripts = [pkg.workbox.importScripts];
            }
            if (pkg.workbox.globDirectory)
                config.globDirectory = pkg.workbox.globDirectory;
            config.globDirectory = path.resolve(config.globDirectory);
            if (
                pkg.workbox.globPatterns &&
                Array.isArray(pkg.workbox.globPatterns)
            ) {
                config.globPatterns = pkg.workbox.globPatterns;
            }
            if (
                pkg.workbox.globPatterns &&
                !Array.isArray(pkg.workbox.globPatterns)
            ) {
                config.globPatterns = [pkg.workbox.globPatterns];
            }
            if (pkg.workbox.pathOut) pathOut = pkg.workbox.pathOut;
        }
        const dest = path.resolve(pathOut);

        // logger.log('🛠️  Workbox - yes');
        // config.importScripts.forEach((s) => {
        //     readFile(path.resolve(s), (err, data) => {
        //         if (err) throw err;
        //         if (bundle.options.minify) {
        //             const res = uglifyJS.minify(data);
        //             data = res.error ? data : res.code;
        //         }
        //         const impDest = path.resolve(pathOut, /[^\/]+$/.exec(s)[0]);
        //         writeFileSync(impDest, data);
        //         // logger.success(`Imported ${s} to ${impDest}`);
        //     });
        // });

        config.importScripts = config.importScripts.map((s) => {
            return /[^\/]+$/.exec(s)[0];
        });
        config.importScripts.unshift(
            'https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js',
        );

        // logger.success(JSON.stringify(config, null, 2));
        // require('fs')
        //     .readdirSync(config.globDirectory)
        //     .forEach((name) => {
        //         console.log('File to precache', name);
        //     });
        await Promise.resolve(createServiceWorker(bundle)) // generateSWString(config)
            .then((swString) => {
                // swString = swString.swString
                // logger.success('Service worker generated');
                if (bundle.options.minify) {
                    const res = uglifyJS.minify(swString);
                    swString = res.error ? swString : res.code;
                    // logger.success(
                    //     `Service worker minified ${typeof swString} ${Object.keys(res).join(',')} ${
                    //         res.error
                    //     }`,
                    // );
                }
                writeFileSync(path.join(dest, 'sw.js'), swString);
                // logger.success(`Service worker written to ${dest}/sw.js`);
            })
            .catch((err) => {
                // logger.error(err);
            });

        const entry = path.resolve(pathOut, 'index.html');
        await new Promise((res, rej) =>
            readFile(entry, 'utf8', (err, data) => {
                if (err) {
                    // logger.error(err);
                    return rej(err);
                }
                if (!data.includes('serviceWorker.register')) {
                    let swTag = `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js');
          });
        }
      `;
                    if (bundle.options.minify) {
                        swTag = uglifyJS.minify(swTag);
                        swTag = `<script>${swTag.code}</script></body>`;
                    } else {
                        swTag = `
        <script>
        ${swTag}
        </script>
      </body>`;
                    }
                    data = data.replace('</body>', swTag);
                    writeFileSync(entry, data);
                    // logger.success(`Service worker injected into ${dest}/index.html`);
                }
                res();
            }),
        );
    });
};
