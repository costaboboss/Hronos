# Деплой Хронос на Railway

## Требования

- Аккаунт на [railway.app](https://railway.app)
- Аккаунт на [GitHub](https://github.com)
- Приложение Google OAuth (Google Cloud Console)

---

## Шаг 1 — Создание Google OAuth приложения

1. Перейдите на [console.cloud.google.com](https://console.cloud.google.com)
2. Создайте новый проект или выберите существующий
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs**
4. Тип: **Web application**
5. Authorized redirect URIs — добавьте после получения домена Railway:
   ```
   https://YOUR-APP.railway.app/api/oauth/callback/google
   ```
6. Сохраните **Client ID** и **Client Secret**

---

## Шаг 2 — Загрузка кода на GitHub

```bash
# Инициализация репозитория
git init
git add .
git commit -m "Initial commit: Хронос time tracker"

# Создание репозитория на GitHub и push
gh repo create chronos --public --push --source=.
# или вручную:
git remote add origin https://github.com/YOUR_USERNAME/chronos.git
git push -u origin main
```

---

## Шаг 3 — Создание проекта на Railway

1. Перейдите на [railway.app](https://railway.app) → **New Project**
2. Выберите **Deploy from GitHub repo** → выберите репозиторий `chronos`
3. Railway автоматически обнаружит `Dockerfile` и `railway.json`

---

## Шаг 4 — Добавление базы данных MySQL

1. В проекте Railway: **+ New Service → Database → PostgreSQL**
2. После создания скопируйте `DATABASE_URL` из вкладки **Connect**

---

## Шаг 5 — Переменные окружения

В настройках сервиса Railway → **Variables** добавьте:

| Переменная | Значение | Описание |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Строка подключения к PostgreSQL |
| `JWT_SECRET` | случайная строка 64+ символа | Секрет для подписи JWT |
| `GOOGLE_CLIENT_ID` | из Google Cloud Console | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | из Google Cloud Console | Google OAuth Client Secret |
| `VITE_USE_GOOGLE_OAUTH` | `true` | Включить Google OAuth на фронтенде |
| `NODE_ENV` | `production` | Режим production |

Генерация JWT_SECRET:
```bash
openssl rand -base64 48
```

---

## Шаг 6 — Деплой

1. Railway автоматически запустит деплой после push в GitHub
2. Pre-deploy команда `node migrate.mjs` применит миграции БД
3. После деплоя получите домен вида `https://chronos-production.up.railway.app`

---

## Шаг 7 — Обновление Google OAuth Redirect URI

После получения домена Railway:
1. Вернитесь в Google Cloud Console → Credentials
2. Добавьте в **Authorized redirect URIs**:
   ```
   https://YOUR-DOMAIN.railway.app/api/oauth/callback/google
   ```

---

## Структура файлов деплоя

```
Dockerfile       ← Сборка и запуск приложения
railway.json     ← Конфигурация Railway (builder, pre-deploy, healthcheck)
migrate.mjs      ← Скрипт применения миграций БД
drizzle/         ← Схема и миграции Drizzle ORM
```

---

## Локальная разработка

```bash
# Установка зависимостей
pnpm install

# Запуск dev-сервера
pnpm dev

# Запуск тестов
pnpm test

# Сборка для production
pnpm build
```
