import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// GitHub Pages project site: https://<user>.github.io/journeaux-alimentaires/
const base = process.env.GITHUB_PAGES === "true" ? "/journeaux-alimentaires/" : "/";

export default defineConfig({
  base,
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
