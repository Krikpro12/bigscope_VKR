from flask import Flask, render_template, request, jsonify
from pymongo import MongoClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from wordcloud import WordCloud
import os
from flask import send_from_directory

app = Flask(__name__)
@app.after_request
def add_header(response):
    # Добавляем заголовки для отключения кэша
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "-1"
    return response
# Подключение к MongoDB
try:
    client = MongoClient("mongodb+srv://krikpro12:fawd1HFW5Y8Rj8xN@vkr.nsfiu.mongodb.net/?retryWrites=true&w=majority&appName=VKR")
    db = client['VKR']
    articles_collection = db['research_paper']
    topics_collection = db['LDA_results']
    client.admin.command('ping')  # Проверка подключения
    print("Подключение к MongoDB успешно.")
except Exception as e:
    print(f"Ошибка подключения к MongoDB: {e}")
    raise

# Главная страница
@app.route('/')
def index():
    return render_template('index.html')

# Маршрут для проверки соединения с базой
@app.route('/api/healthcheck', methods=['GET'])
def healthcheck():
    try:
        doc = articles_collection.find_one()
        return jsonify({"status": "ok", "sample_document": doc})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API для получения статей
@app.route('/api/articles', methods=['GET'])
def get_articles():
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        skip = (page - 1) * per_page

        articles_cursor = articles_collection.find(
            {},
            {
                "title": 1,
                "authors": 1,
                "abstract": 1,
                "yearPublished": 1,
                "doi": 1,
                "publisher": 1,
                "journals": 1,
                "downloadUrl": 1
            }
        ).skip(skip).limit(per_page)

        articles = [
            {
                "title": article.get("title", "Untitled"),
                "authors": ", ".join(
                    [
                        str(author.get("name", "Unknown")) if isinstance(author, dict) else str(author)
                        for author in article.get("authors", [])
                        if author and isinstance(author, (dict, str))
                    ]
                ) if "authors" in article and article.get("authors") else "No authors",
                "abstract": article.get("abstract", "No abstract available"),
                "yearPublished": article.get("yearPublished", "Unknown"),
                "doi": article.get("doi", "Not available"),
                "publisher": article.get("publisher", "Unknown"),
                "journals": ", ".join(
                    [
                        journal.get("title", "Unknown Journal") if isinstance(journal, dict) and journal.get("title") else "Unknown Journal"
                        for journal in article.get("journals", [])
                        if journal
                    ]
                ) if "journals" in article and article.get("journals") else "Not specified",
                "downloadUrl": article.get("downloadUrl", "#")
            }
            for article in articles_cursor
        ]

        total_count = articles_collection.count_documents({})

        return jsonify({
            "articles": articles,
            "total_count": total_count,
            "page": page,
            "per_page": per_page
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# API для получения распределения тем
@app.route('/api/topics_distribution', methods=['GET'])
def topics_distribution():
    year = request.args.get('year')
    category = request.args.get('category')

    if not year or not category:
        return jsonify({"error": "Year and Category are required"}), 400

    try:
        query = {"year": year, "category": category}
        topics_cursor = topics_collection.find(query)

        topics = [
            {
                "name": topic.get("name", "Unknown Topic"),
                "trend": topic.get("trend", 0),
                "description": topic.get("description", "No description available"),
                "keywords": topic.get("keywords", [])
            }
            for topic in topics_cursor
        ]

        return jsonify(topics)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# API для получения трендов схожих тем
@app.route('/api/similar_topics_trends', methods=['GET'])
def similar_topics_trends():
    topic_name = request.args.get('topic_name')
    category = request.args.get('category')
    threshold = float(request.args.get('threshold', 0.65))  # По умолчанию 0.65

    if not topic_name or not category:
        return jsonify({"error": "Topic name and Category are required"}), 400

    try:
        # Получаем все темы по категории
        topics_cursor = topics_collection.find({"category": category})
        topics = list(topics_cursor)

        # Поиск текущей темы
        current_topic = next((topic for topic in topics if topic["name"] == topic_name), None)
        if not current_topic:
            return jsonify({"error": f"Topic '{topic_name}' not found in category '{category}'"}), 404

        current_keywords = " ".join([kw[0] for kw in current_topic["keywords"]])

        # Подготовка ключевых слов всех тем для TF-IDF
        topic_keywords = [" ".join([kw[0] for kw in topic["keywords"]]) for topic in topics]

        # Вычисляем TF-IDF и косинусное сходство
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(topic_keywords)
        current_vector = vectorizer.transform([current_keywords])
        similarity_scores = cosine_similarity(current_vector, tfidf_matrix)[0]

        # Выбираем схожие темы по порогу схожести
        similar_topics = [
            {
                "name": topics[idx]["name"],
                "year": topics[idx]["year"],
                "trend": topics[idx].get("trend", 0),
                "similarity": similarity
            }
            for idx, similarity in enumerate(similarity_scores)
            if similarity >= threshold
        ]

        # Сортируем по году
        similar_topics_sorted = sorted(similar_topics, key=lambda x: x["year"])

        return jsonify({"similar_topics": similar_topics_sorted, "similarity_threshold": threshold})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/topics_heatmap', methods=['GET'])
def topics_heatmap():
    category_filter = request.args.get('category', None)  # Опциональный фильтр
    try:
        query = {}
        if category_filter:
            query['category'] = category_filter

        # Получение данных из MongoDB
        topics_cursor = topics_collection.find(query, {"name": 1, "year": 1, "trend": 1, "category": 1})
        topics = list(topics_cursor)

        # Группировка данных для тепловой карты
        heatmap_data = {}
        for topic in topics:
            year = topic.get('year', 'Unknown')
            category = topic.get('category', 'Unknown')
            trend = topic.get('trend', 0)

            if (year, category) not in heatmap_data:
                heatmap_data[(year, category)] = {"total_trend": 0, "count": 0}

            heatmap_data[(year, category)]["total_trend"] += trend
            heatmap_data[(year, category)]["count"] += 1

        # Рассчитываем среднюю важность для каждой пары "Год-Категория"
        heatmap_list = [
            {"year": year, "category": category, "avg_trend": trend_data["total_trend"] / trend_data["count"]}
            for (year, category), trend_data in heatmap_data.items()
        ]

        print("Сформированные данные для тепловой карты:", heatmap_list)

        return jsonify(heatmap_list)

    except Exception as e:
        print("Ошибка API тепловой карты:", str(e))
        return jsonify({"error": str(e)}), 500
@app.route('/api/top_topics_per_year', methods=['GET'])
def top_topics_per_year():
    try:
        # Получение всех тем из коллекции
        topics_cursor = topics_collection.find({}, {"name": 1, "year": 1, "trend": 1, "description": 1, "category": 1})
        topics_by_year = {}

        # Группируем темы по годам
        for topic in topics_cursor:
            year = topic.get('year')
            if not year:  # Пропускаем темы без года
                print(f"Пропущена тема без года: {topic}")  # Логируем пропущенные темы
                continue
            if year not in topics_by_year:
                topics_by_year[year] = []
            topics_by_year[year].append(topic)

        print(f"Темы по годам: {list(topics_by_year.keys())}")  # Проверяем ключи

        # Находим топ-10 тем для каждого года по тренду
        top_topics = {
            year: sorted(topics, key=lambda t: t.get('trend', 0), reverse=True)[:10]
            for year, topics in topics_by_year.items()
        }

        # Подготовка данных для ответа
        response = {
            year: [
                {
                    "name": topic.get("name", "Unknown"),
                    "trend": topic.get("trend", 0),
                    "description": topic.get("description", "No description available"),
                    "category": topic.get("category", "Unknown")
                }
                for topic in topics
            ]
            for year, topics in top_topics.items()
        }

        print(f"Подготовленные данные для API: {response}")  # Логируем итоговый ответ
        return jsonify(response)
    except Exception as e:
        print(f"Ошибка в API /api/top_topics_per_year: {e}")
        return jsonify({"error": str(e)}), 500

# API для генерации облака ключевых слов
@app.route('/api/wordcloud', methods=['GET'])
def generate_wordcloud():
    category = request.args.get('category', None)
    year = request.args.get('year', None)

    try:
        # Формируем запрос для MongoDB
        query = {}
        if category:
            query["category"] = category
        if year:
            query["year"] = year

        # Запрос тем из базы данных
        topics_cursor = topics_collection.find(query, {"keywords": 1})
        
        # Извлекаем ключевые слова и их веса
        word_frequencies = {}
        for topic in topics_cursor:
            for keyword, weight in topic.get("keywords", []):
                word_frequencies[keyword] = word_frequencies.get(keyword, 0) + weight

        if not word_frequencies:
            return jsonify({"error": "Нет данных для генерации облака ключевых слов"}), 404

        # Генерация облака
        wordcloud = WordCloud(width=800, height=400, background_color="white").generate_from_frequencies(word_frequencies)

        # Сохранение облака в файл
        output_path = os.path.join("static", "wordcloud.png")
        wordcloud.to_file(output_path)
        print(f"Файл wordcloud.png успешно перезаписан в {output_path}")

        return jsonify({"message": "Облако ключевых слов создано", "image_url": "/static/wordcloud.png"})
    except Exception as e:
        print(f"Ошибка генерации облака ключевых слов: {e}")
        return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(debug=True)
