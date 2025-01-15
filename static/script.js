
document.addEventListener('DOMContentLoaded', () => {
    const perPage = 10; // Количество статей на странице
    let currentPage = 1;
    let selectedTopicName = null; // Сохранённая тема
    let selectedCategory = null; // Сохранённая категория

    const defaultYear = '2018'; // Год по умолчанию
    const defaultCategory = 'ALGORITHM'; // Категория по умолчанию

    // Установка значений по умолчанию в селекторы
    const yearSelector = document.getElementById('year-selector');
    const categorySelector = document.getElementById('category-selector');
    const wordcloudImage = document.getElementById('wordcloud-image');

    
    if (yearSelector && categorySelector) {
        yearSelector.value = defaultYear;
        categorySelector.value = defaultCategory;
    } else {
        console.error("Не удалось найти селекторы года или категории.");
        return;
    }

    // Проверяем наличие ключевых элементов
    if (!document.getElementById('top-topics-chart')) {
        console.error("Элемент #top-topics-chart не найден в DOM.");
        return;
    }
    if (!document.getElementById('heatmap-chart')) {
        console.error("Элемент #heatmap-chart не найден в DOM.");
        return;
    }
    if (!document.getElementById('wordcloud-image')) {
        console.error("Элемент #wordcloud-image не найден в DOM.");
        return;
    }

	function loadWordCloud(category, year) {
		console.log(`Запрос на обновление облака ключевых слов: категория=${category}, год=${year}`);
		fetch(`/api/wordcloud?category=${category || ""}&year=${year || ""}`)
			.then(response => response.json())
			.then(data => {
				if (data.image_url) {
					const wordcloudImage = document.getElementById('wordcloud-image');
					if (wordcloudImage) {
						const newSrc = data.image_url + `?t=${new Date().getTime()}`;
						wordcloudImage.src = newSrc;
						console.log(`Обновлено src для #wordcloud-image: ${newSrc}`);
					} else {
						console.error("Элемент #wordcloud-image не найден.");
					}
				} else {
					console.error("Ошибка API:", data.error || "Неизвестная ошибка");
				}
			})
			.catch(error => console.error("Ошибка при запросе API облака ключевых слов:", error));
	}

    // Функция загрузки тепловой карты
    function loadHeatmap(category) {
        console.log(`Загрузка тепловой карты для категории: ${category}`);
        const url = category ? `/api/topics_heatmap?category=${encodeURIComponent(category)}` : '/api/topics_heatmap';

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (!data || data.length === 0) {
                    document.getElementById('heatmap-chart').innerHTML = '<p class="text-center">Нет данных для отображения</p>';
                    return;
                }

                const years = [...new Set(data.map(item => item.year))].sort();
                const categories = [...new Set(data.map(item => item.category))].sort();

                const z = categories.map(category =>
                    years.map(year => {
                        const match = data.find(item => item.year === year && item.category === category);
                        return match ? match.avg_trend : 0;
                    })
                );

                const heatmapData = [{
                    z: z,
                    x: years,
                    y: categories,
                    type: 'heatmap',
                    colorscale: 'Viridis',
                    colorbar: { title: 'Средняя важность' }
                }];

                const layout = {
                    title: 'Тепловая карта популярности тем',
                    xaxis: { title: 'Год' },
                    yaxis: { title: 'Категория' },
                    margin: { l: 100, r: 50, b: 50, t: 50 }
                };

                Plotly.newPlot('heatmap-chart', heatmapData, layout);
            })
            .catch(error => {
                console.error('Ошибка при загрузке тепловой карты:', error);
                document.getElementById('heatmap-chart').innerHTML = '<p class="text-center text-danger">Ошибка загрузки данных.</p>';
            });
    }

    // Функция обработки изменения фильтров
    function handleFilterChange() {
        const selectedYear = yearSelector.value;
        const selectedCategory = categorySelector.value;

        console.log(`Изменение фильтров: год - ${selectedYear}, категория - ${selectedCategory}`);

        // Обновление всех графиков и облака ключевых слов
        loadWordCloud(selectedCategory, selectedYear);
        loadHeatmap(selectedCategory);
        loadPieChart(selectedYear, selectedCategory);
        loadTopTopicsPerYear(selectedYear);
    }

    // Обработчики изменения фильтров
    yearSelector.addEventListener('change', handleFilterChange);
    categorySelector.addEventListener('change', handleFilterChange);
    // Инициализация данных по умолчанию
    handleFilterChange();

    // Открытие модального окна с деталями статьи
    function openModal(article) {
        document.getElementById('modal-title').textContent = article.title || 'Без названия';
        document.getElementById('modal-authors').textContent = article.authors || 'Неизвестно';
        document.getElementById('modal-year').textContent = article.yearPublished || 'Неизвестно';
        document.getElementById('modal-doi').textContent = article.doi || 'Нет данных';
        document.getElementById('modal-publisher').textContent = article.publisher || 'Неизвестно';
        document.getElementById('modal-journals').textContent = article.journals || 'Не указано';
        document.getElementById('modal-abstract').textContent = article.abstract || 'Нет аннотации';

        const modal = new bootstrap.Modal(document.getElementById('articleModal'));
        modal.show();
    }

    // Загрузка статей
    window.loadArticles = function (page = 1) {
        fetch(`http://127.0.0.1:5000/api/articles?page=${page}&per_page=${perPage}`)
            .then(response => response.json())
            .then(data => {
                const articlesList = document.getElementById('articles-list');
                const pagination = document.getElementById('pagination');

                articlesList.innerHTML = '';
                pagination.innerHTML = '';

                if (data.articles && data.articles.length > 0) {
                    data.articles.forEach(article => {
                        const articleElement = document.createElement('div');
                        articleElement.classList.add('card', 'mb-3');

                        const shortAbstract = article.abstract
                            ? article.abstract.length > 200
                                ? `${article.abstract.slice(0, 200)}...`
                                : article.abstract
                            : 'Нет аннотации';

                        articleElement.innerHTML = `
                            <div class="card-body">
                                <h5 class="card-title">${article.title || 'Без названия'}</h5>
                                <p class="card-text"><strong>Авторы:</strong> ${article.authors || 'Неизвестно'}</p>
                                <p class="card-text"><strong>Год публикации:</strong> ${article.yearPublished || 'Неизвестно'}</p>
                                <p class="card-text"><strong>Аннотация:</strong> ${shortAbstract}</p>
                                <button class="btn btn-info btn-details" data-id="${article.id}">Подробнее</button>
                            </div>
                        `;
                        articlesList.appendChild(articleElement);

                        const detailsButton = articleElement.querySelector('.btn-details');
                        detailsButton.addEventListener('click', () => openModal(article));
                    });

                    const totalPages = Math.ceil(data.total_count / perPage);
                    renderPagination(page, totalPages);
                } else {
                    articlesList.innerHTML = '<p class="text-center">Нет данных для отображения</p>';
                }
            })
            .catch(error => console.error('Ошибка при загрузке статей:', error));
    };

    // Рендеринг пагинации
    function renderPagination(currentPage, totalPages) {
        const pagination = document.getElementById('pagination');
        pagination.innerHTML = '';

        const prevItem = document.createElement('li');
        prevItem.classList.add('page-item');
        if (currentPage === 1) prevItem.classList.add('disabled');
        prevItem.innerHTML = `
            <a class="page-link" href="#" aria-label="Предыдущая" onclick="loadArticles(${currentPage - 1})">&laquo;</a>
        `;
        pagination.appendChild(prevItem);

        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const pageItem = document.createElement('li');
            pageItem.classList.add('page-item');
            if (i === currentPage) pageItem.classList.add('active');
            pageItem.innerHTML = `
                <a class="page-link" href="#" onclick="loadArticles(${i})">${i}</a>
            `;
            pagination.appendChild(pageItem);
        }

        const nextItem = document.createElement('li');
        nextItem.classList.add('page-item');
        if (currentPage === totalPages) nextItem.classList.add('disabled');
        nextItem.innerHTML = `
            <a class="page-link" href="#" aria-label="Следующая" onclick="loadArticles(${currentPage + 1})">&raquo;</a>
        `;
        pagination.appendChild(nextItem);
    }

    // Загрузка круговой диаграммы
    function loadPieChart(year, category) {
        fetch(`/api/topics_distribution?year=${year}&category=${category}`)
            .then(response => response.json())
            .then(data => {
                const pieChartDiv = document.getElementById('pie-chart');
                if (!data || data.length === 0) {
                    pieChartDiv.innerHTML = '<p class="text-center">Нет данных для отображения</p>';
                    return;
                }

                const labels = data.map(topic => topic.name || 'Без названия');
                const values = data.map(topic => topic.trend || 0);

                Plotly.newPlot(pieChartDiv, [{
                    labels: labels,
                    values: values,
                    type: 'pie',
                    textinfo: 'label+percent',
                    hoverinfo: 'label+value+percent'
                }], {
                    title: `Распределение тем (${year}, ${category})`
                });

                pieChartDiv.on('plotly_click', function (eventData) {
                    const clickedName = eventData.points[0]?.label;
                    if (!clickedName) return console.error('Сегмент не выбран.');

                    const selectedTopic = data.find(topic => topic.name === clickedName);
                    if (!selectedTopic) return console.error(`Тема "${clickedName}" не найдена.`);

                    updateTopicDetails(selectedTopic);
                    selectedTopicName = clickedName;
                    selectedCategory = category;
                    loadSimilarTrendChart(clickedName, category);
                });
            })
            .catch(error => console.error('Ошибка при загрузке круговой диаграммы:', error));
    }

    // Обновление деталей темы
    function updateTopicDetails(topic) {
        document.getElementById('topicModalLabel').textContent = topic.name || 'Без названия';
        document.getElementById('modal-description').textContent = topic.description || 'Нет описания.';
        document.getElementById('modal-keywords').textContent = topic.keywords
            ? topic.keywords.map(([keyword, value]) => `${keyword} (${value.toFixed(2)})`).join(', ')
            : 'Нет ключевых слов.';
    }

    // Загрузка трендов схожих тем
    function loadSimilarTrendChart(topicName, category) {
        const threshold = document.getElementById('similarity-threshold').value;
        fetch(`/api/similar_topics_trends?topic_name=${encodeURIComponent(topicName)}&category=${encodeURIComponent(category)}&threshold=${threshold}`)
            .then(response => response.json())
            .then(data => {
                const similarTrendChartDiv = document.getElementById('similar-trend-chart');
                if (!data || !Array.isArray(data.similar_topics) || data.similar_topics.length === 0) {
                    similarTrendChartDiv.innerHTML = '<p class="text-center">Тема уникальна, данных для сравнения нет.</p>';
                    return;
                }

                const validData = data.similar_topics.filter(item => item.year && item.trend !== undefined);
                const x = validData.map(item => item.year);
                const y = validData.map(item => item.trend);

                Plotly.newPlot(similarTrendChartDiv, [{
                    x: x,
                    y: y,
                    mode: 'lines+markers',
                    name: topicName
                }], {
                    title: `Тренд развития схожих тем: ${topicName}`,
                    xaxis: { title: 'Год' },
                    yaxis: { title: 'Важность' }
                });
            })
            .catch(error => console.error('Ошибка при загрузке графика трендов схожих тем:', error));
    }
	function loadHeatmap(category = null) {
		const url = category ? `/api/topics_heatmap?category=${encodeURIComponent(category)}` : '/api/topics_heatmap';

		fetch(url)
			.then(response => response.json())
			.then(data => {
				console.log("Полученные данные для тепловой карты:", data);

				if (!data || data.length === 0) {
					document.getElementById('heatmap-chart').innerHTML = '<p class="text-center">Нет данных для отображения</p>';
					return;
				}

				// Получение уникальных годов и категорий
				const years = [...new Set(data.map(item => item.year))].sort();
				const categories = [...new Set(data.map(item => item.category))].sort();

				// Формирование данных для оси Z
				const z = categories.map(category =>
					years.map(year => {
						const match = data.find(item => item.year === year && item.category === category);
						return match ? match.avg_trend : 0;
					})
				);

				console.log("Данные для Plotly:", { z, x: years, y: categories });

				// Построение тепловой карты
				const heatmapData = [{
					z: z,
					x: years,
					y: categories,
					type: 'heatmap',
					colorscale: 'Viridis',
					colorbar: { title: 'Средняя важность' }
				}];

				const layout = {
					title: 'Тепловая карта популярности тем',
					xaxis: { title: 'Год' },
					yaxis: { title: 'Категория' },
					margin: { l: 100, r: 50, b: 50, t: 50 }
				};

				Plotly.newPlot('heatmap-chart', heatmapData, layout);
			})
			.catch(error => {
				console.error('Ошибка при загрузке тепловой карты:', error);
				document.getElementById('heatmap-chart').innerHTML = '<p class="text-center text-danger">Ошибка загрузки данных.</p>';
			});
	}

    function loadTopTopicsPerYear() {
        const topTopicsDiv = document.getElementById('top-topics-chart');
        if (!topTopicsDiv) {
            console.error('Контейнер для графика не найден.');
            return;
        }

        const yearSelector = document.getElementById('year-selector');
        if (!yearSelector) {
            console.error('Выбор года не найден.');
            return;
        }

        fetch('/api/top_topics_per_year')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Ошибка API: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log("Полученные данные для графика:", data); // Проверка данных из API
                
                // Проверяем, что данные не пусты и содержат ожидаемые ключи
                if (!data || Object.keys(data).length === 0) {
                    console.error("Данные API пустые или отсутствуют.");
                    topTopicsDiv.innerHTML = '<p class="text-danger">Нет данных для отображения.</p>';
                    return;
                }

                function updateGraph(selectedYear) {
                    console.log(`Обновление графика для года: ${selectedYear}`);
                    const topics = data[selectedYear] || [];
                    console.log("Темы для выбранного года:", topics);

                    if (!topics.length) {
                        console.warn("Нет данных для выбранного года.");
                        topTopicsDiv.innerHTML = '<p>Нет данных для выбранного года.</p>';
                        return;
                    }

                    const trace = {
                        x: topics.map(t => t.name),
                        y: topics.map(t => t.trend),
                        text: topics.map(t => `Описание: ${t.description}<br>Категория: ${t.category}`),
                        type: 'bar',
                        hoverinfo: 'text'
                    };

                    const layout = {
                        title: `Топ-10 Тем для ${selectedYear}`,
                        xaxis: { title: 'Темы' },
                        yaxis: { title: 'Важность' },
                        height: 500
                    };

                    try {
                        Plotly.newPlot(topTopicsDiv, [trace], layout);
                    } catch (error) {
                        console.error("Ошибка отрисовки Plotly:", error);
                        topTopicsDiv.innerHTML = '<p>Ошибка отрисовки графика.</p>';
                    }
                }

                const initialYear = yearSelector.value;
                console.log(`Инициализация графика для года: ${initialYear}`);
                updateGraph(initialYear);

                yearSelector.addEventListener('change', () => {
                    const selectedYear = yearSelector.value;
                    console.log(`Выбранный год: ${selectedYear}`);
                    updateGraph(selectedYear);
                });
            })
            .catch(error => {
                console.error("Ошибка при загрузке данных:", error);
                topTopicsDiv.innerHTML = '<p class="text-danger">Ошибка загрузки данных.</p>';
            });
    }

    loadTopTopicsPerYear();
// Функция загрузки облака ключевых слов
function loadWordCloud(category, year) {
    fetch(`/api/wordcloud?category=${category || ""}&year=${year || ""}`)
        .then(response => response.json())
        .then(data => {
            if (data.image_url) {
                document.getElementById("wordcloud-image").src = data.image_url;
            } else {
                console.error("Ошибка загрузки облака ключевых слов:", data.error);
            }
        })
        .catch(error => console.error("Ошибка при запросе облака ключевых слов:", error));
}




	document.getElementById('category-selector').addEventListener('change', () => {
		const category = document.getElementById('category-selector').value;
		loadHeatmap(category);
	});

    // Обновление графика при изменении уровня схожести
    document.getElementById('similarity-threshold').addEventListener('input', () => {
        const similarityValue = document.getElementById('similarity-threshold').value;
        document.getElementById('similarity-value').textContent = similarityValue;

        if (selectedTopicName && selectedCategory) {
            loadSimilarTrendChart(selectedTopicName, selectedCategory);
        }
    });

    // Обработчики изменения фильтров
    document.getElementById('year-selector').addEventListener('change', () => {
        const year = document.getElementById('year-selector').value;
        const category = document.getElementById('category-selector').value;
        loadPieChart(year, category);
    });

    document.getElementById('category-selector').addEventListener('change', () => {
        const year = document.getElementById('year-selector').value;
        const category = document.getElementById('category-selector').value;
        loadPieChart(year, category);
    });
	document.getElementById('year-selector').addEventListener('change', () => {
    const year = document.getElementById('year-selector').value;
    const category = document.getElementById('category-selector').value;
    loadWordCloud(category, year);
});

	document.getElementById('category-selector').addEventListener('change', () => {
    const year = document.getElementById('year-selector').value;
    const category = document.getElementById('category-selector').value;
    loadWordCloud(category, year);
});

    // Инициализация
    const initialYear = document.getElementById('year-selector').value;
    const initialCategory = document.getElementById('category-selector').value;
    loadArticles(currentPage);
    loadPieChart(initialYear, initialCategory);
});
