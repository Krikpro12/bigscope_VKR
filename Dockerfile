# Используем Python базовый образ
FROM python:3.9-slim

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libffi-dev \
    zlib1g-dev \
    && apt-get clean

# Копируем проект
COPY . .

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Экспортируем порт
EXPOSE 5000

# Запуск приложения
CMD ["python", "app.py"]
