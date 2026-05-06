// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

import baseConfig from './vite.config'
import { defineConfig, mergeConfig } from 'vite'

export default mergeConfig(baseConfig, defineConfig({
  base: '/',
}))
