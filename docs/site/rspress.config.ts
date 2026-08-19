import { defineConfig } from '@rspress/core';

export default defineConfig({
  base: '/react-native-reorderable/',
  builderConfig: {
    output: {
      cleanDistPath: true,
    },
  },
  description:
    'Virtualized, sectioned and native reorder and drag-and-drop for React Native.',
  globalStyles: new URL('./styles.css', import.meta.url).pathname,
  lang: 'en',
  outDir: '../../doc_build',
  root: 'content',
  title: 'React Native Reorderable',
  themeConfig: {
    editLink: {
      docRepoBaseUrl:
        'https://github.com/thiagobrez/react-native-reorderable/tree/main/docs/site/content',
    },
    lastUpdated: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/thiagobrez/react-native-reorderable',
      },
    ],
  },
});
