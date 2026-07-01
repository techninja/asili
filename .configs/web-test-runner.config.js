import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  files: 'src/components/atoms/**/*.test.js',
  nodeResolve: true,
  rootDir: '..',
  browsers: [playwrightLauncher({ product: 'chromium' })],
};
