import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs", // Set source type to commonjs for Node.js
      globals: {
        ...globals.node, // Include Node.js globals
        ...globals.browser, // Include browser globals if needed
      },
    },
    plugins: {
      js: pluginJs, // Include the ESLint JS plugin
    },
    rules: {
      // Add any specific rules you want to enforce
    },
  },
  pluginJs.configs.recommended, // Use the recommended configuration from ESLint JS
];