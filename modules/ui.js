import { domElements } from './dom.js';
import { formatNumber, formatShort, debounce, DEBOUNCE_DELAYS } from './utils.js';
import { transactions } from './state.js';
import { SecurityHelper } from '../config.js';
import { updateHome, updateDollarSavings } from './analytics.js';

// Функции навигации и отображения
export function show(sectionId) {
    // Скрываем все секции
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    
    // Показываем нужную секцию
    const section = document.getElementById(sectionId);
    if (section) section.style.display = 'block';

    // Обновляем активную кнопку навигации
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.bottom-nav button[onclick="show('${sectionId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Выполняем специфичные для секции действия
    if (sectionId === 'list') {
        renderAllListDebounced();
    } else if (sectionId === 'add') {
        renderRecentList();
    } else if (sectionId === 'analytics') {
        updateAnalytics();
    } else if (sectionId === 'home') {
        updateDollarSavings();
        updateHome();
    }
}

// Уведомления
export function showError(message) {
    console.error('❌ Error:', message);
    // Временное решение - можно заменить на красивый toast
    alert(`❌ ${message}`);
}

export function showSuccess(message) {
    console.log('✅ Success:', message);
    // Временное решение - можно заменить на красивый toast
    alert(`✅ ${message}`);
}

export function showLoadingIndicator(show) {
    if (domElements.refreshIndicator) {
        domElements.refreshIndicator.style.opacity = show ? '1' : '0';
    }
}

// Тема
export function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', isDark);
}

// Обновление выпадающих списков
export function updateDropdowns() {
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const categories = [...new Set(regularTransactions.map(t => SecurityHelper.sanitizeInput(t.category)))].sort();
    const authors = [...new Set(regularTransactions.map(t => SecurityHelper.sanitizeInput(t.author)))].sort();

    const updateSelect = (select, values) => {
        if (!select) return;
        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    };

    updateSelect(domElements.categoriesSelect, categories);
    updateSelect(domElements.editCategoriesSelect, categories);
    updateSelect(domElements.authorsSelect, authors);
    updateSelect(domElements.editAuthorsSelect, authors);
}

// Создание элемента списка транзакций
export function createTransactionListItem(tx) {
    const li = document.createElement('li');
    
    const container = document.createElement('div');
    
    // Основная информация
    const mainInfo = document.createElement('div');
    
    const categoryEl = document.createElement('strong');
    categoryEl.textContent = SecurityHelper.sanitizeInput(tx.category);
    
    const amountSpan = document.createElement('span');
    const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
    const sign = tx.type === 'income' ? '+' : '-';
    const currencySymbol = tx.isDollarSavings ? '$' : '₽';
    amountSpan.textContent = `${sign}${formatNumber(tx.amount)} ${currencySymbol}`;
    amountSpan.style.cssText = `color: ${amountColor}; font-weight: bold; margin-left: 8px;`;
    
    mainInfo.appendChild(categoryEl);
    mainInfo.appendChild(amountSpan);
    
    // Дополнительная информация
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';
    infoDiv.textContent = `${tx.date} · ${SecurityHelper.sanitizeInput(tx.author)}`;
    
    container.appendChild(mainInfo);
    container.appendChild(infoDiv);
    
    // Комментарий (если есть)
    if (tx.comment && tx.comment.trim()) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'info';
        commentDiv.textContent = `💬 ${SecurityHelper.sanitizeInput(tx.comment)}`;
        container.appendChild(commentDiv);
    }
    
    // Действия
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';
    
    const editButton = document.createElement('button');
    editButton.className = 'btn small';
    editButton.onclick = () => startEdit(tx.id);
    
    const editIcon = document.createElement('img');
    editIcon.src = 'icons/edit.png';
    editIcon.alt = 'Редактировать';
    editIcon.className = 'action-icon';
    editButton.appendChild(editIcon);
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn small danger';
    deleteButton.onclick = () => deleteTransaction(tx.id);
    
    const deleteIcon = document.createElement('img');
    deleteIcon.src = 'icons/delete.png';
    deleteIcon.alt = 'Удалить';
    deleteIcon.className = 'action-icon';
    deleteButton.appendChild(deleteIcon);
    
    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(deleteButton);
    
    li.appendChild(container);
    li.appendChild(actionsDiv);
    
    return li;
}

// Последние 10 операций
export function renderRecentList() {
    if (!domElements.recentTransactions) return;
    
    if (!transactions || !Array.isArray(transactions)) {
        domElements.recentTransactions.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Загрузка...';
        li.style.color = '#999';
        domElements.recentTransactions.appendChild(li);
        return;
    }
    
    domElements.recentTransactions.innerHTML = '';
    const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    
    if (recent.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций';
        li.style.color = '#999';
        domElements.recentTransactions.appendChild(li);
        return;
    }
    
    recent.forEach(tx => {
        domElements.recentTransactions.appendChild(createTransactionListItem(tx));
    });
}

// История операций
export function renderAllList() {
    if (!domElements.allTransactions) return;
    
    if (!transactions || !Array.isArray(transactions)) {
        domElements.allTransactions.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Загрузка данных...';
        li.style.color = '#999';
        domElements.allTransactions.appendChild(li);
        return;
    }
    
    domElements.allTransactions.innerHTML = '';
    
    const start = domElements.filterStartInput?.value;
    const end = domElements.filterEndInput?.value;
    if (start) localStorage.setItem('filter-start', start);
    if (end) localStorage.setItem('filter-end', end);
    
    let filtered = transactions;
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);
    
    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций за выбранный период';
        li.style.color = '#999';
        domElements.allTransactions.appendChild(li);
        return;
    }
    
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(tx => {
        domElements.allTransactions.appendChild(createTransactionListItem(tx));
    });
}

// Debounced версии функций
export const renderAllListDebounced = debounce(renderAllList, DEBOUNCE_DELAYS.RENDER_LIST);

// Обновление UI
export function updateUI() {
    renderRecentList();
    updateHome();
    updateDollarSavings();
    updateDropdowns();
    if (isSectionActive('analytics')) updateAnalytics();
    if (isSectionActive('list')) renderAllListDebounced();
}

export const updateUIDebounced = debounce(updateUI, DEBOUNCE_DELAYS.UI_UPDATE);

// Вспомогательные функции
export function isSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return section && section.style.display !== 'none';
}

// Импорты функций из других модулей (будут реализованы позже)
import { startEdit, deleteTransaction } from './transactions.js';
import { updateAnalytics } from './analytics.js';
