import sveltePreprocess from "svelte-preprocess";

export default {
  preprocess: sveltePreprocess(),
  compilerOptions: {
    css: "injected",
  },
};
