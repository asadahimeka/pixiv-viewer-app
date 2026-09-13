const path = require('path')
const autoprefixer = require('autoprefixer')
const pxtorem = require('postcss-pxtorem')

const isProduction = process.env.NODE_ENV === 'production'
const svgIconDir = path.join(__dirname, 'src/icons/svg')

/** @type import('@vue/cli-service').ProjectOptions */
module.exports = {
  publicPath: '/',
  lintOnSave: false,
  runtimeCompiler: false,
  productionSourceMap: false,
  devServer: {
    client: {
      overlay: false, // 关闭错误/警告浮层
    },
  },
  transpileDependencies: ['@material/material-color-utilities'],
  configureWebpack: config => {
    if (isProduction) {
      config.optimization.minimizer[0].options.minimizer.options.compress.drop_console = true
    }
  },
  chainWebpack: config => {
    config
      .module
      .rule('vue')
      .use('vue-loader')
      .tap(args => {
        args.compilerOptions.whitespace = 'preserve'
      })

    config.module
      .rule('svg')
      .exclude.add(svgIconDir)
      .end()

    config.module
      .rule('icons')
      .test(/\.svg$/)
      .include.add(svgIconDir)
      .end()
      .use('xml-loader')
      .loader('xml-loader')
      .end()

    // Handle .wasm files for ONNX Runtime Web
    config.module
      .rule('wasm')
      .test(/\.wasm$/)
      .type('javascript/auto')
      .exclude
      .add(/node_modules/)
      .end()

    // Prevent webpack from auto-extracting ONNX Runtime WASM files (loaded from CDN at runtime)
    config.module
      .rule('ort-js')
      .test(/onnxruntime-web/)
      .parser({ url: false })
    if (isProduction) {
      config.plugins.delete('preload')
      config.plugins.delete('prefetch')
      config.optimization.minimize(true)
      config.optimization
        .splitChunks({
          chunks: 'all',
          cacheGroups: {
            ort: {
              test: /[\\/]node_modules[\\/]onnxruntime-web[\\/]/,
              name: 'ort',
              chunks: 'all',
              priority: 20,
            },
          },
        })
      // 模型不自托管：构建时排除 public/models/*.onnx（运行时从 CDN 加载）
      config.plugin('copy').tap(args => {
        // copy-webpack-plugin@9 构造器接收 { patterns: [...] }；旧版接收 patterns 数组，两种都兼容
        const patterns = Array.isArray(args[0]) ? args[0] : args[0] && args[0].patterns
        if (Array.isArray(patterns)) {
          for (const pattern of patterns) {
            if (!pattern.globOptions) pattern.globOptions = {}
            const ignores = pattern.globOptions.ignore || []
            ignores.push('**/models/*.onnx')
            pattern.globOptions.ignore = ignores
          }
        }
        return args
      })
    }
  },
  css: {
    sourceMap: false,
    loaderOptions: {
      postcss: {
        postcssOptions: {
          plugins: [
            autoprefixer(),
            pxtorem({
              rootValue: 75,
              propList: ['*'],
              selectorBlackList: ['van', 'fancybox', 'ispx'],
            }),
          ],
        },
      },
    },
  },
}
