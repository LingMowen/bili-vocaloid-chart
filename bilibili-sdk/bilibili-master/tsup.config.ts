import { defineConfig } from 'tsup'

const apiModules = [
  'video',
  'user',
  'search',
  'dynamic',
  'live',
  'comment',
  'bangumi',
  'article',
  'login',
  'senior',
  'danmaku',
  'fav',
  'history',
  'audio',
  'manga',
  'cheese',
  'creative',
  'vip',
  'note',
  'opus',
  'album',
  'blackroom',
  'garb',
  'emoji',
  'electric',
  'message',
]

const entry: Record<string, string> = {
  main: 'src/main.ts',
  'core/index': 'src/core/index.ts',
  'transport/index': 'src/transport/index.ts',
  'types/index': 'src/types/index.ts',
  'utils/index': 'src/utils/index.ts',
  'api/index': 'src/api/index.ts',
}
for (const m of apiModules) {
  entry[`api/${m}/index`] = `src/api/${m}/index.ts`
}

export default defineConfig({
  entry,
  outDir: 'dist',
  format: 'esm',
  dts: {
    resolve: false,
  },
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
})
