export default {
  '*.ts': (filenames) => [`eslint --max-warnings=0 ${filenames.join(' ')}`],

  '*.{ts,js,cjs,mjs,json,md,yml,yaml}': (filenames) => [`prettier --write ${filenames.join(' ')}`],

  '*.ts': () => 'tsc --noEmit',
};
