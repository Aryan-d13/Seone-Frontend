const font = {
  family: 'NotoSans',
  weight: 700,
  fallbacks: [],
  size: 60,
  language_overrides: {
    en: {
      family: 'NotoSans',
      weight: 700,
    },
    hi: {
      family: 'NotoSansDevanagari',
      weight: 700,
    },
  },
};

const nextSelection = { family: 'Hind', weight: 400, copyLanguage: 'hi' };
const language = 'hi';

const nextFont = {
  ...font,
  family: nextSelection.family,
  weight: nextSelection.weight,
};

const languageOverrides = {
  ...(font.language_overrides || {}),
  [language]: {
    family: nextSelection.family,
    weight: nextSelection.weight,
  },
};

const result = {
  ...nextFont,
  language_overrides: languageOverrides,
};

console.log(JSON.stringify(result, null, 2));
