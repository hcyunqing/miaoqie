const path = require('path');

const APP_NAME = 'traeswitch';
const APP_NAME_ZH = '秒切';
const APP_ID = 'com.miaoqie.traeswitch';
const APP_SLUG = 'miaoqie';
const DATA_STORE_NAME = 'miaoqie-data';
const BACKUP_FORMAT = 'miaoqie';

function getIconPath() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '../build/icon.ico');
  }
  return path.join(__dirname, '../build/icon.png');
}

module.exports = {
  APP_NAME,
  APP_NAME_ZH,
  APP_ID,
  APP_SLUG,
  DATA_STORE_NAME,
  BACKUP_FORMAT,
  getIconPath,
};
