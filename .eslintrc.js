module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:storybook/recommended"
  ],
  rules: {
    "no-bitwise": "off",
    "no-param-reassign": "off",
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
  },
};
