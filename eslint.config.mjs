import { createRequire } from "node:module";
import tseslint from "typescript-eslint";

const require = createRequire(import.meta.url);
const gtsConfig = require("gts");

// gts already registers @typescript-eslint plugin + recommended rules;
// extract only the type-checked rule set to avoid plugin redefinition.
const typeCheckedRules = tseslint.configs.recommendedTypeChecked.find(
  (c) => c.name === "typescript-eslint/recommended-type-checked",
);

// gts item 7 sets parserOptions.project = "./tsconfig.json",
// which conflicts with projectService. Strip it before merging.
const patchedGtsConfig = gtsConfig.map((item) => {
  if (item.languageOptions?.parserOptions?.project) {
    const { project, ...restParserOptions } = item.languageOptions.parserOptions;
    return {
      ...item,
      languageOptions: {
        ...item.languageOptions,
        parserOptions: restParserOptions,
      },
    };
  }
  return item;
});

export default tseslint.config(
  ...patchedGtsConfig,
  typeCheckedRules,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "prettier/prettier": "off",
      quotes: "off",
    },
  },
  { ignores: ["dist/", "node_modules/", "*.js", "*.mjs", "eslint.config.mjs"] },
);
