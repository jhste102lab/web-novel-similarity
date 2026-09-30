// rhwp fetches its WASM by URL in the browser; Node's fetch cannot read file: URLs, so tests
// hand it the bytes. Later `init()` calls see the instance and return at once.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { initSync } from '@rhwp/core'

initSync({
  module: readFileSync(createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')),
})
