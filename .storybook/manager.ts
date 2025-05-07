import { addons } from '@storybook/addons';
import { create } from '@storybook/theming/create';

// Define custom Storybook theme if needed
addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'My custom Storybook',
  }),
});