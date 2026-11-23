// The desktop's globals.css is Tailwind, and the shared components it styles
// live one level up. Tailwind scans from the working directory, which is the
// web app's own folder; web/app/web.css names the shared sources.
const config = {
  plugins: { '@tailwindcss/postcss': {} },
}

export default config
