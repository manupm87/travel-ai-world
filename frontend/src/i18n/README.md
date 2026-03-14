# Internationalization (`/i18n`)

## Purpose
This directory contains all the configuration, translation files, and utilities related to Internationalization (i18n). Its purpose is to allow the application to be presented in multiple languages seamlessly.

## Contents
Typically, this directory holds:
- **Translation Dictionaries**: JSON or TypeScript files containing key-value pairs of translated strings for each supported language (e.g., `en.json`, `es.json`, `fr.json`).
- **Configuration**: Setup files for the i18n library (like `next-i18next`, or a custom solution), defining the default language, supported languages, and loading mechanisms.
- **Language Detection**: Logic to determine the user's preferred language based on their browser settings, URL, or explicit preference.

## Best Practices
1. **Keys, not Strings**: Inside your UI components in `/app` and `/components`, you should rarely hardcode text. Instead, use translation keys (e.g., `<Button>{t('common.submit')}</Button>`).
2. **Organization**: As the app grows, organize translation dictionaries logically, perhaps splitting them by feature or page rather than having one massive `en.json` file.
3. **Placeholders**: Design translations to support dynamic values (e.g., "Welcome back, {{name}}!").
