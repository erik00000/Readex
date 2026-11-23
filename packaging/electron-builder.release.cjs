const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const output = `release/v${pkg.version}`;

module.exports = {
  ...pkg.build,
  directories: { ...pkg.build.directories, output },
  electronLanguages: ['en-US', 'zh-CN', 'zh-TW'],
  extraFiles: [{ from: 'packaging/使用说明.txt', to: '使用说明.txt' }],
  win: {
    ...pkg.build.win,
    target: [{ target: 'nsis', arch: ['x64'] }],
    signExecutable: false
  },
  nsis: {
    artifactName: 'Readex-${version}-Setup-${arch}.${ext}',
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    selectPerMachineByDefault: false,
    runAfterFinish: false,
    installerLanguages: ['zh_CN', 'en_US'],
    include: 'packaging/installer.nsh',
    deleteAppDataOnUninstall: false
  },
  afterPack: async ({ appOutDir }) => {
    const debugLog = path.join(appOutDir, 'debug.log');
    if (fs.existsSync(debugLog)) fs.unlinkSync(debugLog);
    const files = [], directories = [];
    const visit = (directory, prefix = '') => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
          if (!prefix && ['data', 'runtime'].includes(entry.name)) throw Error('Personal data must not be packaged');
          visit(path.join(directory, entry.name), relative);
          directories.push(relative);
        } else files.push(relative);
      }
    };
    visit(appOutDir);
    for (const generated of ['resources\\elevate.exe', 'resources\\app-update.yml', 'uninstallerIcon.ico']) {
      if (!files.includes(generated)) files.push(generated);
    }
    for (const locale of ['en-US', 'zh-CN', 'zh-TW']) {
      if (!fs.existsSync(path.join(appOutDir, 'locales', locale + '.pak'))) throw Error('Missing Electron locale: ' + locale);
    }
    console.log('Verified clean release payload: ' + files.length + ' files');
    const nsisPath = (value) => value.replaceAll('$', '$$').replaceAll('"', '$\\"');
    const lines = [
      '; Generated from the clean application bundle. Remove installed files only.',
      '!macro customRemoveFiles',
      '  SetOutPath $TEMP',
      ...files.map(file => `  Delete "$INSTDIR\\${nsisPath(file)}"`),
      '  Delete "$INSTDIR\\${UNINSTALL_FILENAME}"',
      ...directories.map(directory => `  RMDir "$INSTDIR\\${nsisPath(directory)}"`),
      '  RMDir "$INSTDIR"',
      '!macroend', ''
    ];
    fs.writeFileSync(path.join(__dirname, 'installed-files.generated.nsh'), lines.join('\n'));
  }
};
