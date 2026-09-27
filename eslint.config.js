import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Código que corre en Node: funciones serverless, plugins de Vite,
    // scripts y core del servidor (usan process/Buffer/global).
    files: [
      'api/**/*.js',
      'scripts/**/*.{js,mjs}',
      'src/server/**/*.js',
      'src/plugins/**/*.js',
      'vite.config.js',
      'vitest.config.js',
      'vitest.setup.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Servicio de WhatsApp (Whatsapp/servidor): Node puro, con su propio package.json.
    // No entra al build de Vite; se corre aparte con `npm start` desde esa carpeta.
    files: ['Whatsapp/servidor/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // useMultiFileAuthState es de Baileys, no un hook de React.
      'react-hooks/rules-of-hooks': 'off',
      // `catch {}` a propósito: fallas que no cambian el curso (ver el comentario de cada una).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Panel y mockup: corren en el navegador sin bundler. data.js define sus datos de
    // ejemplo como globals porque se carga con <script> antes que app.js.
    files: ['Whatsapp/web/**/*.js', 'Whatsapp/mockup/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        CHATS: 'readonly',
        ESTADOS: 'readonly',
        LINE_PHONE: 'readonly',
        LOG: 'readonly',
        ME: 'readonly',
        UNITS: 'readonly',
        VENDEDORES: 'readonly',
        carSvg: 'readonly',
        fmtKm: 'readonly',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
