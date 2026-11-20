// Copia las librerías de terceros a www/vendor para que la app funcione sin CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('www/vendor', { recursive: true });
copyFileSync('node_modules/peerjs/dist/peerjs.min.js', 'www/vendor/peerjs.min.js');
copyFileSync('node_modules/qrcode-generator/dist/qrcode.mjs', 'www/vendor/qrcode.mjs');
console.log('librerías copiadas a www/vendor');
