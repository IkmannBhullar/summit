// Config for @vite-pwa/assets-generator: turns public/icon.svg into every
// PNG size browsers and phones expect. Run `npm run generate-icons -w apps/web`
// after changing the icon, then commit the PNGs. (They're generated once,
// not on every build, so builds stay fast and don't need image tooling.)
import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

/** Summit teal: the background color behind padded icons. */
const TEAL = "#0f766e";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // "Maskable" icons get cropped into circles/squircles by Android, so the
    // artwork is padded into the safe middle area on a teal background.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: TEAL } },
    // Apple touch icons can't be transparent; fill the padding with teal too.
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: TEAL } },
  },
  images: ["public/icon.svg"],
});
