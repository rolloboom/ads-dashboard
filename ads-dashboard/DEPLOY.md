# Деплой на Vercel

## Крок 1 — Google Sheets API ключ

1. Відкрий https://console.cloud.google.com
2. Новий проект → "Ads Dashboard"
3. APIs & Services → Enable APIs → знайди "Google Sheets API" → Enable
4. APIs & Services → Credentials → Create Credentials → API Key
5. Скопіюй ключ (AIza...)
6. (опційно) Restrict Key → API restrictions → Google Sheets API

## Крок 2 — Зроби таблицю публічною для читання

1. Відкрий таблицю Google Sheets
2. Поділитися → Змінити доступ → "Будь-хто з посиланням" → Читач
   (або залишити приватною — тоді потрібен service account, складніше)

## Крок 3 — GitHub

```bash
cd C:\Users\Rollo\Desktop\ads-dashboard
git init
git add .
git commit -m "init"
# Створи репозиторій на github.com, потім:
git remote add origin https://github.com/ТВІЙ_ЮЗЕР/ads-dashboard.git
git push -u origin main
```

## Крок 4 — Vercel

1. Відкрий https://vercel.com → Add New Project
2. Імпортуй репозиторій з GitHub
3. Settings → Environment Variables, додай:
   - `GOOGLE_SHEETS_API_KEY` = AIza...твій_ключ
   - `SHEET_ID` = 1IjE6IGmXAmDHF-mbaUjkWWIK8hk2wjL0YfC2-VjXkz0
   - `SHEET_TAB` = Кампанії
4. Deploy → через ~30 секунд сайт готовий!

## Оновлення даних

Дашборд кешує дані на 60 секунд. Кнопка "Оновити" примусово перезавантажує.
Дані в таблицю додає Google Ads скрипт (запускається вручну або за розкладом).
